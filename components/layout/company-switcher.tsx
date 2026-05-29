"use client";

// Top-of-sidebar company switcher, rendered only when the user belongs to more
// than one company (AppSidebar shows a static brand otherwise). Lists the
// user's companies and switches with one click; closes the mobile drawer.

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Tick02Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

type Company = { name: string; slug: string };

export function CompanySwitcher({
  companies,
  currentSlug,
}: {
  companies: Company[];
  currentSlug: string;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const current = companies.find((c) => c.slug === currentSlug) ?? companies[0];

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <span aria-hidden="true">🛒</span>
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{current.name}</span>
                <span className="text-muted-foreground truncate text-xs">/{current.slug}</span>
              </div>
              <HugeiconsIcon icon={UnfoldMoreIcon} className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Empresas
            </DropdownMenuLabel>
            {companies.map((c) => (
              <DropdownMenuItem key={c.slug} asChild>
                <Link href={`/app/${c.slug}`} onClick={() => setOpenMobile(false)}>
                  <span className="truncate">{c.name}</span>
                  {c.slug === currentSlug && (
                    <HugeiconsIcon icon={Tick02Icon} className="ml-auto size-4" />
                  )}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/app/criar" onClick={() => setOpenMobile(false)}>
                <HugeiconsIcon icon={Add01Icon} className="size-4" />
                Criar empresa
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
