// Products: a company's catalog. Strictly scoped — every read/write goes
// through company_id and a permission gate at the route layer. No public
// listing endpoint; admins of company A never see catalog of company B.

import { query } from "infra/database";
import { NotFoundError, ValidationError } from "infra/errors";

export type Product = {
  id: string;
  company_id: string;
  name: string;
  // Money kept in integer cents — never floats. Caller is responsible for
  // formatting (e.g. "R$ 12,90"). Storing cents matches the column's
  // integer type and avoids the float-rounding bug class entirely.
  price_cents: number;
  unit: string;
  created_at: Date;
  updated_at: Date;
};

const NAME_MIN = 1;
const NAME_MAX = 120;
const UNIT_MIN = 1;
const UNIT_MAX = 16;
const PRICE_MAX_CENTS = 100_000_000; // R$ 1.000.000,00 — sanity cap

export type CreateProductInput = {
  companyId: string;
  name: string;
  priceCents: number;
  unit: string;
};

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const name = normalizeName(input.name);
  const unit = normalizeUnit(input.unit);
  validatePrice(input.priceCents);

  const result = await query<Product>({
    text: `
      INSERT INTO products (company_id, name, price_cents, unit)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    ;`,
    values: [input.companyId, name, input.priceCents, unit],
  });
  return result.rows[0];
}

export async function getProductById(id: string): Promise<Product> {
  const result = await query<Product>({
    text: `SELECT * FROM products WHERE id = $1 LIMIT 1;`,
    values: [id],
  });
  if (!result.rows[0]) {
    throw new NotFoundError({
      cause: new Error(`Product ${id} not found`),
      message: "Produto não encontrado.",
    });
  }
  return result.rows[0];
}

export async function listProductsByCompany(companyId: string): Promise<Product[]> {
  const result = await query<Product>({
    text: `
      SELECT *
      FROM products
      WHERE company_id = $1
      ORDER BY created_at DESC
    ;`,
    values: [companyId],
  });
  return result.rows;
}

export type UpdateProductInput = {
  name?: string;
  priceCents?: number;
  unit?: string;
};

// PATCH semantics: only the fields the caller provided get rewritten. The
// dynamic SQL stays readable because the field set is small and bounded.
export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) {
    sets.push(`name = $${sets.length + 2}`);
    values.push(normalizeName(input.name));
  }
  if (input.priceCents !== undefined) {
    validatePrice(input.priceCents);
    sets.push(`price_cents = $${sets.length + 2}`);
    values.push(input.priceCents);
  }
  if (input.unit !== undefined) {
    sets.push(`unit = $${sets.length + 2}`);
    values.push(normalizeUnit(input.unit));
  }

  if (sets.length === 0) {
    throw new ValidationError({
      message: "Nada para atualizar.",
      action: "Envie pelo menos um campo: name, price_cents ou unit.",
    });
  }

  sets.push(`updated_at = timezone('utc', now())`);

  const result = await query<Product>({
    text: `UPDATE products SET ${sets.join(", ")} WHERE id = $1 RETURNING *;`,
    values: [id, ...values],
  });
  if (!result.rows[0]) {
    throw new NotFoundError({
      cause: new Error(`Product ${id} not found`),
      message: "Produto não encontrado.",
    });
  }
  return result.rows[0];
}

export async function deleteProduct(id: string): Promise<void> {
  const result = await query({
    text: `DELETE FROM products WHERE id = $1;`,
    values: [id],
  });
  if (result.rowCount === 0) {
    throw new NotFoundError({
      cause: new Error(`Product ${id} not found`),
      message: "Produto não encontrado.",
    });
  }
}

// Cascade target for company deletion. Keep here so company.ts doesn't have
// to know the products table directly.
export async function deleteProductsByCompany(companyId: string): Promise<void> {
  await query({
    text: `DELETE FROM products WHERE company_id = $1;`,
    values: [companyId],
  });
}

function normalizeName(name: unknown): string {
  if (typeof name !== "string") {
    throw new ValidationError({
      message: "Nome inválido.",
      action: "Informe um nome de produto válido.",
    });
  }
  const trimmed = name.trim();
  if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
    throw new ValidationError({
      message: `Nome precisa ter entre ${NAME_MIN} e ${NAME_MAX} caracteres.`,
    });
  }
  return trimmed;
}

function normalizeUnit(unit: unknown): string {
  if (typeof unit !== "string") {
    throw new ValidationError({
      message: "Unidade inválida.",
      action: "Informe a unidade (ex.: kg, un, pacote).",
    });
  }
  const trimmed = unit.trim();
  if (trimmed.length < UNIT_MIN || trimmed.length > UNIT_MAX) {
    throw new ValidationError({
      message: `Unidade precisa ter entre ${UNIT_MIN} e ${UNIT_MAX} caracteres.`,
    });
  }
  return trimmed;
}

function validatePrice(priceCents: unknown): asserts priceCents is number {
  if (
    typeof priceCents !== "number" ||
    !Number.isInteger(priceCents) ||
    priceCents < 0 ||
    priceCents > PRICE_MAX_CENTS
  ) {
    throw new ValidationError({
      message: "Preço inválido.",
      action: "Informe o preço em centavos (inteiro não negativo).",
    });
  }
}
