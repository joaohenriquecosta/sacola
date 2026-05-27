// Pure role catalog. Lives in `lib/` (not `models/`) so client components can
// import role IDs / labels / dropdown choices without dragging the DB layer
// into their bundle.
//
// Runtime checks (`isAuthorized` / `requireAuthorization`) need a membership
// lookup; they stay in `models/authorization.ts` and import from here.

// Lists shared between roles. Adding a permission "to everything that
// manages a company" or "to everything that just reads" is one edit.
const COMPANY_MANAGEMENT_PERMISSIONS = [
  "read:company",
  "update:company",
  "read:member",
  "update:member",
  "delete:member",
  "read:invitation",
  "create:invitation",
  "delete:invitation",
  "read:audit_log",
  // Product CRUD belongs to anyone managing the company; refinements per
  // Sacola job role (vendedor edits own listing?) can fork later.
  "read:product",
  "create:product",
  "update:product",
  "delete:product",
  // Client CRUD same shape.
  "read:client",
  "create:client",
  "update:client",
  "delete:client",
  // Order CRUD: lifecycle de pedido completo. update:order cobre transição
  // de status no MVP; PR de lifecycle (issue #12) refina pra
  // transition:order:to_separado etc se necessário.
  "read:order",
  "create:order",
  "update:order",
  "delete:order",
] as const;

// "Read-only" today still means anyone who works inside the company can see
// what's being sold and who the clients are. Vendedor/separador/entregador
// all need read:product + read:client + read:order; eles divergem abaixo
// conforme a função na operação.
const READ_ONLY_PERMISSIONS = [
  "read:company",
  "read:member",
  "read:product",
  "read:client",
  "read:order",
] as const;

// Vendedor: cadastra cliente + cria pedido durante atendimento. Não
// transita status do pedido (essa parte é da operação) e não apaga
// cadastro (limpeza é do gerente).
const VENDEDOR_EXTRA = ["create:client", "update:client", "create:order"] as const;

// Separador + entregador: leem catálogo/clientes e transitam status do
// pedido (separar / marcar como entregue). Não criam pedido.
const OPERATIONAL_EXTRA = ["update:order"] as const;

// Two tiers in the same catalog:
//
//   GENERIC roles — owner / admin / member — model org control. Any POP
//   (procedimento operacional padrão) on top of sacola uses these for
//   permission-management within a company.
//
//   SACOLA roles — gerente / vendedor / separador / entregador — model job
//   functions in a hortifruti operation. They alias the closest generic
//   role today; they will gain product/order/stock permissions when those
//   resources land (Semana 2-3 do roadmap), at which point inviting someone
//   as "vendedor" diverges from "member".
//
// Keep this explicit (no derive-from-base abstraction): any role change is
// one diff in this file.
export const ROLE_PERMISSIONS = {
  owner: [...COMPANY_MANAGEMENT_PERMISSIONS, "delete:company"],
  admin: [...COMPANY_MANAGEMENT_PERMISSIONS],
  member: [...READ_ONLY_PERMISSIONS],
  gerente: [...COMPANY_MANAGEMENT_PERMISSIONS],
  vendedor: [...READ_ONLY_PERMISSIONS, ...VENDEDOR_EXTRA],
  separador: [...READ_ONLY_PERMISSIONS, ...OPERATIONAL_EXTRA],
  entregador: [...READ_ONLY_PERMISSIONS, ...OPERATIONAL_EXTRA],
} as const satisfies Record<string, readonly string[]>;

export type Role = keyof typeof ROLE_PERMISSIONS;

export const ROLES: readonly Role[] = [
  "owner",
  "admin",
  "member",
  "gerente",
  "vendedor",
  "separador",
  "entregador",
];

// Roles an admin/owner can assign via invite or role-change. Excludes owner
// (assigned implicitly on company creation, transferred via a dedicated flow).
export const ASSIGNABLE_ROLES: readonly Role[] = [
  "admin",
  "member",
  "gerente",
  "vendedor",
  "separador",
  "entregador",
];

export function isValidRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export const SCOPED_FEATURES: ReadonlySet<string> = new Set(Object.values(ROLE_PERMISSIONS).flat());

// Management roles — these hold company management permissions out of the
// box. Used by `canEditMember` to decide who can edit whom: an admin/gerente
// can't edit another management-level membership; only the owner can.
const MANAGEMENT_ROLES: ReadonlySet<Role> = new Set<Role>(["owner", "admin", "gerente"]);

export function isManagementRole(role: Role): boolean {
  return MANAGEMENT_ROLES.has(role);
}

