"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SearchIcon } from "@/components/ui/icons";
import type { SearchResult } from "@/lib/crm/search";

// Global fast search: ⌘K on desktop, the Search tab slot on mobile.
export function CommandSearch({ mobile = false }: { mobile?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
      if (res.ok) {
        const data = (await res.json()) as { results: SearchResult[] };
        setResults(data.results);
        setHighlighted(0);
      }
    } catch {
      // aborted or offline — keep whatever is on screen
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 150);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  function go(result: SearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(result.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && results[highlighted]) {
      e.preventDefault();
      go(results[highlighted]);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        {mobile ? (
          <button
            aria-label="Search"
            className="flex min-h-12 w-full flex-1 flex-col items-center justify-center gap-0.5 self-stretch"
          >
            <SearchIcon className="h-6 w-6" />
            <span className="text-caption-2 font-medium">Search</span>
          </button>
        ) : (
          <button className="pressable text-subheadline flex min-h-11 w-full items-center gap-2 rounded-lg bg-fill-2 px-3 text-label-2">
            <SearchIcon className="h-4 w-4" />
            Search
            <kbd className="text-caption-1 ml-auto rounded bg-fill px-1.5 py-0.5">⌘K</kbd>
          </button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 [animation:fade-in_0.15s_ease]" />
        <Dialog.Content className="elevated-surface fixed inset-x-3 top-[max(env(safe-area-inset-top),0.75rem)] z-50 overflow-hidden rounded-2xl bg-elevated [animation:pop-in_0.15s_ease] focus:outline-none sm:inset-x-auto sm:left-1/2 sm:top-24 sm:w-full sm:max-w-lg sm:-translate-x-1/2">
          <Dialog.Title className="sr-only">Search brokers and deals</Dialog.Title>
          <div className="flex items-center gap-2.5 border-b-[0.5px] border-separator px-4">
            <SearchIcon className="h-5 w-5 shrink-0 text-label-2" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Brokers, deals, addresses…"
              aria-label="Search brokers and deals"
              className="text-body min-h-13 w-full bg-transparent text-label placeholder:text-label-3 focus:outline-none"
            />
          </div>
          {results.length > 0 ? (
            <ul className="max-h-80 overflow-y-auto py-1.5">
              {results.map((r, i) => (
                <li key={`${r.kind}-${r.id}`}>
                  <button
                    onClick={() => go(r)}
                    onMouseEnter={() => setHighlighted(i)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === highlighted ? "bg-fill" : ""}`}
                  >
                    <span className="text-caption-1 w-14 shrink-0 uppercase text-label-3">
                      {r.kind === "broker" ? "Broker" : "Deal"}
                    </span>
                    <span className="min-w-0">
                      <span className="text-body block truncate text-label">{r.title}</span>
                      {r.subtitle ? <span className="text-footnote block truncate text-label-2">{r.subtitle}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim().length >= 2 ? (
            <p className="text-subheadline px-4 py-6 text-center text-label-2">No matches.</p>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
