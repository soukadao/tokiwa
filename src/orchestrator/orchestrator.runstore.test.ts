import { expect, test } from "vitest";
import { InMemoryRunStore, Node, Workflow } from "../workflow/index.js";
import { Orchestrator } from "./orchestrator.js";

const WORKFLOW_ID = "runstore-flow";
const NODE_ID = "task";
const INPUT_VALUE = 42;

interface Payload {
  value: number;
}

test("runStore saves workflow run records", async () => {
  const runStore = new InMemoryRunStore();
  const orchestrator = new Orchestrator({ runStore });

  const workflow = new Workflow<unknown, Payload>({
    id: WORKFLOW_ID,
    nodes: [
      new Node<unknown, Payload, { result: number }>({
        id: NODE_ID,
        handler: ({ input }) => ({ result: input?.value ?? 0 }),
      }),
    ],
  });

  orchestrator.registerWorkflow(workflow);
  const result = await orchestrator.runWorkflow<unknown, Payload>(WORKFLOW_ID, {
    input: { value: INPUT_VALUE },
  });

  const record = await runStore.get(result.runId);

  expect(record?.workflowId).toBe(WORKFLOW_ID);
  expect(record?.status).toBe("succeeded");
  expect(record?.results[NODE_ID]).toEqual({ result: INPUT_VALUE });
});
