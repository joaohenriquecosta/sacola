// Authorization catalog + checks. `PERMISSIONS.default.*` are the feature
// sets we assign at row-creation time (or use for anonymous requests).
// `PERMISSIONS.catalog.*` is the exhaustive list of valid features used to
// catch typos in route handlers — every feature must appear in either tree.
//
// `update:user` is special — it requires a resource and only allows the user
// to update themselves (no `update:user:others` feature yet).

import { InternalServerError } from "infra/errors";

export const PERMISSIONS = {
  default: {
    anonymousUser: ["create:user", "create:session", "read:status"] as const,
    user: [
      "create:session",
      "read:session",
      "update:user",
      "read:status",
      "read:user:self",
    ] as const,
  },
  catalog: {
    user: ["create:user", "read:user", "read:user:self", "update:user"] as const,
    session: ["create:session", "read:session"] as const,
    status: ["read:status"] as const,
    migration: ["read:migration", "create:migration"] as const,
  },
} as const;

export type AuthorizedUser = {
  id: string | null;
  features: readonly string[];
};

export function isAuthorized(
  user: AuthorizedUser,
  feature: string,
  resource?: { id?: string | null } | null,
): boolean {
  validateUser(user);
  validateFeature(feature);

  if (feature === "update:user") {
    if (!resource || !user.features.includes("update:user")) {
      return false;
    }
    return user.id != null && user.id === resource.id;
  }

  return user.features.includes(feature);
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
      if ((features as readonly string[]).includes(feature)) {
        return;
      }
    }
  }

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
