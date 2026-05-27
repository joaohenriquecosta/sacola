// Pedido + itens. Scope estritamente por company_id (mesma isolation
// pattern). Cada item snapshota nome/unit/preço unitário do produto no
// momento da criação — assim renomear/apagar produto não corrompe pedidos
// históricos.
//
// status fica como varchar(16) com CHECK explícito em vez de enum: novos
// estados (ex. "em_rota") não exigem ALTER TYPE futuro — só uma migration
// que reescreve o CHECK.
//
// quantity é numeric(10,3) pra aceitar "0.500 kg" sem perder precisão
// (sacola é hortifruti — meio quilo de tomate é caso normal).
//
// total_cents na order e subtotal_cents no item são denormalizados na
// hora da criação. Reads não recalculam; pedido é imutável depois de
// criado neste schema (status muda; itens não).

exports.up = (pgm) => {
  pgm.createTable("orders", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    company_id: {
      type: "uuid",
      notNull: true,
    },

    client_id: {
      type: "uuid",
      notNull: true,
    },

    // Quem criou o pedido (user_id, normalmente o vendedor).
    created_by: {
      type: "uuid",
      notNull: true,
    },

    status: {
      type: "varchar(16)",
      notNull: true,
      default: "criado",
      // Fluxo MVP. PR de lifecycle (issue #12) vai adicionar autorizações
      // de transição (vendedor cria → separador separa → entregador
      // entrega). Por enquanto qualquer um com update:order pode mover.
      check: "status IN ('criado', 'separado', 'entregue', 'cancelado')",
    },

    total_cents: {
      type: "integer",
      notNull: true,
      check: "total_cents >= 0",
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

  pgm.createIndex("orders", ["company_id", "created_at"], {
    name: "orders_company_recent_idx",
  });
  pgm.createIndex("orders", ["company_id", "status"], {
    name: "orders_company_status_idx",
  });
  pgm.createIndex("orders", ["client_id"], { name: "orders_client_idx" });

  pgm.createTable("order_items", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    order_id: {
      type: "uuid",
      notNull: true,
    },

    product_id: {
      type: "uuid",
      notNull: true,
    },

    // Snapshots: preservam o pedido se o produto for editado/apagado.
    product_name: { type: "varchar(120)", notNull: true },
    product_unit: { type: "varchar(16)", notNull: true },
    unit_price_cents: { type: "integer", notNull: true, check: "unit_price_cents >= 0" },

    // 0.000 a 99999999.999. Hortifruti vende fracionado (kg).
    quantity: { type: "numeric(10,3)", notNull: true, check: "quantity > 0" },

    subtotal_cents: { type: "integer", notNull: true, check: "subtotal_cents >= 0" },

    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("timezone('utc', now())"),
    },
  });

  pgm.createIndex("order_items", ["order_id"], { name: "order_items_order_idx" });
  pgm.createIndex("order_items", ["product_id"], { name: "order_items_product_idx" });
};

exports.down = () => false;
