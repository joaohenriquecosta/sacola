// Human-facing labels for company roles. One map per locale, keyed by the
// Role IDs in models/authorization.ts. UI components import from here so a
// label change is one diff (and never causes "Membro" in one page and
// "Member" in another).

import type { Role } from "models/authorization";

export const ROLE_LABEL_PT_BR: Record<Role, string> = {
  // Generic — match the org-control concepts.
  owner: "Dono",
  admin: "Gerente",
  member: "Membro",

  // Sacola job roles.
  gerente: "Gerente",
  vendedor: "Vendedor",
  separador: "Separador",
  entregador: "Entregador",
};

// Short description shown in dropdowns / tooltips alongside the label.
export const ROLE_DESCRIPTION_PT_BR: Record<Role, string> = {
  owner: "Controle total da empresa.",
  admin: "Gerencia equipe e configurações; não pode excluir a empresa.",
  member: "Acesso de leitura; sem ações de gerenciamento.",
  gerente: "Gerencia equipe, produtos, estoque e pedidos da operação.",
  vendedor: "Recebe pedidos via WhatsApp e registra na operação.",
  separador: "Trabalha nos pedidos atribuídos a ele para separação.",
  entregador: "Trabalha nas entregas atribuídas a ele.",
};

export function roleLabel(role: Role): string {
  return ROLE_LABEL_PT_BR[role] ?? role;
}
