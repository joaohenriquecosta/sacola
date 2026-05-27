// Cost price (preço de custo) per product. Stored as integer cents like
// price_cents to keep the math exact. Existing rows default to 0 — meaning
// "unknown / not informed"; the UI distinguishes 0 from a real cost only
// when the inviter explicitly types something.

exports.up = (pgm) => {
  pgm.addColumn("products", {
    cost_cents: {
      type: "integer",
      notNull: true,
      default: 0,
      check: "cost_cents >= 0",
    },
  });
};

exports.down = () => false;
