// Clients are the people / businesses a company sells to. Scoped strictly
// by company_id, same isolation pattern as memberships/invitations/products.
// Pedidos (próximo passo) referencia client_id; o client é a counterparty.
//
// Phone is varchar(32) — handles +55 (11) 9 9999-9999 and friends without
// imposing a format. Notes is text (not capped) for free-form context like
// "prefere entregar à tarde".

exports.up = (pgm) => {
  pgm.createTable("clients", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    company_id: {
      type: "uuid",
      notNull: true,
    },

    name: {
      type: "varchar(120)",
      notNull: true,
    },

    // Optional. Pedido por telefone é o caso comum, mas alguns clientes
    // vêm sem número (encomenda via WhatsApp da empresa, por exemplo).
    phone: {
      type: "varchar(32)",
    },

    notes: {
      type: "text",
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

  pgm.createIndex("clients", ["company_id", "created_at"], {
    name: "clients_company_recent_idx",
  });
};

exports.down = () => false;
