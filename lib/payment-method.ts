// Pure (no DB imports). Métodos suportados no MVP — espelha o CHECK
// constraint da migration. Adicionar um método novo é mudar essa
// constante + uma migration que rewrite-a o CHECK.

export const PAYMENT_METHODS = [
  "dinheiro",
  "pix",
  "debito",
  "credito",
  "transferencia",
  "outro",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isValidPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export const PAYMENT_METHOD_LABEL_PT_BR: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  transferencia: "Transferência",
  outro: "Outro",
};
