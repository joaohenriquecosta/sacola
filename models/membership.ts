// Memberships connect a user to a company with a role + an explicit feature
// list. UNIQUE(user_id, company_id) enforces one membership per pair.
//
// `role` is the named preset (display label, ownership marker). `features`
// is the source of truth for scoped permission checks — it lets an admin
// give one member custom permissions without touching the role.
//
// On create: features = ROLE_PERMISSIONS[role] (copied, not aliased).
// On role change via updateMembershipRole: both are rewritten — role-based
// presets reset the granular state. updateMembershipFeatures keeps the role
// and only rewrites features, for granular edits.

import { query } from "infra/database";
import { ValidationError } from "infra/errors";
import { ROLE_PERMISSIONS, ROLES, isValidRole, type Role } from "@/lib/roles";

export type Membership = {
  id: string;
  user_id: string;
  company_id: string;
  role: Role;
  features: string[];
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
  // Optional override: when an invite was issued with a granular feature set
  // (different from ROLE_PERMISSIONS[role]) the invite-accept path passes it
  // through so the new membership lands with exactly what the inviter chose.
  // Caller is expected to have sanitized the list.
  features?: readonly string[];
}): Promise<Membership> {
  validateRole(input.role);
  const features = input.features ? [...input.features] : [...ROLE_PERMISSIONS[input.role]];
  const result = await query<Membership>({
    text: `
      INSERT INTO memberships (user_id, company_id, role, features)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    ;`,
    values: [input.userId, input.companyId, input.role, features],
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
        m.id, m.user_id, m.company_id, m.role, m.features, m.created_at, m.updated_at,
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

// Switch to a named preset: both role and features get rewritten.
export async function updateMembershipRole(id: string, role: Role): Promise<Membership> {
  validateRole(role);
  const features = [...ROLE_PERMISSIONS[role]];
  const result = await query<Membership>({
    text: `
      UPDATE memberships
      SET role = $2,
          features = $3,
          updated_at = timezone('utc', now())
      WHERE id = $1
      RETURNING *
    ;`,
    values: [id, role, features],
  });
  return result.rows[0];
}

// Granular edit: role stays, features get the new list verbatim. Caller is
// expected to have sanitized the list (lib/roles.ts:sanitizeFeatures).
export async function updateMembershipFeatures(
  id: string,
  features: string[],
): Promise<Membership> {
  const result = await query<Membership>({
    text: `
      UPDATE memberships
      SET features = $2,
          updated_at = timezone('utc', now())
      WHERE id = $1
      RETURNING *
    ;`,
    values: [id, features],
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

// Atomic ownership swap: the current owner becomes admin, a chosen member
// becomes owner. Each role change also rewrites features (preset semantics),
// so the demoted owner loses `delete:company` and the new owner gains it.
//
// Two updates in sequence (no DB transaction — the project uses
// client-per-query); we compensate by reverting the first update if the
// second fails so we never leave the company without an owner.
//
// Caller MUST verify:
//   - caller is the current owner of the company (delete:company permission)
//   - target user is an existing member of the company
//   - target is not already the owner (caller can't transfer to themselves)
export async function transferOwnership(input: {
  companyId: string;
  currentOwnerUserId: string;
  newOwnerUserId: string;
}): Promise<{ newOwner: Membership; demotedOwner: Membership }> {
  if (input.currentOwnerUserId === input.newOwnerUserId) {
    throw new ValidationError({
      message: "Não é possível transferir a propriedade para você mesmo.",
      action: "Escolha outro membro.",
    });
  }

  const target = await getMembership(input.newOwnerUserId, input.companyId);
  if (!target) {
    throw new ValidationError({
      message: "O novo dono precisa ser um membro existente da empresa.",
      action: "Convide a pessoa antes de transferir a propriedade.",
    });
  }

  const current = await getMembership(input.currentOwnerUserId, input.companyId);
  if (!current || current.role !== "owner") {
    throw new ValidationError({
      cause: new Error(
        `Membership for ${input.currentOwnerUserId} in ${input.companyId} is not owner`,
      ),
      message: "Apenas o dono atual pode transferir a propriedade.",
    });
  }

  const demotedOwner = await updateMembershipRole(current.id, "admin");
  try {
    const newOwner = await updateMembershipRole(target.id, "owner");
    return { newOwner, demotedOwner };
  } catch (error) {
    // Revert: re-promote the original owner so the company never sits with
    // zero owners (the most catastrophic state — nobody can delete it or
    // transfer it out).
    await updateMembershipRole(current.id, "owner").catch(() => {});
    throw error;
  }
}

function validateRole(role: unknown): asserts role is Role {
  if (!isValidRole(role)) {
    throw new ValidationError({
      message: "Role inválida.",
      action: `Use uma das roles válidas: ${ROLES.join(", ")}.`,
    });
  }
}
