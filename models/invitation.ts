// Email-based company invitations.
//
// Issue side: an admin/owner POSTs an email + role; we insert a 64-hex
// single-use token, expire it 7 days later, and email the invitee with a
// link to /convite/{token}. Compensation: if the email fails to send,
// roll back the token row so the invitee never gets a half-broken state.
//
// Accept side: two branches.
//   - the invitee already has a sacola account → log in → accept → membership
//     row inserted, invitation marked consumed
//   - the invitee has no account → /convite/{token} renders the registration
//     form pre-filled with the invite email → submitting calls
//     `registerAndAcceptInvitation`, which creates an already-activated user
//     (the invite link is itself proof of email ownership) and the membership
//     in one shot
//
// Email match is enforced server-side on accept — a session for X cannot
// consume an invite addressed to Y, no matter how it got the token.

import { randomBytes } from "node:crypto";

import { query } from "infra/database";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import { sendMail } from "infra/mailer";
import { getOrigin } from "infra/webserver";
import { ROLES, isValidRole, type Role } from "models/authorization";
import { getCompanyById, type Company } from "models/company";
import { createMembership, getMembership } from "models/membership";
import {
  createUser,
  deleteUserById,
  getUserById,
  type CreateUserInput,
  type User,
} from "models/user";

export type Invitation = {
  id: string;
  company_id: string;
  email: string;
  role: Role;
  token: string;
  invited_by: string;
  expires_at: Date;
  accepted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

// Public view rendered on /convite/[token]: the invitee may not be logged in
// yet, so we expose only what's needed to render the landing — never the
// token itself or other invitations.
export type PublicInvitationView = {
  email: string;
  role: Role;
  expires_at: Date;
  company: { name: string; slug: string };
  invited_by: { username: string };
};

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FROM_DEFAULT = "Sacola <no-reply@sacola.dev>";

export async function createInvitation(input: {
  companyId: string;
  email: string;
  role: Role;
  invitedBy: string;
}): Promise<Invitation> {
  const email = normalizeEmail(input.email);
  validateRole(input.role);
  await assertNoActiveInvitation(input.companyId, email);
  await assertNotAlreadyMember(input.companyId, email);

  const tokenValue = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);
  const created = await insertInvitationQuery({
    companyId: input.companyId,
    email,
    role: input.role,
    token: tokenValue,
    invitedBy: input.invitedBy,
    expiresAt,
  });

  try {
    await sendInvitationEmail(created);
  } catch (error) {
    await deleteInvitationById(created.id);
    throw error;
  }

  return created;
}

export async function listInvitationsByCompany(companyId: string): Promise<Invitation[]> {
  const result = await query<Invitation>({
    text: `
      SELECT *
      FROM invitations
      WHERE company_id = $1
        AND accepted_at IS NULL
      ORDER BY created_at DESC
    ;`,
    values: [companyId],
  });
  return result.rows;
}

export async function getInvitationById(id: string): Promise<Invitation> {
  const result = await query<Invitation>({
    text: `SELECT * FROM invitations WHERE id = $1 LIMIT 1;`,
    values: [id],
  });
  if (!result.rows[0]) {
    throw new NotFoundError({ message: "Convite não encontrado." });
  }
  return result.rows[0];
}

export async function deleteInvitationById(id: string): Promise<void> {
  await query({ text: `DELETE FROM invitations WHERE id = $1;`, values: [id] });
}

// Reissue a pending invitation: rotate the token (so forwarded copies of the
// old email stop working), bump expires_at, and send the email again. Already
// accepted invitations 400 — there's no work to do, and resending would be a
// surprise for the user who already joined.
export async function resendInvitation(id: string): Promise<Invitation> {
  const existing = await getInvitationById(id);
  if (existing.accepted_at) {
    throw new ValidationError({
      message: "Este convite já foi aceito.",
      action: "Não é necessário reenviar.",
    });
  }

  const newToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);
  const rotated = await rotateInvitationTokenQuery(id, newToken, expiresAt);

  try {
    await sendInvitationEmail(rotated);
  } catch (error) {
    // Don't unwind the rotation — the user explicitly asked us to resend.
    // If the email fails, they can try again; the new token is still valid.
    throw error;
  }
  return rotated;
}