// Authorization rule for "can the caller edit/remove this member's
// permissions?". Pure, side-effect free, sync — usable from both client
// (to gate UI) and server (to gate the API).
//
//   owner: can touch anyone but themselves
//   admin/gerente: can touch any non-management member
//   member/vendedor/separador/entregador: never
export function canEditMember(input: {
  callerRole: Role;
  targetRole: Role;
  isSelf: boolean;
}): boolean {
  if (input.isSelf) return false;
  if (input.callerRole === "owner") return input.targetRole !== "owner";
  if (input.callerRole === "admin" || input.callerRole === "gerente") {
    return !isManagementRole(input.targetRole);
  }
  return false;
}

// Features the UI can put behind a granular checkbox. `delete:company` is
// owner-only and granted/revoked only through the transfer-ownership flow;
// exposing it here would let an admin slip themselves the destruction
// primitive without going through the explicit handoff.
export const ASSIGNABLE_FEATURES: readonly string[] = [
  "read:company",
  "update:company",
  "read:member",
  "update:member",
  "delete:member",
  "read:invitation",
  "create:invitation",
  "delete:invitation",
  "read:audit_log",
  "read:product",
  "create:product",
  "update:product",
  "delete:product",
  "read:client",
  "create:client",
  "update:client",
  "delete:client",
  "read:order",
  "create:order",
  "update:order",
  "delete:order",
] as const;

// Permission groups for the granular editor. Each feature can declare a
// dependency on a "read:*" feature in the same group; the UI uses these to
// cascade selections (turning on a write turns on its read; turning off a
// read turns off its dependent writes). Same shape used on server-side
// validation so a malformed payload can't sneak through.
export type FeatureGroup = {
  id: string;
  label: string;
  features: readonly { id: string; label: string; requires?: readonly string[] }[];
};

export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  {
    id: "company",
    label: "Empresa",
    features: [
      { id: "read:company", label: "Ver detalhes da empresa" },
      { id: "update:company", label: "Editar nome e slug", requires: ["read:company"] },
    ],
  },
  {
    id: "members",
    label: "Membros",
    features: [
      { id: "read:member", label: "Ver lista de membros" },
      { id: "update:member", label: "Editar permissões de membros", requires: ["read:member"] },
      { id: "delete:member", label: "Remover membros", requires: ["read:member"] },
    ],
  },
  {
    id: "invitations",
    label: "Convites",
    features: [
      { id: "read:invitation", label: "Ver convites pendentes" },
      { id: "create:invitation", label: "Enviar convites", requires: ["read:invitation"] },
      { id: "delete:invitation", label: "Revogar convites", requires: ["read:invitation"] },
    ],
  },
  {
    id: "audit",
    label: "Auditoria",
    features: [{ id: "read:audit_log", label: "Ver log de auditoria" }],
  },
  {
    id: "products",
    label: "Produtos",
    features: [
      { id: "read:product", label: "Ver catálogo de produtos" },
      { id: "create:product", label: "Cadastrar produtos", requires: ["read:product"] },
      { id: "update:product", label: "Editar produtos", requires: ["read:product"] },
      { id: "delete:product", label: "Remover produtos", requires: ["read:product"] },
    ],
  },
  {
    id: "clients",
    label: "Clientes",
    features: [
      { id: "read:client", label: "Ver lista de clientes" },
      { id: "create:client", label: "Cadastrar clientes", requires: ["read:client"] },
      { id: "update:client", label: "Editar clientes", requires: ["read:client"] },
      { id: "delete:client", label: "Remover clientes", requires: ["read:client"] },
    ],
  },
  {
    id: "orders",
    label: "Pedidos",
    features: [
      { id: "read:order", label: "Ver pedidos" },
      { id: "create:order", label: "Criar pedidos", requires: ["read:order"] },
      { id: "update:order", label: "Atualizar status do pedido", requires: ["read:order"] },
      { id: "delete:order", label: "Excluir pedidos", requires: ["read:order"] },
    ],
  },
] as const;

// Normalize a candidate feature set: keep only assignable ones, then close
// the set under their dependencies (a write implies its read). Server uses
// this on PATCH bodies so an invalid client can't store a half-broken set.
export function sanitizeFeatures(candidate: readonly string[]): string[] {
  const allowed = new Set(ASSIGNABLE_FEATURES);
  const reqs = new Map<string, readonly string[]>();
  for (const group of FEATURE_GROUPS) {
    for (const f of group.features) {
      if (f.requires) reqs.set(f.id, f.requires);
    }
  }
  const result = new Set<string>();
  for (const f of candidate) {
    if (allowed.has(f)) result.add(f);
  }
  // Close under dependencies.
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of result) {
      const deps = reqs.get(f) ?? [];
      for (const d of deps) {
        if (!result.has(d)) {
          result.add(d);
          changed = true;
        }
      }
    }
  }
  return [...result];
}
