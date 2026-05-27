// Human-friendly rendering of audit events. Kept pure (no DB / no server-only
// imports) so client components can use it. Action ID stays free-form in the
// DB; missing labels fall back to the raw action string.

import { roleLabel } from "@/lib/role-labels";
import type { Role } from "@/lib/roles";

type Metadata = Record<string, unknown>;

function asRole(value: unknown): string | undefined {
  return typeof value === "string" ? roleLabel(value as Role) : undefined;
}

function get(meta: Metadata, key: string): string | undefined {
  const v = meta[key];
  return typeof v === "string" ? v : undefined;
}

// Returns a sentence describing what `actor` did. Already includes the
// actor's name; the caller renders timestamp + actor avatar separately as
// needed.
export function describeAuditEvent(event: {
  action: string;
  actor_username: string;
  metadata: Metadata;
}): string {
  const actor = event.actor_username;
  const m = event.metadata;

  switch (event.action) {
    case "company.created":
      return `${actor} criou a empresa${get(m, "name") ? ` "${get(m, "name")}"` : ""}.`;
    case "company.updated":
      if (m.old_name && m.new_name) {
        return `${actor} renomeou a empresa de "${m.old_name}" para "${m.new_name}".`;
      }
      if (m.old_slug && m.new_slug) {
        return `${actor} mudou o slug da empresa de "${m.old_slug}" para "${m.new_slug}".`;
      }
      return `${actor} atualizou as configurações da empresa.`;
    case "ownership.transferred":
      return `${actor} transferiu a propriedade da empresa para outro membro.`;
    case "invitation.created":
      return `${actor} convidou ${get(m, "email") ?? "alguém"} como ${asRole(m.role) ?? "membro"}.`;
    case "invitation.revoked":
      return `${actor} revogou o convite para ${get(m, "email") ?? "um endereço"}.`;
    case "invitation.resent":
      return `${actor} reenviou o convite para ${get(m, "email") ?? "um endereço"}.`;
    case "member.joined":
      return `${actor} aceitou o convite e entrou como ${asRole(m.role) ?? "membro"}.`;
    case "member.role_changed":
      return `${actor} mudou a função de um membro de ${asRole(m.old_role) ?? m.old_role} para ${asRole(m.new_role) ?? m.new_role}.`;
    case "member.removed":
      return `${actor} removeu um membro (${asRole(m.removed_role) ?? m.removed_role}) da empresa.`;
    case "member.left":
      return `${actor} saiu da empresa (era ${asRole(m.role) ?? m.role}).`;
    case "product.created":
      return `${actor} cadastrou o produto "${get(m, "name") ?? "sem nome"}".`;
    case "product.updated":
      return `${actor} editou um produto.`;
    case "product.deleted":
      return `${actor} removeu o produto "${get(m, "name") ?? "sem nome"}".`;
    case "client.created":
      return `${actor} cadastrou o cliente "${get(m, "name") ?? "sem nome"}".`;
    case "client.updated":
      return `${actor} editou o cliente "${get(m, "name") ?? "sem nome"}".`;
    case "client.deleted":
      return `${actor} removeu o cliente "${get(m, "name") ?? "sem nome"}".`;
    case "order.created":
      return `${actor} criou pedido para ${get(m, "client_name") ?? "um cliente"} (${typeof m.item_count === "number" ? m.item_count : "?"} ${m.item_count === 1 ? "item" : "itens"}).`;
    case "order.status_changed":
      return `${actor} mudou o status do pedido de ${get(m, "old_status") ?? "?"} para ${get(m, "new_status") ?? "?"}.`;
    case "order.deleted":
      return `${actor} excluiu um pedido (estava ${get(m, "status_at_delete") ?? "?"}).`;
    case "stock.movement_created": {
      const kind = get(m, "kind");
      const label = kind === "in" ? "entrada" : kind === "out" ? "saída" : "ajuste";
      return `${actor} lançou ${label} no estoque de "${get(m, "product_name") ?? "produto"}".`;
    }
    case "stock.movement_deleted":
      return `${actor} estornou um movimento de estoque.`;
    default:
      return `${actor} executou ${event.action}.`;
  }
}
