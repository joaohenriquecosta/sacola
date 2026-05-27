// Backfill the new client features into existing memberships + invitations,
// mirroring lib/roles.ts ROLE_PERMISSIONS for the rows that pre-date this
// commit. Same shape used by the products backfill.

const CLIENT_ALL = ["read:client", "create:client", "update:client", "delete:client"];
const CLIENT_READ = ["read:client"];
// Vendedor é único non-management que mexe em cliente: cadastra + atualiza
// durante o atendimento, mas não apaga (limpeza de cadastro é do gerente).
const CLIENT_VENDEDOR = ["read:client", "create:client", "update:client"];

const ASSIGN = {
  owner: CLIENT_ALL,
  admin: CLIENT_ALL,
  gerente: CLIENT_ALL,
  member: CLIENT_READ,
  vendedor: CLIENT_VENDEDOR,
  separador: CLIENT_READ,
  entregador: CLIENT_READ,
};

exports.up = (pgm) => {
  for (const [role, features] of Object.entries(ASSIGN)) {
    const literal = `ARRAY[${features.map((f) => `'${f}'`).join(", ")}]::varchar[]`;
    pgm.sql(`UPDATE memberships SET features = features || ${literal} WHERE role = '${role}';`);
    pgm.sql(`UPDATE invitations SET features = features || ${literal} WHERE role = '${role}';`);
  }
};

exports.down = () => false;
