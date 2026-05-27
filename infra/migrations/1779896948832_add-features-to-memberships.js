// Adds an explicit features list to each membership so individual users can
// hold non-preset permission sets (granular per-member editing in the UI).
//
// The lists below mirror lib/roles.ts ROLE_PERMISSIONS at the moment this
// migration ships. Future role-permission changes need their own backfill
// migration — same pattern we used for create:company in #48. The role
// column stays as the "preset name" + ownership marker.

exports.up = (pgm) => {
  pgm.addColumn("memberships", {
    features: {
      type: "varchar[]",
      notNull: true,
      default: "{}",
    },
  });

  // Backfill. Hardcoded mappings so the migration is self-contained — no
  // need to evaluate TS at SQL-up time.
  const OWNER = [
    "read:company",
    "update:company",
    "delete:company",
    "read:member",
    "update:member",
    "delete:member",
    "read:invitation",
    "create:invitation",
    "delete:invitation",
    "read:audit_log",
  ];
  const ADMIN = OWNER.filter((f) => f !== "delete:company");
  const MEMBER = ["read:company", "read:member"];

  const updates = [
    { role: "owner", features: OWNER },
    { role: "admin", features: ADMIN },
    { role: "gerente", features: ADMIN },
    { role: "member", features: MEMBER },
    { role: "vendedor", features: MEMBER },
    { role: "separador", features: MEMBER },
    { role: "entregador", features: MEMBER },
  ];

  for (const { role, features } of updates) {
    const literal = `ARRAY[${features.map((f) => `'${f}'`).join(", ")}]::varchar[]`;
    pgm.sql(`UPDATE memberships SET features = ${literal} WHERE role = '${role}';`);
  }
};

exports.down = () => false;
