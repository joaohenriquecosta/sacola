// Memberships connect a user to a company with a role. Permission checks on
// company-scoped features (see models/authorization.ts:ROLE_PERMISSIONS) read
// `role` from here. UNIQUE(user_id, company_id) enforces one role per pair.

import { query } from "infra/database";
import { ValidationError } from "infra/errors";
import { ROLES, type Role, isValidRole } from "models/authorization";

export type Membership = {
  id: string;
  user_id: string;
  company_id: string;
  role: Role;
  created_at: Date;
  updated_at: Date;
};

// Member listing joins username from `users` so the UI can render members
// without a second round-trip. `email` is intentionally NOT exposed here —
// admins managing a company shouldn't be handed everyone's contact info.
export type MemberView = Membership & { username: string };

export async function createMembership(input: {
  userId: string;
  companyId: string;
  role: Role;
}): Promise<Membership> {
  validateRole(input.role);
  const result = await query<Membership>({
    text: `
      INSERT INTO memberships (user_id, company_id, role)
      VALUES ($1, $2, $3)
      RETURNING *
    ;`,
    values: [input.userId, input.companyId, input.role],
  });
  return result.rows[0];
}

export async function getMembership(userId: string, companyId: string): Promise<Membership | null> {
  const result = await query<Membership>({
    text: `
      SELECT *
      FROM memberships
      WHERE user_id = $1 AND company_id = $2
      LIMIT 1
    ;`,
    values: [userId, companyId],
  });
  return result.rows[0] ?? null;
}

export async function listMembersByCompany(companyId: string): Promise<MemberView[]> {
  const result = await query<MemberView>({
    text: `
      SELECT
        m.id, m.user_id, m.company_id, m.role, m.created_at, m.updated_at,
        u.username
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.company_id = $1
      ORDER BY m.created_at ASC
    ;`,
    values: [companyId],
  });
  return result.rows;
}

export async function listMembershipsByUser(userId: string): Promise<Membership[]> {
  const result = await query<Membership>({
    text: `
      SELECT *
      FROM memberships
      WHERE user_id = $1
      ORDER BY created_at ASC
    ;`,
    values: [userId],
  });
  return result.rows;
}

export async function updateMembershipRole(id: string, role: Role): Promise<Membership> {
  validateRole(role);
  const result = await query<Membership>({
    text: `
      UPDATE memberships
      SET role = $2,
          updated_at = timezone('utc', now())
      WHERE id = $1
      RETURNING *
    ;`,
    values: [id, role],
  });
  return result.rows[0];
}

export async function deleteMembership(id: string): Promise<void> {
  await query({ text: `DELETE FROM memberships WHERE id = $1;`, values: [id] });
}

export async function deleteMembershipsByCompany(companyId: string): Promise<void> {
  await query({
    text: `DELETE FROM memberships WHERE company_id = $1;`,
    values: [companyId],
  });
}

function validateRole(role: unknown): asserts role is Role {
  if (!isValidRole(role)) {
    throw new ValidationError({
      message: "Role inválida.",
      action: `Use uma das roles válidas: ${ROLES.join(", ")}.`,
    });
  }
}
