// gramas_separado: peso real (em gramas) que o separador registra ao pesar
// cada item durante a separação. NULL até a pesagem — o pedido foi criado com
// a quantidade pedida (quantity) e o peso real separado pode divergir.
//
// Aditivo e fiel à #19 ("weighing flow records gramas_separado and finalizes").
// O recálculo de total/estoque pelo peso real (saldo previsto) é a #13 e fica
// fora desta migration.

exports.up = (pgm) => {
  pgm.addColumn("order_items", {
    gramas_separado: {
      type: "numeric(10,3)",
      check: "gramas_separado IS NULL OR gramas_separado >= 0",
    },
  });
};

exports.down = () => false;
