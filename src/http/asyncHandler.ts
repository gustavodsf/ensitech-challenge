import { NextFunction, Request, Response } from "express";

type Handler = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

/**
 * Wraps a route handler so any thrown/rejected error is forwarded to
 * Express's error-handling middleware instead of crashing the process.
 */
export const asyncHandler = (handler: Handler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};
