// Products are the catalog a company sells. Scoped strictly by company_id
// (the same isolation as memberships/invitations) — no cross-company lookup
// path. Price kept in integer cents to avoid floating-point money.

exports.up = (pgm) => {
  pgm.createTable("products", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    company_id: {
      type: "uuid",
      notNull: true,
    },

    // Human-readable label, short enough for grid cells, long enough for
    // "Tomate italiano orgânico embalado a vácuo".
    name: {
      type: "varchar(120)",
      notNull: true,
    },

    // Money lives in cents. Never store float; never divide here. The UI is
    // responsible for the BRL formatting.
    price_cents: {
      type: "integer",
      notNull: true,
      check: "price_cents >= 0",
    },

    // Free-form unit label: "kg", "un", "pacote", "dz", "bandeja"...
    // Caller decides; we don't enumerate.
    unit: {
      type: "varchar(16)",
      notNull: true,
    },

    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("timezone('utc', now())"),
    },

    updated_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("timezone('utc', now())"),
    },
  });

  pgm.createIndex("products", ["company_id", "created_at"], {
    name: "products_company_recent_idx",
  });
};

exports.down = () => false;
