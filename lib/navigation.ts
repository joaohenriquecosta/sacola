// Pure navigation catalog. Lives in `lib/` (no DB imports) so both the server
// layout and the client nav components import the same source of truth — same
// pattern as `@/lib/roles` and `@/lib/order-status`.
//
// It centralizes the per-feature gating that used to live ad-hoc in the
// company dashboard (`features.includes("read:product")` etc.): each item
// declares the feature it needs, and the helpers below filter by the
// membership's feature set.
//
// Icons are plain SVG data from core-free-icons; `IconSvgElement` is a
// type-only import, erased at build, so no React runtime is pulled into lib/.

import { type IconSvgElement } from "@hugeicons/react";
import {
  ClipboardClockIcon,
  DashboardCircleIcon,
  DeliveryTruck01Icon,
  Money01Icon,
  Package01Icon,
  Settings01Icon,
  ShoppingBag03Icon,
  Tag01Icon,
  UserGroupIcon,
  UserMultipleIcon,
  WeightScale01Icon,
} from "@hugeicons/core-free-icons";

// Sidebar groups, in render order.
export type NavGroup = "operacao" | "catalogo" | "gestao";

export const NAV_GROUP_ORDER: readonly NavGroup[] = ["operacao", "catalogo", "gestao"];

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  operacao: "Operação",
  catalogo: "Catálogo",
  gestao: "Gestão",
};

export type NavItem = {
  key: string;
  label: string;
  // Shorter label for the cramped mobile bottom nav; falls back to `label`.
  shortLabel?: string;
  // Path suffix appended to /app/[slug]. "" = company overview (exact match).
  path: string;
  icon: IconSvgElement;
  // Feature required to see the item; undefined = visible to any member.
  feature?: string;
  group: NavGroup;
  // Screen not built yet → rendered disabled with an "em breve" badge, no link.
  soon?: boolean;
  // Surfaced in the mobile bottom nav for roles that hold its feature.
  bottomNav?: boolean;
};

// Single source of truth for the in-company navigation. Order within a group
// is the render order. Features mirror models/authorization (@/lib/roles).
export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: "overview",
    label: "Visão geral",
    shortLabel: "Início",
    path: "",
    icon: DashboardCircleIcon,
    group: "operacao",
    bottomNav: true,
  },
  {
    key: "orders",
    label: "Pedidos",
    path: "/pedidos",
    icon: ShoppingBag03Icon,
    feature: "read:order",
    group: "operacao",
    bottomNav: true,
  },
  {
    key: "separation",
    label: "Fila de separação",
    shortLabel: "Separar",
    path: "/separacao",
    icon: WeightScale01Icon,
    feature: "transition:order:separar",
    group: "operacao",
    bottomNav: true,
  },
  {
    key: "deliveries",
    label: "Entregas",
    path: "/entregas",
    icon: DeliveryTruck01Icon,
    feature: "transition:order:entregar",
    group: "operacao",
    bottomNav: true,
  },
  {
    key: "payments",
    label: "Pagamentos",
    path: "/pagamentos",
    icon: Money01Icon,
    feature: "read:payment",
    group: "operacao",
    soon: true,
  },
  {
    key: "products",
    label: "Produtos",
    path: "/produtos",
    icon: Tag01Icon,
    feature: "read:product",
    group: "catalogo",
  },
  {
    key: "stock",
    label: "Estoque",
    path: "/estoque",
    icon: Package01Icon,
    feature: "read:stock_movement",
    group: "catalogo",
  },
  {
    key: "clients",
    label: "Clientes",
    path: "/clientes",
    icon: UserMultipleIcon,
    feature: "read:client",
    group: "catalogo",
  },
  {
    key: "team",
    label: "Equipe",
    path: "/equipe",
    icon: UserGroupIcon,
    feature: "read:member",
    group: "gestao",
  },
  {
    key: "audit",
    label: "Auditoria",
    path: "/auditoria",
    icon: ClipboardClockIcon,
    feature: "read:audit_log",
    group: "gestao",
  },
  {
    key: "settings",
    label: "Configurações",
    path: "/configuracoes",
    icon: Settings01Icon,
    group: "gestao",
  },
];

function canSee(item: NavItem, features: readonly string[]): boolean {
  return !item.feature || features.includes(item.feature);
}

export type NavSection = { group: NavGroup; label: string; items: NavItem[] };

// Items a membership can see, bucketed into groups in render order. Empty
// groups are dropped so the sidebar never renders a header with nothing under
// it (e.g. an entregador has no `gestao` items beyond settings).
export function navForFeatures(features: readonly string[]): NavSection[] {
  return NAV_GROUP_ORDER.map((group) => ({
    group,
    label: NAV_GROUP_LABELS[group],
    items: NAV_ITEMS.filter((i) => i.group === group && canSee(i, features)),
  })).filter((section) => section.items.length > 0);
}

// Up to `limit` items for the mobile bottom bar: the always-on overview plus
// the operational items the role can see, capped to keep thumb-sized targets.
export function bottomNavForFeatures(features: readonly string[], limit = 4): NavItem[] {
  return NAV_ITEMS.filter((i) => i.bottomNav && canSee(i, features)).slice(0, limit);
}

// Full href for an item. `soon` items have no route yet; callers render them
// disabled and must not link to this.
export function navItemHref(item: NavItem, slug: string): string {
  return `/app/${slug}${item.path}`;
}

// Active-state match against the current pathname. The overview (path "")
// matches only its own page; deeper items also match their subtree
// (e.g. /pedidos stays active on /pedidos/123).
export function isNavItemActive(item: NavItem, slug: string, pathname: string): boolean {
  const href = navItemHref(item, slug);
  if (item.path === "") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
