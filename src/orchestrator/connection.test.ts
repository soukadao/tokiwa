import { expect, test } from "vitest";
import { Connection } from "./connection.js";

const NAME = "primary";
const META_INITIAL = { region: "us" };
const META_UPDATE = { version: 2 };

const META_EXPECTED = { ...META_INITIAL, ...META_UPDATE };
const DISCONNECTED = "disconnected";
const CONNECTED = "connected";

test("connection updates state and metadata", () => {
  const connection = new Connection({ name: NAME, metadata: META_INITIAL });

  expect(connection.getState()).toBe(DISCONNECTED);
  connection.connect();
  expect(connection.getState()).toBe(CONNECTED);
  connection.disconnect();
  expect(connection.getState()).toBe(DISCONNECTED);

  connection.updateMetadata(META_UPDATE);
  expect(connection.getMetadata()).toEqual(META_EXPECTED);

  const snapshot = connection.getMetadata();
  snapshot.region = "eu";
  expect(connection.getMetadata()).toEqual(META_EXPECTED);
});
