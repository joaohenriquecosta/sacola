// Estoque modelado como **ledger append-only**: cada linha é um
// movimento atômico, e o saldo de um produto é a soma assinada de seus
// movimentos. Isso preserva o histórico mesmo quando o operador erra
// (estorno é DELETE da linha errada + nova linha, com motivo).
//
// kind:
//   'in'     — entrada (compra recebida, devolução de cliente).
//              quantity sempre positiva; soma ao saldo.
//   'out'    — saída (venda, perda, descarte).
//              quantity positiva; subtrai do saldo.
//   'adjust' — ajuste de inventário (recontagem).
//              quantity assinada (delta a aplicar; pode ser negativa).
//
// order_id é opcional pra MVP — quando integramos saídas automáticas
// (a criação de pedido baixa estoque), a coluna já existe pra
// referenciar o pedido que gerou o movimento.

exports.up = (pgm) => {
  pgm.createTable("stock_movements", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    company_id: { type: "uuid", notNull: true },
    product_id: { type: "uuid", notNull: true },

    kind: {
      type: "varchar(16)",
      notNull: true,
      check: "kind IN ('in', 'out', 'adjust')",
    },

    // numeric(10,3) — mesma precisão de order_items.quantity, pra
    // fracionado (0.500 kg). adjust permite valor negativo; in/out
    // têm CHECK adicional via aplicação.
    quantity: { type: "numeric(10,3)", notNull: true },

    reason: { type: "varchar(120)" },

    // Quando o movimento foi gerado pela criação/cancelamento de um
    // pedido. NULL pra movimentos manuais.
    order_id: { type: "uuid" },

    created_by: { type: "uuid", notNull: true },

    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("timezone('utc', now())"),
    },
  });

  pgm.createIndex("stock_movements", ["company_id", "created_at"], {
    name: "stock_movements_company_recent_idx",
  });
  pgm.createIndex("stock_movements", ["product_id"], {
    name: "stock_movements_product_idx",
  });
  pgm.createIndex("stock_movements", ["order_id"], {
    name: "stock_movements_order_idx",
  });
};

exports.down = () => false;