async function rotateInvitationTokenQuery(
  id: string,
  token: string,
  expiresAt: Date,
): Promise<Invitation> {
  const result = await query<Invitation>({
    text: `
      UPDATE invitations
      SET token = $2,
          expires_at = $3,
          updated_at = timezone('utc', now())
      WHERE id = $1
      RETURNING *
    ;`,
    values: [id, token, expiresAt],
  });
  return result.rows[0];
}

export async function getPublicInvitationView(token: string): Promise<PublicInvitationView> {
  const invitation = await getValidInvitationByTokenStrict(token);
  const company = await getCompanyById(invitation.company_id);
  const inviter = await getUserById(invitation.invited_by);
  return {
    email: invitation.email,
    role: invitation.role,
    expires_at: invitation.expires_at,
    company: { name: company.name, slug: company.slug },
    invited_by: { username: inviter.username },
  };
}

// Used by an already-logged-in invitee. The session's email must match the
// invite's, otherwise this becomes a privilege-escalation primitive.
export async function acceptInvitationWithExistingUser(
  token: string,
  user: { id: string; email: string },
): Promise<{ invitation: Invitation; company: Company }> {
  const invitation = await getValidInvitationByTokenStrict(token);
  assertEmailMatches(invitation.email, user.email);
  const company = await getCompanyById(invitation.company_id);
  await ensureMembership(user.id, company.id, invitation.role);
  const consumed = await markInvitationAcceptedQuery(invitation.id);
  return { invitation: consumed, company };
}

// Used by the /convite/[token] landing when the invitee has no account.
// Creates the user as already-activated (the email is proven by the invite
// token itself) and joins the company atomically. If anything after the user
// insert fails, the user row is compensated to keep the email free for retry.
export async function registerAndAcceptInvitation(
  token: string,
  input: { username: string; password: string },
): Promise<{ user: User; company: Company; invitation: Invitation }> {
  const invitation = await getValidInvitationByTokenStrict(token);
  const company = await getCompanyById(invitation.company_id);

  const createInput: CreateUserInput = {
    username: input.username,
    email: invitation.email,
    password: input.password,
    preActivated: true,
  };
  const user = await createUser(createInput);
  try {
    await createMembership({ userId: user.id, companyId: company.id, role: invitation.role });
    const consumed = await markInvitationAcceptedQuery(invitation.id);
    return { user, company, invitation: consumed };
  } catch (error) {
    await deleteUserById(user.id);
    throw error;
  }
}

async function getValidInvitationByTokenStrict(token: string): Promise<Invitation> {
  const result = await query<Invitation>({
    text: `
      SELECT *
      FROM invitations
      WHERE token = $1
        AND accepted_at IS NULL
        AND expires_at > timezone('utc', now())
      LIMIT 1
    ;`,
    values: [token],
  });
  const found = result.rows[0];
  if (!found) {
    throw new ValidationError({
      cause: new Error(`Invitation token ${token} not found, expired, or already used`),
      message: "Convite inválido ou expirado.",
      action: "Solicite um novo convite ao administrador da empresa.",
    });
  }
  return found;
}

async function ensureMembership(userId: string, companyId: string, role: Role): Promise<void> {
  const existing = await getMembership(userId, companyId);
  if (existing) {
    throw new ValidationError({
      cause: new Error(`User ${userId} is already a member of ${companyId}`),
      message: "Você já é membro desta empresa.",
      action: "Acesse a empresa diretamente.",
    });
  }
  await createMembership({ userId, companyId, role });
}

