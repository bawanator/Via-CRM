// Pure Attio-import logic: CSV parsing heuristics and the dedupe/stage plan.
// The one guarantee that matters most is idempotency — running the import
// twice against the same database produces zero creates the second time.
import { describe, expect, it } from "vitest";
import type { AttioPerson } from "../scripts/attio";
import { normaliseStage, parsePeopleCsv, parseStageMapping, planImport } from "../scripts/attio";

// Mirrors an Attio People export: BOM, split First/Last name columns, quoted
// cells containing commas, multi-value email and phone cells, a stage column,
// duplicates, and a fully-empty row.
const BOM = "\uFEFF";

const PEOPLE_CSV =
  BOM +
  [
    `First name,Last name,Email addresses,Phone numbers,Company,LinkedIn,Description,Stage`,
    `Jane,"O'Brien","Jane@BrokerCo.COM.au, jane.alt@brokerco.com.au","+61 400 111 222, +61 2 9999 0000","BrokerCo, Pty Ltd",linkedin.com/in/janeob,"Met at conference, keen on bridging",Active Submitter`,
    `Tom,Nguyen,TOM@lendline.com.au,,Lendline,,,`,
    `Priya,Patel,,,,,No email on file,`,
    `Priya,Patel,,,,,Duplicate no-email row,`,
    `Tom,Nguyen,tom@LENDLINE.com.au,,,,Duplicate email row,`,
    `,,,,,,,`,
  ].join("\n");

const noExisting = () => ({ emails: new Set<string>(), names: new Set<string>() });

function person(overrides: Partial<AttioPerson> & { fullName: string }): AttioPerson {
  return {
    email: null,
    company: null,
    phone: null,
    linkedin: null,
    description: null,
    stageOverride: null,
    ...overrides,
  };
}

describe("parsePeopleCsv", () => {
  const { people, skipped } = parsePeopleCsv(PEOPLE_CSV);

  it("parses every data row, skipping only the empty one", () => {
    expect(people).toHaveLength(5);
    expect(skipped).toEqual([{ row: 7, reason: "no name or email" }]);
  });

  it("joins split First/Last name columns", () => {
    expect(people[0].fullName).toBe("Jane O'Brien");
    expect(people[1].fullName).toBe("Tom Nguyen");
  });

  it("takes the first email from a multi-email cell, lowercased", () => {
    expect(people[0].email).toBe("jane@brokerco.com.au");
    expect(people[1].email).toBe("tom@lendline.com.au");
  });

  it("preserves quoted commas inside cells", () => {
    expect(people[0].company).toBe("BrokerCo, Pty Ltd");
    expect(people[0].description).toBe("Met at conference, keen on bridging");
  });

  it("keeps only the first phone number and prefixes scheme-less LinkedIn urls", () => {
    expect(people[0].phone).toBe("+61 400 111 222");
    expect(people[0].linkedin).toBe("https://linkedin.com/in/janeob");
  });

  it("normalises the stage column into a stage override", () => {
    expect(people[0].stageOverride).toBe("active_submitter");
    expect(people[1].stageOverride).toBeNull(); // empty stage cell
  });

  it("survives the BOM: the first header column is still detected", () => {
    // If the BOM leaked into the first header ("﻿First name"), the name
    // split would break for every row. Also check a BOM before a bare "Name"
    // header, where exact-match detection ("h === 'name'") is load-bearing.
    const single = parsePeopleCsv(BOM + "Name,Email\nSolo Broker,solo@x.com\n");
    expect(single.people).toEqual([
      person({ fullName: "Solo Broker", email: "solo@x.com" }),
    ]);
  });

  it("falls back to the email as full_name when the name is missing", () => {
    const { people: p } = parsePeopleCsv("Name,Email\n,orphan@x.com\n");
    expect(p).toHaveLength(1);
    expect(p[0].fullName).toBe("orphan@x.com");
  });
});

describe("parseStageMapping", () => {
  it("parses email→stage rows, tolerating a header and lowercasing emails", () => {
    const map = parseStageMapping("email,stage\nTOM@lendline.com.au,Engaged\njane@brokerco.com.au,prime\n");
    expect(map.get("tom@lendline.com.au")).toBe("engaged");
    expect(map.get("jane@brokerco.com.au")).toBe("prime");
    expect(map.size).toBe(2);
  });

  it("throws (with the row number) on an invalid stage instead of defaulting silently", () => {
    expect(() => parseStageMapping("email,stage\ntom@lendline.com.au,platinum\n")).toThrowError(/row 2.*platinum/);
  });
});

