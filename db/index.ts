import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export interface D1ResultLike<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  error?: string;
  meta: {
    changes?: number;
  };
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
  run<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
}

export interface D1DatabaseBinding {
  prepare(query: string): D1PreparedStatementLike;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatementLike[],
  ): Promise<D1ResultLike<T>[]>;
}

export class DatabaseUnavailableError extends Error {
  constructor() {
    super(
      "Cloudflare D1 binding `DB` is unavailable. Configure the D1 binding and apply the generated Drizzle migration before using write APIs.",
    );
    this.name = "DatabaseUnavailableError";
  }
}

function isD1Binding(value: unknown): value is D1DatabaseBinding {
  return (
    typeof value === "object" &&
    value !== null &&
    "prepare" in value &&
    typeof value.prepare === "function" &&
    "batch" in value &&
    typeof value.batch === "function"
  );
}

export function getD1(): D1DatabaseBinding | null {
  const binding = (env as Record<string, unknown>).DB;
  return isD1Binding(binding) ? binding : null;
}

export function requireD1(): D1DatabaseBinding {
  const binding = getD1();
  if (!binding) {
    throw new DatabaseUnavailableError();
  }
  return binding;
}

export function getDb() {
  return drizzle(requireD1() as D1Database, { schema });
}
