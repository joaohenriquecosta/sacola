// Backfill order features into existing memberships + invitations,
// mirroring lib/roles.ts ROLE_PERMISSIONS for rows that pre-date this
// commit.
//
// Sacola domain mapping:
//   - vendedor cria pedido durante atendimento (read + create);
//   - separador e entregador mexem em status (read + update);
//   - management roles fazem tudo.

const ORDER_ALL = ["read:order", "create:order", "update:order", "delete:order"];
const ORDER_READ = ["read:order"];
const ORDER_VENDEDOR = ["read:order", "create:order"];
const ORDER_OPERATIONAL = ["read:order", "update:order"]; // separador + entregador

const ASSIGN = {
  owner: ORDER_ALL,
  admin: ORDER_ALL,
  gerente: ORDER_ALL,
  member: ORDER_READ,
  vendedor: ORDER_VENDEDOR,
  separador: ORDER_OPERATIONAL,
  entregador: ORDER_OPERATIONAL,
};

exports.up = (pgm) => {
  for (const [role, features] of Object.entries(ASSIGN)) {
    const literal = `ARRAY[${features.map((f) => `'${f}'`).join(", ")}]::varchar[]`;
    pgm.sql(`UPDATE memberships SET features = features || ${literal} WHERE role = '${role}';`);
    pgm.sql(`UPDATE invitations SET features = features || ${literal} WHERE role = '${role}';`);
  }
};

exports.down = () => false;
