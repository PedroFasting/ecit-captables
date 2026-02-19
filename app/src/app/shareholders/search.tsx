"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useTransition } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function ShareholderSearch({
  defaultSearch,
  defaultType,
}: {
  defaultSearch?: string;
  defaultType?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const navigate = useCallback(
    (search: string, type: string) => {
      startTransition(() => {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (type) params.set("type", type);
        router.push(`/shareholders${params.toString() ? `?${params}` : ""}`);
      });
    },
    [router]
  );

  const handleSearchInput = useCallback(
    (value: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        navigate(value, defaultType ?? "");
      }, 300);
    },
    [navigate, defaultType]
  );

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or org number..."
          defaultValue={defaultSearch}
          onChange={(e) => handleSearchInput(e.target.value)}
          className="pl-9"
        />
        {isPending && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="size-4 animate-spin rounded-full border-2 border-navy border-t-transparent" />
          </div>
        )}
      </div>
      <div className="flex gap-1" role="group" aria-label="Filter by entity type">
        {[
          { label: "All", value: "" },
          { label: "Companies", value: "company" },
          { label: "Persons", value: "person" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => navigate(defaultSearch ?? "", opt.value)}
            aria-pressed={(defaultType ?? "") === opt.value}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ecit-blue focus-visible:ring-offset-2 ${
              (defaultType ?? "") === opt.value
                ? "bg-navy text-white"
                : "border border-cream text-muted-foreground hover:bg-beige"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
