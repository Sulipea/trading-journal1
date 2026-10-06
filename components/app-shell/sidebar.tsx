"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CandlestickChart, Plus } from "lucide-react";
import { NAV_ITEMS, isActivePath } from "@/lib/navigation";
import { cn } from "@/lib/ui/cn";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-5">
      <div className="flex items-center gap-2 px-3 pb-5">
        <CandlestickChart aria-hidden className="size-5 text-accent" />
        <span className="text-sm font-semibold tracking-tight">Trading Journal</span>
      </div>

      <Link
        href="/trades/new"
        className="mb-5 flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Plus aria-hidden className="size-4" />
        New Trade
      </Link>

      <nav aria-label="Main">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                    active
                      ? "bg-surface-muted font-medium text-foreground"
                      : "text-muted hover:bg-surface-muted hover:text-foreground",
                  )}
                >
                  <Icon aria-hidden className={cn("size-4", active && "text-accent")} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <p className="mt-auto px-3 text-xs text-muted">Journal data is stored locally in this browser.</p>
    </aside>
  );
}
