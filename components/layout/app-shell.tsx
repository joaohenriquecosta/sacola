// The in-company chrome: a collapsible sidebar (desktop) that becomes a
// drawer (mobile) plus a top bar with the trigger. Server component — it only
// composes the client providers and forwards serializable props + children
// (the page) across the boundary. TooltipProvider is required by the
// sidebar's collapsed-state tooltips; SidebarProvider does not include it.

import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { BottomNav } from "./bottom-nav";

type AppShellProps = {
  company: { name: string; slug: string };
  user: { username: string; email: string };
  features: string[];
  children: React.ReactNode;
};

export function AppShell({ company, user, features, children }: AppShellProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar company={company} user={user} features={features} />
        <SidebarInset>
          <header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <span className="truncate font-medium">{company.name}</span>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 pb-20 md:p-6 md:pb-6">{children}</div>
          <BottomNav slug={company.slug} features={features} />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
