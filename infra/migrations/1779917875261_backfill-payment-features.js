// Backfill payment features per role.
//
// Mapping:
//   - management (owner/admin/gerente): tudo (incl. delete = estorno).
//   - vendedor: read + create (recebe no atendimento, registra na hora).
//   - entregador: read + create (recebe na entrega — pagamento na porta).
//   - separador + member: read.

const PAY_ALL = ["read:payment", "create:payment", "delete:payment"];
const PAY_RECEIVE = ["read:payment", "create:payment"];
const PAY_READ = ["read:payment"];

const ASSIGN = {
  owner: PAY_ALL,
  admin: PAY_ALL,
  gerente: PAY_ALL,
  vendedor: PAY_RECEIVE,
  entregador: PAY_RECEIVE,
  separador: PAY_READ,
  member: PAY_READ,
};

exports.up = (pgm) => {
  for (const [role, features] of Object.entries(ASSIGN)) {
    const literal = `ARRAY[${features.map((f) => `'${f}'`).join(", ")}]::varchar[]`;
    pgm.sql(`UPDATE memberships SET features = features || ${literal} WHERE role = '${role}';`);
    pgm.sql(`UPDATE invitations SET features = features || ${literal} WHERE role = '${role}';`);
  }
};

exports.down = () => false;
