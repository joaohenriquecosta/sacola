// Pagamentos modelados como uma tabela auxiliar de pedido. Pedido pode
// ter zero, um ou vários pagamentos (parcial). saldo = order.total_cents
// - SUM(payments.amount_cents). Estorno = DELETE (segue mesma convenção
// dos movimentos de estoque: imutável, mas correcable via delete).
//
// method é varchar livre (CHECK leve só pra evitar lixo) — fluxo MVP
// suporta os métodos comuns do hortifruti sem amarrar enum (PIX surgiu
// recente, pode surgir mais).

exports.up = (pgm) => {
  pgm.createTable("payments", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    company_id: { type: "uuid", notNull: true },
    order_id: { type: "uuid", notNull: true },

    // Sempre positivo. Pra estornar, DELETE o pagamento; não criamos
    // amount negativo (mantém ledger simples).
    amount_cents: {
      type: "integer",
      notNull: true,
      check: "amount_cents > 0",
    },

    method: {
      type: "varchar(24)",
      notNull: true,
      // Lista MVP — fácil de estender via migration que reescreve o check.
      check: "method IN ('dinheiro', 'pix', 'debito', 'credito', 'transferencia', 'outro')",
    },

    // Quando o pagamento foi recebido (não quando foi registrado).
    paid_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("timezone('utc', now())"),
    },

    notes: { type: "varchar(120)" },

    created_by: { type: "uuid", notNull: true },

    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("timezone('utc', now())"),
    },
  });

  pgm.createIndex("payments", ["order_id", "paid_at"], {
    name: "payments_order_paid_idx",
  });
  pgm.createIndex("payments", ["company_id", "paid_at"], {
    name: "payments_company_paid_idx",
  });
};

exports.down = () => false;