async function assertNoActiveInvitation(companyId: string, email: string): Promise<void> {
  const result = await query<{ id: string }>({
    text: `
      SELECT id
      FROM invitations
      WHERE company_id = $1
        AND LOWER(email) = LOWER($2)
        AND accepted_at IS NULL
        AND expires_at > timezone('utc', now())
      LIMIT 1
    ;`,
    values: [companyId, email],
  });
  if (result.rows[0]) {
    throw new ValidationError({
      message: `Já existe um convite pendente para ${email}.`,
      action: "Aguarde o convidado aceitar ou revogue o convite existente.",
    });
  }
}

async function assertNotAlreadyMember(companyId: string, email: string): Promise<void> {
  const result = await query<{ id: string }>({
    text: `
      SELECT m.id
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.company_id = $1 AND LOWER(u.email) = LOWER($2)
      LIMIT 1
    ;`,
    values: [companyId, email],
  });
  if (result.rows[0]) {
    throw new ValidationError({
      message: `${email} já faz parte da empresa.`,
      action: "Convide outro email.",
    });
  }
}

function assertEmailMatches(inviteEmail: string, sessionEmail: string): void {
  if (inviteEmail.toLowerCase() !== sessionEmail.toLowerCase()) {
    throw new ForbiddenError({
      cause: new Error(`Invite for ${inviteEmail} attempted by session for ${sessionEmail}`),
      message: "Este convite é para outro email.",
      action: `Faça login com ${inviteEmail} ou peça um novo convite.`,
    });
  }
}

function normalizeEmail(email: unknown): string {
  if (typeof email !== "string" || !email.includes("@")) {
    throw new ValidationError({
      message: "Email inválido.",
      action: "Informe um email válido.",
    });
  }
  return email.trim().toLowerCase();
}

function validateRole(role: unknown): asserts role is Role {
  if (!isValidRole(role)) {
    throw new ValidationError({
      message: "Role inválida.",
      action: `Use uma das roles válidas: ${ROLES.join(", ")}.`,
    });
  }
}

async function sendInvitationEmail(invitation: Invitation): Promise<void> {
  const company = await getCompanyById(invitation.company_id);
  const inviter = await getUserById(invitation.invited_by);
  await sendMail({
    from: process.env.EMAIL_FROM ?? FROM_DEFAULT,
    to: invitation.email,
    subject: `Convite para ${company.name} no Sacola`,
    text: buildInvitationEmailText({ invitation, company, inviter }),
  });
}

function buildInvitationEmailText(input: {
  invitation: Invitation;
  company: Company;
  inviter: User;
}): string {
  const link = `${getOrigin()}/convite/${input.invitation.token}`;
  return [
    `Olá!`,
    "",
    `Você foi convidado por ${input.inviter.username} para participar de "${input.company.name}" no Sacola como ${input.invitation.role}.`,
    "",
    "Para aceitar o convite, clique no link abaixo:",
    link,
    "",
    "Este link expira em 7 dias.",
    "",
    "Se você não esperava este convite, ignore este email.",
    "",
    "Atenciosamente,",
    "Equipe Sacola",
  ].join("\n");
}

async function insertInvitationQuery(input: {
  companyId: string;
  email: string;
  role: Role;
  token: string;
  invitedBy: string;
  expiresAt: Date;
}): Promise<Invitation> {
  const result = await query<Invitation>({
    text: `
      INSERT INTO invitations (company_id, email, role, token, invited_by, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    ;`,
    values: [
      input.companyId,
      input.email,
      input.role,
      input.token,
      input.invitedBy,
      input.expiresAt,
    ],
  });
  return result.rows[0];
}

async function markInvitationAcceptedQuery(id: string): Promise<Invitation> {
  const result = await query<Invitation>({
    text: `
      UPDATE invitations
      SET accepted_at = timezone('utc', now()),
          updated_at = timezone('utc', now())
      WHERE id = $1
      RETURNING *
    ;`,
    values: [id],
  });
  return result.rows[0];
}
