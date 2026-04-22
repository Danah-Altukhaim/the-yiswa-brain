export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export const unauthorized = (msg = "Unauthorized") => new AppError("UNAUTHORIZED", msg, 401);
export const forbidden = (msg = "Forbidden") => new AppError("FORBIDDEN", msg, 403);
export const notFound = (msg = "Not found") => new AppError("NOT_FOUND", msg, 404);
export const badRequest = (msg: string, code = "BAD_REQUEST") => new AppError(code, msg, 400);
export const conflict = (msg: string) => new AppError("CONFLICT", msg, 409);
