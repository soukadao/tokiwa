import { expect, test } from "vitest";
import { InMemoryRunStore, Node, Workflow } from "../workflow/index.js";
import { Orchestrator } from "./orchestrator.js";

const INPUT_VALUE = 42;

interface Payload {
  value: number;
}

test("runStore saves workflow run records", async () => {
  const runStore = new InMemoryRunStore();
  const orchestrator = new Orchestrator({ runStore });

  const node = new Node<unknown, Payload, { result: number }>({
    handler: ({ input }) => ({ result: input?.value ?? 0 }),
  });
  const workflow = new Workflow<unknown, Payload>({
    nodes: [node],
  });

  orchestrator.registerWorkflow(workflow);
  const result = await orchestrator.runWorkflow<unknown, Payload>(workflow.id, {
    input: { value: INPUT_VALUE },
  });

  const record = await runStore.get(result.runId);

  expect(record?.workflowId).toBe(workflow.id);
  expect(record?.status).toBe("succeeded");
  expect(record?.results[node.id]).toEqual({ result: INPUT_VALUE });
});
