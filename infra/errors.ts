// Custom error hierarchy with toJSON() emitting snake_case for HTTP payloads.
// AuthenticationError and InternalServerError deliberately omit `cause`
// to prevent leaking internal details (anti-enumeration / anti-stack-leak).
//
// Mirrors automanews/infra/errors.js in spirit, ported to TypeScript.

export type SerializedError = {
  name: string;
  status_code: number;
  message: string;
  action: string;
  cause?: unknown;
};

function serializeError(error: AppError, extra: Record<string, unknown> = {}): SerializedError {
  return {
    name: error.name,
    status_code: error.statusCode,
    message: error.message,
    action: error.action,
    ...extra,
  };
}

function nestedJSON(cause: unknown): unknown {
  if (!cause || typeof cause !== "object") return undefined;
  const fn = (cause as { toJSON?: () => unknown }).toJSON;
  return typeof fn === "function" ? fn.call(cause) : undefined;
}

export abstract class AppError extends Error {
  abstract statusCode: number;
  abstract action: string;
  abstract toJSON(): SerializedError;
}

export class InternalServerError extends AppError {
  statusCode: number;
  action: string;

  constructor(opts: { cause?: unknown; statusCode?: number } = {}) {
    super("Um erro interno do servidor ocorreu.", { cause: opts.cause });
    this.name = "InternalServerError";
    this.statusCode = opts.statusCode ?? 500;
    this.action = "Se o problema persistir, entre em contato com o suporte.";
  }

  // Omits `cause` so internal details never reach clients.
  toJSON(): SerializedError {
    return serializeError(this);
  }
}

export class MethodNotAllowedError extends AppError {
  statusCode = 405;
  action = "Use um método HTTP válido para o endpoint.";

  constructor() {
    super("Método não permitido.");
    this.name = "MethodNotAllowedError";
  }

  toJSON(): SerializedError {
    return serializeError(this);
  }
}

export class ServiceError extends AppError {
  statusCode = 503;
  action: string;

  constructor(opts: { cause?: unknown; message?: string; action?: string } = {}) {
    super(opts.message ?? "Ocorreu um erro ao executar o serviço.", {
      cause: opts.cause,
    });
    this.name = "ServiceError";
    this.action = opts.action ?? "Verifique se o serviço está disponível.";
  }

  toJSON(): SerializedError {
    const cause = nestedJSON(this.cause);
    return serializeError(this, cause ? { cause } : {});
  }
}

export class ValidationError extends AppError {
  statusCode = 400;
  action: string;

  constructor(opts: { cause?: unknown; message?: string; action?: string }) {
    super(opts.message ?? "Ocorreu um erro de validação.", { cause: opts.cause });
    this.name = "ValidationError";
    this.action = opts.action ?? "Verifique se os dados fornecidos são válidos.";
  }

  toJSON(): SerializedError {
    const cause = nestedJSON(this.cause);
    return serializeError(this, cause ? { cause } : {});
  }
}

export class NotFoundError extends AppError {
  statusCode = 404;
  action: string;

  constructor(opts: { cause?: unknown; message?: string; action?: string } = {}) {
    super(opts.message ?? "Recurso não encontrado.", { cause: opts.cause });
    this.name = "NotFoundError";
    this.action =
      opts.action ?? "Verifique se o recurso existe e se os parâmetros fornecidos são válidos.";
  }

  toJSON(): SerializedError {
    const cause = nestedJSON(this.cause);
    return serializeError(this, cause ? { cause } : {});
  }
}

export class ForbiddenError extends AppError {
  statusCode = 403;
  action: string;

  constructor(opts: { cause?: unknown; message?: string; action?: string } = {}) {
    super(opts.message ?? "Você não possui permissão para executar esta ação.", {
      cause: opts.cause,
    });
    this.name = "ForbiddenError";
    this.action = opts.action ?? "Verifique as features necessárias para executar esta ação.";
  }

  toJSON(): SerializedError {
    const cause = nestedJSON(this.cause);
    return serializeError(this, cause ? { cause } : {});
  }
}

export class AuthenticationError extends AppError {
  statusCode = 401;
  action: string;

  constructor(opts: { cause?: unknown; message?: string; action?: string } = {}) {
    super(opts.message ?? "Erro de autenticação.", { cause: opts.cause });
    this.name = "AuthenticationError";
    this.action = opts.action ?? "Verifique se o login e a senha fornecidos são válidos.";
  }

  // Omits `cause` so nested NotFoundError etc. is never sent to clients
  // (anti-enumeration).
  toJSON(): SerializedError {
    return serializeError(this);
  }
}
