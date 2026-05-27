// Money is stored as integer cents (`price_cents`). UI shows BRL with two
// decimals. Kept here so any place that renders a price uses the same
// formatter.

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatCentsBRL(cents: number): string {
  return BRL.format(cents / 100);
}

// Parse a "12,90" / "12.90" / "1.234,56" / "1234.56" string into integer
// cents. Returns null when the input doesn't look like a price (so the form
// can surface the validation message without throwing).
export function parseBRLToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Normalize: if the input has both '.' and ',', treat ',' as decimal and
  // '.' as thousands. If it only has one, that one is decimal.
  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");
  let normalized: string;
  if (hasComma && hasDot) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = trimmed.replace(",", ".");
  } else {
    normalized = trimmed;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
