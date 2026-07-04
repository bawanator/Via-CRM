// diffAuditEntry turns an audit_log row's before/after jsonb into a
// field-level change list for the audit UI. Row-meta noise must never appear;
// jsonb values are compared structurally, not by reference.
import { describe, expect, it } from "vitest";
import { diffAuditEntry } from "@/lib/crm/audit";

function fields(entry: Parameters<typeof diffAuditEntry>[0]): string[] {
  return diffAuditEntry(entry)
    .map((c) => c.field)
    .sort();
}

describe("diffAuditEntry", () => {
  it("reports exactly the changed fields on an update, ignoring updated_at/updated_by noise", () => {
    const entry = {
      before: {
        id: "b1",
        full_name: "Jane O'Brien",
        stage: "introduced",
        notes: null,
        updated_at: "2025-06-01T00:00:00Z",
        updated_by: "user-a",
        created_at: "2025-01-01T00:00:00Z",
        created_by: "user-a",
      },
      after: {
        id: "b1",
        full_name: "Jane O'Brien",
        stage: "engaged",
        notes: "Met for coffee",
        updated_at: "2025-06-02T00:00:00Z",
        updated_by: "user-b",
        created_at: "2025-01-01T00:00:00Z",
        created_by: "user-a",
      },
    };

    const changes = diffAuditEntry(entry);
    expect(fields(entry)).toEqual(["notes", "stage"]);
    expect(changes.find((c) => c.field === "stage")).toEqual({
      field: "stage",
      before: "introduced",
      after: "engaged",
    });
    expect(changes.find((c) => c.field === "notes")).toEqual({
      field: "notes",
      before: null,
      after: "Met for coffee",
    });
  });

  it("lists the after fields for an insert (before is null), with null befores", () => {
    const entry = {
      before: null,
      after: {
        id: "d1",
        name: "12 Smith St bridge",
        status: "live",
        created_at: "2025-06-01T00:00:00Z",
        updated_at: "2025-06-01T00:00:00Z",
      },
    };

    const changes = diffAuditEntry(entry);
    expect(fields(entry)).toEqual(["id", "name", "status"]); // meta noise excluded
    for (const change of changes) {
      expect(change.before).toBeNull();
    }
    expect(changes.find((c) => c.field === "name")?.after).toBe("12 Smith St bridge");
  });

  it("lists the before fields for a delete (after is null), with null afters", () => {
    const entry = {
      before: {
        id: "k1",
        label: "First interest payment",
        completed: false,
        created_by: "user-a",
      },
      after: null,
    };

    const changes = diffAuditEntry(entry);
    expect(fields(entry)).toEqual(["completed", "id", "label"]);
    for (const change of changes) {
      expect(change.after).toBeNull();
    }
    expect(changes.find((c) => c.field === "label")?.before).toBe("First interest payment");
  });

  it("compares nested jsonb-ish values structurally", () => {
    const unchanged = {
      before: { id: "x", meta: { tags: ["bridge", "nsw"], score: 3 } },
      after: { id: "x", meta: { tags: ["bridge", "nsw"], score: 3 } },
    };
    // Distinct object instances with equal structure are NOT a change.
    expect(diffAuditEntry(unchanged)).toEqual([]);

    const changed = {
      before: { id: "x", meta: { tags: ["bridge"], score: 3 } },
      after: { id: "x", meta: { tags: ["bridge", "nsw"], score: 3 } },
    };
    expect(diffAuditEntry(changed)).toEqual([
      {
        field: "meta",
        before: { tags: ["bridge"], score: 3 },
        after: { tags: ["bridge", "nsw"], score: 3 },
      },
    ]);
  });

  it("treats a missing key and an explicit null as the same value", () => {
    expect(diffAuditEntry({ before: { notes: null }, after: {} })).toEqual([]);
    expect(diffAuditEntry({ before: {}, after: { notes: null } })).toEqual([]);
  });

  it("returns [] for an unchanged row", () => {
    const row = { id: "b1", full_name: "Tom Nguyen", stage: "prime", email: "tom@lendline.com.au" };
    expect(diffAuditEntry({ before: { ...row }, after: { ...row } })).toEqual([]);
  });

  it("returns [] when the only differences are meta noise", () => {
    const entry = {
      before: { id: "b1", stage: "prime", updated_at: "2025-06-01T00:00:00Z", updated_by: "a" },
      after: { id: "b1", stage: "prime", updated_at: "2025-06-09T00:00:00Z", updated_by: "b" },
    };
    expect(diffAuditEntry(entry)).toEqual([]);
  });
});
