"use client";

// The in-company sidebar. Header shows the company brand (a discreet link
// back to its overview — no prominent company switcher, by design); content
// is the feature-gated nav; footer is the user/account menu.

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
} from "@/components/ui/sidebar";
import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

type AppSidebarProps = {
  company: { name: string; slug: string };
  user: { username: string; email: string };
  features: string[];
};

export function AppSidebar({ company, user, features }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={`/app/${company.slug}`}>
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
