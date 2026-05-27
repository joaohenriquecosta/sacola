// Backfill stock features per role, mirroring lib/roles.ts ROLE_PERMISSIONS.
//
// Mapping:
//   - management (owner/admin/gerente): read + create + delete
//   - vendedor: read (precisa saber se tem em estoque no atendimento)
//   - separador: read + create (lança saída ao separar pedido)
//   - entregador: read
//   - member: read

const STOCK_ALL = ["read:stock_movement", "create:stock_movement", "delete:stock_movement"];
const STOCK_SEPARADOR = ["read:stock_movement", "create:stock_movement"];
const STOCK_READ = ["read:stock_movement"];

const ASSIGN = {
  owner: STOCK_ALL,
  admin: STOCK_ALL,
  gerente: STOCK_ALL,
  separador: STOCK_SEPARADOR,
  vendedor: STOCK_READ,
  entregador: STOCK_READ,
  member: STOCK_READ,
};

exports.up = (pgm) => {
  for (const [role, features] of Object.entries(ASSIGN)) {
    const literal = `ARRAY[${features.map((f) => `'${f}'`).join(", ")}]::varchar[]`;
    pgm.sql(`UPDATE memberships SET features = features || ${literal} WHERE role = '${role}';`);
    pgm.sql(`UPDATE invitations SET features = features || ${literal} WHERE role = '${role}';`);
  }
};

exports.down = () => false;
