"use client";

// The in-company sidebar. Header shows a company switcher when the user has
// more than one company, otherwise a static brand (a discreet link back to the
// overview). Content is the feature-gated nav; footer is the account menu.

import Link from "next/link";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { CompanySwitcher } from "./company-switcher";
import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

type Company = { name: string; slug: string };

type AppSidebarProps = {
  company: Company;
  companies: Company[];
  user: { username: string; email: string };
  features: string[];
};

export function AppSidebar({ company, companies, user, features }: AppSidebarProps) {
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {companies.length > 1 ? (
          <CompanySwitcher companies={companies} currentSlug={company.slug} />
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href={`/app/${company.slug}`} onClick={() => setOpenMobile(false)}>
                  <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                    <span aria-hidden="true">🛒</span>
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{company.name}</span>
                    <span className="text-muted-foreground truncate text-xs">/{company.slug}</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarHeader>
      <SidebarContent>
        <NavMain slug={company.slug} features={features} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser username={user.username} email={user.email} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
