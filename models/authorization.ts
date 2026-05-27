// Authorization catalog + checks.
//
// Two layers stacked here:
//
// 1) GLOBAL features live on `users.features` (PERMISSIONS.default.*). Used for
//    system-level abilities that don't belong to any company (login, profile,
//    creating a company).
//
// 2) SCOPED features live in `ROLE_PERMISSIONS[role]`, keyed by the user's
//    `memberships.role` in a given company. The role catalog (pure, no DB)
//    is in `@/lib/roles`; this file does the runtime check.
//
// `isAuthorized` decides which layer applies by looking up the feature in
// the catalogs:
//   - feature in PERMISSIONS.default.* / PERMISSIONS.catalog.* → global check
//     against `user.features`
//   - feature in ROLE_PERMISSIONS[*] → company-scoped check via a membership
//     lookup; caller MUST pass `{ companyId }` or a resource with company_id
//
// `update:user` keeps its special case (resource required, self only) — it's
// global but resource-bound.

import { ForbiddenError, InternalServerError } from "infra/errors";
import {
  ASSIGNABLE_ROLES,
  ROLES,
  ROLE_PERMISSIONS,
  SCOPED_FEATURES,
  isValidRole,
  type Role,
} from "@/lib/roles";
import { getMembership } from "models/membership";

// Re-export the catalog so route handlers + tests have one import path.
// Client components MUST import from `@/lib/roles` directly to avoid pulling
// the DB layer into the browser bundle.
export { ASSIGNABLE_ROLES, ROLES, ROLE_PERMISSIONS, isValidRole };
export type { Role };

export const PERMISSIONS = {
  default: {
    anonymousUser: [
      "create:user",
      "create:session",
      "read:status",
      "read:activation_token",
    ] as const,
    // Users who registered but haven't clicked the activation link yet.
    // Can do nothing except be activated.
    unactivatedUser: ["read:activation_token"] as const,
    activatedUser: [
      "create:session",
      "read:session",
      "update:user",
      "read:status",
      "read:user:self",
      "create:company",
    ] as const,
  },
  catalog: {
    user: ["create:user", "read:user", "read:user:self", "update:user"] as const,
    session: ["create:session", "read:session"] as const,
    status: ["read:status"] as const,
    migration: ["read:migration", "create:migration"] as const,
    activation_token: ["read:activation_token"] as const,
    company: ["create:company"] as const,
  },
} as const;

export type AuthorizedUser = {
  id: string | null;
  features: readonly string[];
};

export type ResourceWithCompanyId = {
  id?: string | null;
  company_id?: string | null;
};

export type AuthorizationScope = {
  companyId?: string;
  resource?: ResourceWithCompanyId | null;
};

// Async because scoped checks need a membership lookup. Global checks are
// resolved without DB access.
export async function isAuthorized(
  user: AuthorizedUser,
  feature: string,
  scope: AuthorizationScope = {},
): Promise<boolean> {
  validateUser(user);
  validateFeature(feature);

  // Special case: update:user requires `resource.id` and matches self only.
  if (feature === "update:user") {
    const resource = scope.resource;
    if (!resource || !user.features.includes("update:user")) {
      return false;
    }
    return user.id != null && user.id === resource.id;
  }

  if (SCOPED_FEATURES.has(feature)) {
    if (user.id == null) return false;
    const companyId = scope.companyId ?? scope.resource?.company_id ?? null;
    if (!companyId) {
      throw new InternalServerError({
        cause: new Error(`Scoped feature "${feature}" requires companyId or resource.company_id`),
      });
    }
    const membership = await getMembership(user.id, companyId);
    if (!membership) return false;
    // Source of truth: per-membership features (set on creation from
    // ROLE_PERMISSIONS[role] and freely edited via the granular UI).
    return membership.features.includes(feature);
  }

  return user.features.includes(feature);
}

// Convenience: throws ForbiddenError when not authorized. Lets callers skip
// the boolean check + manual throw.
export async function requireAuthorization(
  user: AuthorizedUser,
  feature: string,
  scope: AuthorizationScope = {},
): Promise<void> {
  if (await isAuthorized(user, feature, scope)) return;
  throw new ForbiddenError({
    cause: new Error(`Missing feature "${feature}"`),
    message: "Você não possui permissão para executar esta ação.",
    action: `Verifique se o seu usuário possui a feature "${feature}".`,
  });
}

export function filterOutput(
  user: AuthorizedUser,
  feature: string,
  resource: Record<string, unknown>,
): Record<string, unknown> {
  validateUser(user);
  validateFeature(feature);
  validateResource(resource);

  if (feature === "read:user") {
    return {
      id: resource.id,
      username: resource.username,
      features: resource.features,
      created_at: resource.created_at,
      updated_at: resource.updated_at,
    };
  }

  if (feature === "read:user:self") {
    if (user.id != null && user.id === resource.id) {
      return {
        id: resource.id,
        username: resource.username,
        email: resource.email,
        features: resource.features,
        created_at: resource.created_at,
        updated_at: resource.updated_at,
      };
    }
    return {};
  }

  if (feature === "read:session") {
    if (user.id != null && user.id === resource.user_id) {
      return {
        id: resource.id,
        user_id: resource.user_id,
        token: resource.token,
        expires_at: resource.expires_at,
        created_at: resource.created_at,
        updated_at: resource.updated_at,
      };
    }
    return {};
  }

  if (feature === "read:activation_token") {
    return {
      id: resource.id,
      user_id: resource.user_id,
      used_at: resource.used_at,
      expires_at: resource.expires_at,
      created_at: resource.created_at,
      updated_at: resource.updated_at,
    };
  }

  if (feature === "read:company") {
    return {
      id: resource.id,
      name: resource.name,
      slug: resource.slug,
      created_at: resource.created_at,
      updated_at: resource.updated_at,
    };
  }

  if (feature === "read:member") {
    return {
      id: resource.id,
      user_id: resource.user_id,
      company_id: resource.company_id,
      username: resource.username,
      role: resource.role,
      created_at: resource.created_at,
      updated_at: resource.updated_at,
    };
  }

  return resource;
}

function validateUser(user: unknown): asserts user is AuthorizedUser {
  if (
    !user ||
    typeof user !== "object" ||
    !Array.isArray((user as { features?: unknown }).features)
  ) {
    throw new InternalServerError({
      cause: new Error("Model `authorization.ts` requires a `user` with `features`."),
    });
  }
}

function validateFeature(feature: string): void {
  if (!feature) {
    throw new InternalServerError({
      cause: new Error("Model `authorization.ts` requires a non-empty `feature`."),
    });
  }

  for (const group of Object.values(PERMISSIONS)) {
    for (const features of Object.values(group)) {
      if ((features as readonly string[]).includes(feature)) return;
    }
  }
  if (SCOPED_FEATURES.has(feature)) return;

  throw new InternalServerError({
    cause: new Error(`Unknown feature \`${feature}\`.`),
  });
}

function validateResource(resource: unknown): void {
  if (!resource || typeof resource !== "object") {
    throw new InternalServerError({
      cause: new Error("Model `authorization.ts` requires a `resource` object."),
    });
  }
}
