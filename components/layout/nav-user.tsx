"use client";

// Sidebar footer: the user's account menu. This is also where switching
// companies lives — deliberately tucked away, since an operator rarely
// belongs to more than one hortifruti. Theme + logout fold in here too, so
// the in-company shell needs no separate top-bar controls.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeftRightIcon,
  ComputerIcon,
  Logout01Icon,
  Moon01Icon,
  Sun01Icon,
  UnfoldMoreIcon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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

export function NavUser({ username, email }: { username: string; email: string }) {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const { setTheme } = useTheme();
  const initial = username.slice(0, 2).toUpperCase();

  async function logout() {
    await fetch("/api/v1/sessions", { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg text-xs">{initial}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{username}</span>
                <span className="text-muted-foreground truncate text-xs">{email}</span>
              </div>
              <HugeiconsIcon icon={UnfoldMoreIcon} className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "top"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="flex flex-col">
              <span className="truncate font-medium">{username}</span>
              <span className="text-muted-foreground truncate text-xs font-normal">{email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/conta">
                  <HugeiconsIcon icon={UserCircleIcon} className="size-4" />
                  Conta
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/app">
                  <HugeiconsIcon icon={ArrowLeftRightIcon} className="size-4" />
                  Trocar de empresa
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setTheme("light")}>
                <HugeiconsIcon icon={Sun01Icon} className="size-4" />
                Tema claro
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}>
                <HugeiconsIcon icon={Moon01Icon} className="size-4" />
                Tema escuro
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}>
                <HugeiconsIcon icon={ComputerIcon} className="size-4" />
                Tema do sistema
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={logout}>
              <HugeiconsIcon icon={Logout01Icon} className="size-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
