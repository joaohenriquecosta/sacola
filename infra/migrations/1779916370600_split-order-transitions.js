// Refina lifecycle: `update:order` (umbrella) vira 3 features de transição:
//   - transition:order:separar  (criado → separado)
//   - transition:order:entregar (separado → entregue)
//   - transition:order:cancelar (criado|separado → cancelado)
//
// Backfill por role (memberships + invitations):
//   - management (owner/admin/gerente): todas as 3
//   - separador: só separar
//   - entregador: só entregar
//   - vendedor: só cancelar (cancela próprio pedido)
//   - member: nenhuma (já não tinha update:order)
//
// Depois remove update:order de quem tinha. Linhas que tinham features
// customizadas (via granular UI) podem ter update:order sem ter
// nenhuma das transições — esses ficam sem nenhuma transição até o
// admin reconfigurar. É comportamento conservador: melhor 403 explícito
// do que herança implícita ambígua.

const ASSIGN_BY_ROLE = {
  owner: ["transition:order:separar", "transition:order:entregar", "transition:order:cancelar"],
  admin: ["transition:order:separar", "transition:order:entregar", "transition:order:cancelar"],
  gerente: ["transition:order:separar", "transition:order:entregar", "transition:order:cancelar"],
  separador: ["transition:order:separar"],
  entregador: ["transition:order:entregar"],
  vendedor: ["transition:order:cancelar"],
};

exports.up = (pgm) => {
  for (const [role, features] of Object.entries(ASSIGN_BY_ROLE)) {
    const literal = `ARRAY[${features.map((f) => `'${f}'`).join(", ")}]::varchar[]`;
    pgm.sql(`UPDATE memberships SET features = features || ${literal} WHERE role = '${role}';`);
    pgm.sql(`UPDATE invitations SET features = features || ${literal} WHERE role = '${role}';`);
  }

  // Remove update:order de qualquer linha que tenha (memberships + invitations).
  // array_remove é seguro: no-op se não existir.
  pgm.sql(`UPDATE memberships SET features = array_remove(features, 'update:order');`);
  pgm.sql(`UPDATE invitations SET features = array_remove(features, 'update:order');`);
};

exports.down = () => false;
