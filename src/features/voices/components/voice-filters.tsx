"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VOICE_CATEGORIES } from "@/features/voices/constants";

const DEBOUNCE_MS = 300;
const ALL = "all";

/**
 * Search and filters, held in the URL rather than in component state.
 *
 * That keeps the query shareable and lets the *server* do the filtering — the
 * page is a server component that re-runs its Prisma query when the params
 * change, so this scales past whatever fits in a client-side array.
 */
export function VoiceFilters({ resultCount }: { resultCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(urlSearch);
  // Tracks whether the last change came from typing, so back/forward still sync.
  const isTyping = useRef(false);

  useEffect(() => {
    if (!isTyping.current) setSearch(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    if (search === urlSearch) return;

    const timeout = setTimeout(() => {
      isTyping.current = false;
      pushParams({ search: search || null });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
    // `pushParams` is stable enough for this effect; re-running on every param
    // object identity change would restart the debounce on unrelated updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, urlSearch]);

  function pushParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || value === ALL) params.delete(key);
      else params.set(key, value);
    }

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  const category = searchParams.get("category") ?? ALL;
  const variant = searchParams.get("variant") ?? ALL;
  const hasFilters = Boolean(urlSearch) || category !== ALL || variant !== ALL;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          placeholder="Search voices…"
          aria-label="Search voices by name or description"
          className="pl-8"
          onChange={(event) => {
            isTyping.current = true;
            setSearch(event.target.value);
          }}
        />
        {isPending ? (
          <Loader2
            className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin"
            aria-hidden="true"
          />
        ) : null}
      </div>

      <Select
        value={category}
        onValueChange={(value) => pushParams({ category: value })}
      >
        <SelectTrigger className="w-full sm:w-44" aria-label="Filter by category">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All categories</SelectItem>
          {VOICE_CATEGORIES.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={variant}
        onValueChange={(value) => pushParams({ variant: value })}
      >
        <SelectTrigger className="w-full sm:w-36" aria-label="Filter by voice type">
          <SelectValue placeholder="All voices" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All voices</SelectItem>
          <SelectItem value="SYSTEM">System</SelectItem>
          <SelectItem value="CUSTOM">Custom</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2 sm:ml-auto">
        <p
          className="text-muted-foreground shrink-0 text-xs tabular-nums"
          aria-live="polite"
        >
          {resultCount} {resultCount === 1 ? "voice" : "voices"}
        </p>
        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              isTyping.current = false;
              setSearch("");
              pushParams({ search: null, category: null, variant: null });
            }}
          >
            <X aria-hidden="true" />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
