import { expect, test } from "vitest";
import {
  AppError,
  ConflictError,
  CyclicDependencyError,
  DependencyError,
  InvalidArgumentError,
  NotFoundError,
  RuntimeError,
  SerializationError,
  StateError,
} from "./errors.js";

const MESSAGE = "error";

test("custom errors set name", () => {
  const errors: Error[] = [
    new AppError(MESSAGE),
    new ConflictError(MESSAGE),
    new CyclicDependencyError(MESSAGE),
    new DependencyError(MESSAGE),
    new InvalidArgumentError(MESSAGE),
    new NotFoundError(MESSAGE),
    new RuntimeError(MESSAGE),
    new SerializationError(MESSAGE),
    new StateError(MESSAGE),
  ];

  expect(errors.map((error) => error.name)).toEqual([
    "AppError",
    "ConflictError",
    "CyclicDependencyError",
    "DependencyError",
    "InvalidArgumentError",
    "NotFoundError",
    "RuntimeError",
    "SerializationError",
    "StateError",
  ]);
});
