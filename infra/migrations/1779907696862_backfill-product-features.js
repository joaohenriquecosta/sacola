// Backfill the new product features into existing memberships + invitations.
// Mirrors the hardcoded mapping in lib/roles.ts ROLE_PERMISSIONS for the
// rows that pre-date this commit. Future rows pick up the catalog directly
// through the model layer.

const PRODUCT_ALL = ["read:product", "create:product", "update:product", "delete:product"];
const PRODUCT_READ = ["read:product"];

const ASSIGN = {
  owner: PRODUCT_ALL,
  admin: PRODUCT_ALL,
  gerente: PRODUCT_ALL,
  member: PRODUCT_READ,
  vendedor: PRODUCT_READ,
  separador: PRODUCT_READ,
  entregador: PRODUCT_READ,
};

exports.up = (pgm) => {
  for (const [role, features] of Object.entries(ASSIGN)) {
    const literal = `ARRAY[${features.map((f) => `'${f}'`).join(", ")}]::varchar[]`;
    pgm.sql(`UPDATE memberships SET features = features || ${literal} WHERE role = '${role}';`);
    pgm.sql(`UPDATE invitations SET features = features || ${literal} WHERE role = '${role}';`);
  }
};

exports.down = () => false;
