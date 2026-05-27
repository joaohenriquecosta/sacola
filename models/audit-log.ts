// Append-only audit log of company-scoped actions. Route handlers call
// `logAuditEvent` after a successful mutation; lookups are admin/owner via
// `read:audit_log` (lives in COMPANY_MANAGEMENT_PERMISSIONS, see lib/roles).
//
// Why route-handler-side, not model-side: keeping models pure means the same
// model functions are reusable from CLI, tests, the orchestrator, etc.
// without phantom audit entries. The HTTP layer is where "this user did
// something in their session" is well-defined.
//
// We don't model an Action enum — the action column is a free string so new
// event types ship without code touching this file. Callers settle on names
// like `member.role_changed`, `invitation.created`, etc.

import { query } from "infra/database";

export type AuditEvent = {
  id: string;
  company_id: string;
  actor_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

// Listing joins the actor's username so the UI doesn't round-trip per row.
// Email stays off the listing — auditors see who, not how to reach them.
export type AuditEventView = AuditEvent & { actor_username: string };

// Fire-and-forget wrapper for route handlers. We never want a logging
// failure to fail the user's mutation (the action already happened in the
// DB; returning 500 would tempt them to retry and create duplicate state).
// Failures land in `console.error` so they show up in the platform logs.
export async function logSafe(input: Parameters<typeof logAuditEvent>[0]): Promise<void> {
  try {
    await logAuditEvent(input);
  } catch (error) {
    console.error("audit log failed", { action: input.action, error });
  }
}

export async function logAuditEvent(input: {
  companyId: string;
  actorId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<AuditEvent> {
  const result = await query<AuditEvent>({
    text: `
      INSERT INTO audit_log (company_id, actor_id, action, target_type, target_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    ;`,
    values: [
      input.companyId,
      input.actorId,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  });
  return result.rows[0];
}

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

export async function listAuditEventsByCompany(
  companyId: string,
  options: { limit?: number } = {},
): Promise<AuditEventView[]> {
  const limit = Math.min(options.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const result = await query<AuditEventView>({
    text: `
      SELECT a.*, u.username AS actor_username
      FROM audit_log a
      JOIN users u ON u.id = a.actor_id
      WHERE a.company_id = $1
      ORDER BY a.created_at DESC
      LIMIT $2
    ;`,
    values: [companyId, limit],
  });
  return result.rows;
}
