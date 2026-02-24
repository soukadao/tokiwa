export class AppError extends Error {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

export class InvalidArgumentError extends AppError {}

export class RuntimeError extends AppError {}

export class NotFoundError extends AppError {}

export class ConflictError extends AppError {}

export class StateError extends AppError {}

export class DependencyError extends AppError {}

export class CyclicDependencyError extends DependencyError {}

export class SerializationError extends AppError {}
