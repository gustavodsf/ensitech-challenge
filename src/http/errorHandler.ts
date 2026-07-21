import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../domain/errors";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "ValidationError",
      message: "Invalid request body",
      details: err.errors.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
    });
    return;
  }

  // eslint-disable-next-line no-console
  console.error("Unexpected error:", err);
  res.status(500).json({
    error: "InternalServerError",
    message: "An unexpected error occurred",
  });
}
