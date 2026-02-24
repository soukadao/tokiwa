import { expect, test } from "vitest";
import {
  ConflictError,
  InvalidArgumentError,
  NotFoundError,
} from "../core/errors.js";
import { Node } from "./node.js";
import { Workflow } from "./workflow.js";

const MIN_ID_LENGTH = 1;
const INVALID_TYPE = "invalid";
const DEFAULT_TYPE = "workflow";
const CHATFLOW_TYPE = "chatflow";

const createNode = (): Node => new Node({ handler: () => {} });

test("workflow validates type", () => {
  expect(() => new Workflow({ type: INVALID_TYPE as never })).toThrow(
    InvalidArgumentError,
  );
});

test("workflow defaults type and stores nodes", () => {
  const workflow = new Workflow({
    nodes: [createNode()],
  });

  expect(workflow.type).toBe(DEFAULT_TYPE);
  expect(workflow.getNodes()).toHaveLength(1);
  expect(workflow.id.length).toBeGreaterThanOrEqual(MIN_ID_LENGTH);
});

test("workflow allows chatflow type", () => {
  const workflow = new Workflow({ type: CHATFLOW_TYPE });
  expect(workflow.type).toBe(CHATFLOW_TYPE);
});

test("workflow addNode rejects duplicates", () => {
  const workflow = new Workflow({});
  const node = createNode();
  workflow.addNode(node);

  expect(() => workflow.addNode(node)).toThrow(ConflictError);
});

test("workflow connect validates nodes", () => {
  const workflow = new Workflow({});
  const nodeA = createNode();
  const nodeB = createNode();
  workflow.addNode(nodeA);

  expect(() => workflow.connect(nodeA.id, nodeB.id)).toThrow(NotFoundError);
  expect(() => workflow.connect(nodeB.id, nodeA.id)).toThrow(NotFoundError);
});

test("workflow execution plan respects dependencies", () => {
  const nodeA = createNode();
  const nodeB = createNode();
  const nodeC = createNode();
  const workflow = new Workflow({
    nodes: [nodeA, nodeB, nodeC],
  });

  workflow.connect(nodeA.id, nodeB.id);
  workflow.connect(nodeA.id, nodeC.id);

  const plan = workflow.getExecutionPlan();
  const order = plan.map((node) => node.id);

  expect(order.indexOf(nodeA.id)).toBeLessThan(order.indexOf(nodeB.id));
  expect(order.indexOf(nodeA.id)).toBeLessThan(order.indexOf(nodeC.id));
});
