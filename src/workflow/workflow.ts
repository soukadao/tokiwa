import {
  ConflictError,
  CyclicDependencyError,
  DependencyError,
  InvalidArgumentError,
  NotFoundError,
} from "../core/index.js";
import { Node, type NodeDefinition } from "./node.js";

export type WorkflowType = "workflow" | "chatflow";

export interface WorkflowDefinition<Context = unknown, Input = unknown> {
  id: string;
  name?: string;
  description?: string;
  type?: WorkflowType;
  nodes?: Array<Node<Context, Input> | NodeDefinition<Context, Input>>;
}

const DEFAULT_WORKFLOW_TYPE: WorkflowType = "workflow";
const VALID_WORKFLOW_TYPES: readonly WorkflowType[] = ["workflow", "chatflow"];

export class Workflow<Context = unknown, Input = unknown> {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly type: WorkflowType;
  private readonly nodes = new Map<string, Node<Context, Input>>();

  constructor(definition: WorkflowDefinition<Context, Input>) {
    if (!definition.id || definition.id.trim().length === 0) {
      throw new InvalidArgumentError("Workflow id must be a non-empty string");
    }

    this.id = definition.id;
    this.name = definition.name;
    this.description = definition.description;
    if (definition.type && !VALID_WORKFLOW_TYPES.includes(definition.type)) {
      throw new InvalidArgumentError(
        `Workflow type must be one of: ${VALID_WORKFLOW_TYPES.join(", ")}`,
      );
    }
    this.type = definition.type ?? DEFAULT_WORKFLOW_TYPE;

    if (definition.nodes) {
      for (const node of definition.nodes) {
        this.addNode(node instanceof Node ? node : new Node(node));
      }
    }
  }

  addNode(node: Node<Context, Input>): void {
    if (this.nodes.has(node.id)) {
      throw new ConflictError(`Node already exists: ${node.id}`);
    }

    this.nodes.set(node.id, node);
  }

  connect(fromNodeId: string, toNodeId: string): void {
    const toNode = this.nodes.get(toNodeId);
    if (!toNode) {
      throw new NotFoundError(`Unknown node: ${toNodeId}`);
    }

    if (!this.nodes.has(fromNodeId)) {
      throw new NotFoundError(`Unknown node: ${fromNodeId}`);
    }

    toNode.addDependency(fromNodeId);
  }

  getNode(nodeId: string): Node<Context, Input> | undefined {
    return this.nodes.get(nodeId);
  }

  getNodes(): Node<Context, Input>[] {
    return Array.from(this.nodes.values());
  }

  getExecutionPlan(): Node<Context, Input>[] {
    const nodes = this.getNodes();
    const dependencies = new Map<string, Set<string>>();
    const dependents = new Map<string, Set<string>>();

    for (const node of nodes) {
      dependencies.set(node.id, new Set(node.dependsOn));
      if (!dependents.has(node.id)) {
        dependents.set(node.id, new Set());
      }
    }

    for (const node of nodes) {
      for (const dep of node.dependsOn) {
        if (!dependencies.has(dep)) {
          throw new DependencyError(
            `Node ${node.id} depends on missing node: ${dep}`,
          );
        }

        const bucket = dependents.get(dep);
        if (bucket) {
          bucket.add(node.id);
        }
      }
    }

    const ready: Node<Context, Input>[] = nodes.filter(
      (node) => (dependencies.get(node.id)?.size ?? 0) === 0,
    );
    const executionPlan: Node<Context, Input>[] = [];

    while (ready.length > 0) {
      const node = ready.shift();
      if (!node) {
        continue;
      }

      executionPlan.push(node);
      const downstream = dependents.get(node.id);
      if (!downstream) {
        continue;
      }

      for (const dependentId of downstream) {
        const deps = dependencies.get(dependentId);
        if (!deps) {
          continue;
        }

        deps.delete(node.id);
        if (deps.size === 0) {
          const dependentNode = this.nodes.get(dependentId);
          if (dependentNode) {
            ready.push(dependentNode);
          }
        }
      }
    }

    if (executionPlan.length !== nodes.length) {
      throw new CyclicDependencyError("Workflow contains a cyclic dependency");
    }

    return executionPlan;
  }
}
