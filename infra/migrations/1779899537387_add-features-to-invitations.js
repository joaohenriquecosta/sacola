// Invitations now carry a feature list, mirroring memberships. The invite
// captures the exact permissions the inviter granted (preset or granular);
// on accept, those features are written into the new membership instead of
// re-deriving from the role preset.
//
// Backfill: for existing pending invitations we set features = the role's
// preset from ROLE_PERMISSIONS (the same hardcoded mapping used by
// 1779896948832_add-features-to-memberships).

exports.up = (pgm) => {
  pgm.addColumn("invitations", {
    features: { type: "varchar[]", notNull: true, default: "{}" },
  });

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
    pgm.sql(`UPDATE invitations SET features = ${literal} WHERE role = '${role}';`);
  }
};

exports.down = () => false;
