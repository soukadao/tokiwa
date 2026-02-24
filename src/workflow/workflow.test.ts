import { expect, test } from "vitest";
import {
  ConflictError,
  InvalidArgumentError,
  NotFoundError,
} from "../core/errors.js";
import { Node } from "./node.js";
import { Workflow } from "./workflow.js";

const WORKFLOW_ID = "workflow-1";
const NODE_A = "A";
const NODE_B = "B";
const NODE_C = "C";
const INVALID_TYPE = "invalid";
const DEFAULT_TYPE = "workflow";
const CHATFLOW_TYPE = "chatflow";

const createNode = (id: string): Node => new Node({ id, handler: () => {} });

test("workflow validates id and type", () => {
  expect(() => new Workflow({ id: "" })).toThrow(InvalidArgumentError);
  expect(
    () => new Workflow({ id: WORKFLOW_ID, type: INVALID_TYPE as never }),
  ).toThrow(InvalidArgumentError);
});

test("workflow defaults type and stores nodes", () => {
  const workflow = new Workflow({
    id: WORKFLOW_ID,
    nodes: [createNode(NODE_A)],
  });

  expect(workflow.type).toBe(DEFAULT_TYPE);
  expect(workflow.getNodes()).toHaveLength(1);
});

test("workflow allows chatflow type", () => {
  const workflow = new Workflow({ id: WORKFLOW_ID, type: CHATFLOW_TYPE });
  expect(workflow.type).toBe(CHATFLOW_TYPE);
});

test("workflow addNode rejects duplicates", () => {
  const workflow = new Workflow({ id: WORKFLOW_ID });
  const node = createNode(NODE_A);
  workflow.addNode(node);

  expect(() => workflow.addNode(node)).toThrow(ConflictError);
});

test("workflow connect validates nodes", () => {
  const workflow = new Workflow({ id: WORKFLOW_ID });
  workflow.addNode(createNode(NODE_A));

  expect(() => workflow.connect(NODE_A, NODE_B)).toThrow(NotFoundError);
  expect(() => workflow.connect(NODE_B, NODE_A)).toThrow(NotFoundError);
});

test("workflow execution plan respects dependencies", () => {
  const workflow = new Workflow({
    id: WORKFLOW_ID,
    nodes: [createNode(NODE_A), createNode(NODE_B), createNode(NODE_C)],
  });

  workflow.connect(NODE_A, NODE_B);
  workflow.connect(NODE_A, NODE_C);

  const plan = workflow.getExecutionPlan();
  const order = plan.map((node) => node.id);

  expect(order.indexOf(NODE_A)).toBeLessThan(order.indexOf(NODE_B));
  expect(order.indexOf(NODE_A)).toBeLessThan(order.indexOf(NODE_C));
});
