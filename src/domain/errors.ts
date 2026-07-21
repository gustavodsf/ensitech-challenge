export class ApiError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string) {
    super(404, message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(400, message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, message);
    this.name = "ConflictError";
  }
}