describe("normaliseStage", () => {
  it("accepts label-ish spellings and rejects unknown values", () => {
    expect(normaliseStage("Active Submitter")).toBe("active_submitter");
    expect(normaliseStage("active-submitter")).toBe("active_submitter");
    expect(normaliseStage(" PRIME ")).toBe("prime");
    expect(normaliseStage("vip")).toBeNull();
    expect(normaliseStage("")).toBeNull();
    expect(normaliseStage(null)).toBeNull();
  });
});

describe("planImport", () => {
  const stageMap = parseStageMapping(
    ["email,stage", "tom@lendline.com.au,Engaged", "jane@brokerco.com.au,introduced"].join("\n"),
  );

  it("plans creates for new people and dedupes within the CSV", () => {
    const { people } = parsePeopleCsv(PEOPLE_CSV);
    const plan = planImport(people, noExisting(), stageMap);

    expect(plan.creates.map((c) => c.full_name)).toEqual(["Jane O'Brien", "Tom Nguyen", "Priya Patel"]);
    expect(plan.skips.map((s) => s.reason)).toEqual([
      "duplicate name in CSV (no email to disambiguate)",
      "duplicate email in CSV (first occurrence wins)",
    ]);

    const jane = plan.creates[0];
    expect(jane.email).toBe("jane@brokerco.com.au");
    expect(jane.company).toBe("BrokerCo, Pty Ltd");
    expect(jane.linkedin_url).toBe("https://linkedin.com/in/janeob");
    expect(jane.notes).toBe("Met at conference, keen on bridging");
    expect(jane.source).toBe("Attio import");
  });

  it("is idempotent: re-running against the already-imported set plans zero creates", () => {
    const { people } = parsePeopleCsv(PEOPLE_CSV);
    const first = planImport(people, noExisting(), stageMap);
    expect(first.creates.length).toBeGreaterThan(0);

    // Simulate applying the first plan: the DB now knows these emails/names.
    const existing = {
      emails: new Set(first.creates.flatMap((c) => (c.email ? [c.email] : []))),
      names: new Set(first.creates.map((c) => c.full_name.trim().toLowerCase())),
    };

    const second = planImport(people, existing, stageMap);
    expect(second.creates).toHaveLength(0);
    expect(second.skips).toHaveLength(people.length);
    expect(second.skips.filter((s) => s.reason === "already imported")).toHaveLength(3); // jane, tom, tom-dup
  });

  it("keeps only the first occurrence of an in-CSV duplicate email", () => {
    const twins = [
      person({ fullName: "First Occurrence", email: "dup@x.com" }),
      person({ fullName: "Second Occurrence", email: "dup@x.com" }),
    ];
    const plan = planImport(twins, noExisting(), new Map());
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].full_name).toBe("First Occurrence");
    expect(plan.skips).toEqual([
      { person: twins[1], reason: "duplicate email in CSV (first occurrence wins)" },
    ]);
  });

  it("gives a CSV stage override precedence over the mapping file, then the mapping, then 'introduced'", () => {
    const people = [
      person({ fullName: "Override Wins", email: "override@x.com", stageOverride: "prime" }),
      person({ fullName: "Mapping Used", email: "mapped@x.com" }),
      person({ fullName: "Default Used", email: "unmapped@x.com" }),
    ];
    const map = parseStageMapping("override@x.com,engaged\nmapped@x.com,engaged\n");
    const plan = planImport(people, noExisting(), map);

    expect(plan.creates.map((c) => [c.full_name, c.stage])).toEqual([
      ["Override Wins", "prime"], // override beats the mapping's "engaged"
      ["Mapping Used", "engaged"],
      ["Default Used", "introduced"],
    ]);
  });

  it("skips a no-email person whose name already exists (nothing to disambiguate by)", () => {
    const people = [person({ fullName: "Priya Patel" })];
    const existing = { emails: new Set<string>(), names: new Set(["priya patel"]) };
    const plan = planImport(people, existing, new Map());

    expect(plan.creates).toHaveLength(0);
    expect(plan.skips).toEqual([
      { person: people[0], reason: "name already exists (no email to disambiguate)" },
    ]);
  });

  it("still creates a person with an existing name when they have a new email", () => {
    const people = [person({ fullName: "Priya Patel", email: "priya@new.com" })];
    const existing = { emails: new Set<string>(), names: new Set(["priya patel"]) };
    const plan = planImport(people, existing, new Map());
    expect(plan.creates).toHaveLength(1);
  });

  it("skips rows that fail brokerInputSchema validation instead of half-inserting them", () => {
    const people = [person({ fullName: "Bad Link", email: "bad@x.com", linkedin: "not a url" })];
    const plan = planImport(people, noExisting(), new Map());
    expect(plan.creates).toHaveLength(0);
    expect(plan.skips[0].reason).toMatch(/failed validation/);
  });
});
