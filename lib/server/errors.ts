export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isMissingDatabaseSchema(error: unknown): boolean {
  const messages: string[] = [];
  let current: unknown = error;

  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }

  return messages.some(
    (message) =>
      message.includes("no such table") ||
      message.includes("D1_ERROR: no such table"),
  );
}

export function canUseDemoDashboard(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "DatabaseUnavailableError") ||
    isMissingDatabaseSchema(error)
  );
}
