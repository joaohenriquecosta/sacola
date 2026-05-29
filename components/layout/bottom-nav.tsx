"use client";

// Mobile-only bottom navigation for the operational roles. The drawer (from
// the sidebar) still covers everything; this bar is a thumb-friendly shortcut
// to the 3–4 items the role uses most. `soon` items render disabled.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";
import { bottomNavForFeatures, isNavItemActive, navItemHref } from "@/lib/navigation";

export function BottomNav({ slug, features }: { slug: string; features: string[] }) {
  const pathname = usePathname();
  const items = bottomNavForFeatures(features);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Navegação"
      className="bg-background fixed inset-x-0 bottom-0 z-20 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => {
        const label = item.shortLabel ?? item.label;
        const active = !item.soon && isNavItemActive(item, slug, pathname);
        const className = cn(
          "text-muted-foreground flex flex-1 flex-col items-center gap-1 py-2 text-[11px] leading-none",
          active && "text-foreground",
          item.soon && "opacity-40",
        );

        if (item.soon) {
          return (
            <span key={item.key} aria-disabled className={className}>
              <HugeiconsIcon icon={item.icon} className="size-5" />
              {label}
            </span>
          );
        }

        return (
          <Link
            key={item.key}
            href={navItemHref(item, slug)}
            aria-current={active ? "page" : undefined}
            className={className}
          >
            <HugeiconsIcon icon={item.icon} className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
