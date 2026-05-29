"use client";

// Renders the sidebar groups from the navigation catalog, filtered by the
// membership's features. `soon` items (screens not built yet) render disabled
// with an "em breve" badge instead of a link, so the menu already reserves
// their place. Active state comes from the current pathname; tapping a link
// closes the mobile drawer (setOpenMobile is a no-op on desktop).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { isNavItemActive, navForFeatures, navItemHref } from "@/lib/navigation";

export function NavMain({ slug, features }: { slug: string; features: string[] }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const sections = navForFeatures(features);

  return (
    <>
      {sections.map((section) => (
        <SidebarGroup key={section.group}>
          <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
          <SidebarMenu>
            {section.items.map((item) =>
              item.soon ? (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    aria-label={`${item.label} (em breve)`}
                    tooltip={`${item.label} (em breve)`}
                    className="opacity-60"
                  >
                    <HugeiconsIcon icon={item.icon} />
                    <span>{item.label}</span>
                    <Badge
                      variant="secondary"
                      className="ml-auto group-data-[collapsible=icon]:hidden"
                    >
                      em breve
                    </Badge>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    asChild
                    isActive={isNavItemActive(item, slug, pathname)}
                    tooltip={item.label}
                  >
                    <Link href={navItemHref(item, slug)} onClick={() => setOpenMobile(false)}>
                      <HugeiconsIcon icon={item.icon} />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ),
            )}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
