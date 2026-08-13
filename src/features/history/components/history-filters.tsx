"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEBOUNCE_MS = 300;
const ALL = "all";

/**
 * URL-backed history filters. Changing a filter resets pagination by dropping
 * the cursor — otherwise page 2 of the old query would leak into the new one.
 */
export function HistoryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(urlSearch);
  const isTyping = useRef(false);

  useEffect(() => {
    if (!isTyping.current) setSearch(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    if (search === urlSearch) return;
    const timeout = setTimeout(() => {
      isTyping.current = false;
      push({ search: search || null });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, urlSearch]);

  function push(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("cursor");

    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "" || value === ALL) params.delete(key);
      else params.set(key, value);
    }

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

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
          placeholder="Search text or voice…"
          aria-label="Search generation history"
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
        value={searchParams.get("status") ?? ALL}
        onValueChange={(value) => push({ status: value })}
      >
        <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          <SelectItem value="COMPLETED">Completed</SelectItem>
          <SelectItem value="PENDING">Queued</SelectItem>
          <SelectItem value="PROCESSING">Generating</SelectItem>
          <SelectItem value="FAILED">Failed</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
