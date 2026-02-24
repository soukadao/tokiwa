# 刻輪 (tokiwa)

Cron / Event / Workflow を統合する軽量オーケストレーター。イベントの発行・購読配信・ワークフロー実行をシンプルに統合します。

## できること
- Event を発行してキュー処理
- EventDispatcher による購読配信（filter / once / wildcard）
- ワークフロー（DAG）実行（依存解決・並列実行・fail-fast）
- ノードのリトライ（バックオフ / ジッタ）
- 分散ロックによる chatflow 排他 / Cron リーダー選出
- Event トリガー／手動トリガーでワークフローを起動
- Cron スケジュールからイベント発行／ワークフロー実行
- Chatflow（会話メモリ）実行
- 同一 conversationId の chatflow はプロセス内で直列化
- 実行履歴（RunStore）保存
- Snapshot で状態とメトリクスを取得（`snapshot()` は `async`）

## クイックスタート
```ts
import { Node, Orchestrator, Workflow } from "tokiwa";

const EVENT_TYPE = "order.created";
const ORDER_REF = "A-001";
const MAX_CONCURRENT_EVENTS = 2;

const validate = new Node({
  name: "validate",
  handler: async ({ input }) => ({ ok: true, input }),
});
const charge = new Node({
  name: "charge",
  dependsOn: [validate.id],
  handler: async ({ getResult }) => {
    const prev = getResult<{ ok: boolean }>(validate.id);
    return { charged: !!prev?.ok };
  },
});
const workflow = new Workflow({
  name: "order-flow",
  nodes: [validate, charge],
});

const orchestrator = new Orchestrator({
  maxConcurrentEvents: MAX_CONCURRENT_EVENTS,
});

orchestrator.dispatcher.subscribe(EVENT_TYPE, async (event) => {
  console.log("event received:", event.type, event.payload);
});

orchestrator.registerWorkflow(workflow, {
  type: "event",
  eventType: EVENT_TYPE,
});

orchestrator.start();
orchestrator.publish(EVENT_TYPE, { orderRef: ORDER_REF });
```

## 概念
- Event: `type` / `payload` / `metadata` を持つイベント。`metadata` には `correlationId` / `causationId` / `source` / `tags` を格納できます。
- Subscriber: `type` で購読し、`filter` / `once` を指定可能。`*` でワイルドカード購読。
- Trigger: `manual` / `event`。`eventType` は `string | string[] | RegExp | "*"`。`mapInput` / `mapContext` / `mapConversationId` でイベントから変換。
- Workflow: DAG 構造のノード集合。`type: "workflow" | "chatflow"` を指定可能（既定は `workflow`）。
- Workflow / Node / Event / Notification / Connection の `id` はシステム生成です。`id` は指定できないため、参照は `workflow.id` / `node.id` を使用してください。
- Runner: `failFast` の既定は `true`。`concurrency` は `workflow` で `4`、`chatflow` で `1` が既定。`failFast` 時は `NodeExecutionContext.signal` で中断通知します。
- Orchestrator: `maxConcurrentEvents`（イベント並列）と `workflowConcurrency`（トリガー後の並列）で制御。`ackPolicy` で ACK 方針（`always` / `onSuccess`）を指定。`await snapshot()` でメトリクス取得。

## ユーティリティ
- `execCommand` / `execAsync` / `execFileAsync` で外部コマンド実行を補助します。
- `runPerformance` / `measurePerformance` で簡易計測できます。

## 例
以降の例では `workflow` / `orchestrator` の定義を一部省略しています。

### 手動実行
```ts
const RETRY_COUNT = 0;

const result = await orchestrator.runWorkflow(workflow.id, {
  input: { orderRef: "A-001" },
  context: { retryCount: RETRY_COUNT },
});
```

### Cron 連携（DI）
```ts
import { Orchestrator, Scheduler } from "tokiwa";

const CHECK_INTERVAL_MS = 60_000;
const JOB_HEARTBEAT_NAME = "heartbeat";
const JOB_NIGHTLY_NAME = "nightly";
const CRON_EVERY_5_MINUTES = "*/5 * * * *";
const CRON_DAILY_MIDNIGHT = "0 0 * * *";
const EVENT_TYPE = "system.heartbeat";

const scheduler = new Scheduler({ checkIntervalMs: CHECK_INTERVAL_MS });
const orchestrator = new Orchestrator({ scheduler });

orchestrator.registerWorkflow(workflow);
orchestrator.registerCronEvent(
  CRON_EVERY_5_MINUTES,
  EVENT_TYPE,
  JOB_HEARTBEAT_NAME,
);
orchestrator.registerCronWorkflow(
  CRON_DAILY_MIDNIGHT,
  workflow.id,
  JOB_NIGHTLY_NAME,
);

orchestrator.start();
```

### Chatflow（会話メモリ）
```ts
import {
  DeltaConversationStore,
  Node,
  Orchestrator,
  Workflow,
} from "tokiwa";

type ChatPayload = { conversationId: string };

const CONVERSATION_DIR = "./conversations";
const CHAT_EVENT_TYPE = "chat.message";

const store = new DeltaConversationStore({ directory: CONVERSATION_DIR });
const orchestrator = new Orchestrator({ conversationStore: store });

const chatflow = new Workflow({
  name: "support-chat",
  type: "chatflow",
  nodes: [
    new Node({
      name: "memory",
      handler: ({ updateMemory }) => {
        updateMemory?.({ lastMessageAt: Date.now() });
      },
    }),
  ],
});

orchestrator.registerWorkflow(chatflow, {
  type: "event",
  eventType: CHAT_EVENT_TYPE,
  mapConversationId: (event) =>
    (event.payload as ChatPayload).conversationId,
});

orchestrator.start();
```
`chatflow` は `conversationId` が必要なため `registerCronWorkflow` には対応していません。
`DeltaConversationStore` はパッチ差分を追記し、一定数でコンパクションする方式です。

### 実行履歴の保存
```ts
import { FileRunStore, Orchestrator } from "tokiwa";

const RUNS_DIR = "./runs";

const runStore = new FileRunStore({ directory: RUNS_DIR });
const orchestrator = new Orchestrator({ runStore });
```

### Worker / Producer モード
```ts
import { Orchestrator, Queue } from "tokiwa";

const sharedQueue = new Queue();
const producer = new Orchestrator({ mode: "producer", queue: sharedQueue });
const worker = new Orchestrator({ mode: "worker", queue: sharedQueue });
```
別プロセスで運用する場合は `EventQueue` を実装して共有ストレージに接続してください。
`worker` モードでは Cron Scheduler は起動しません。`producer` モードでは `drain()` を呼び出せません。

### 複数イベント型
```ts
orchestrator.registerWorkflow(workflow, {
  type: "event",
  eventType: ["order.created", "order.updated"],
});
```

### ワイルドカード購読
```ts
orchestrator.dispatcher.subscribe("*", async (event) => {
  console.log("any event:", event.type);
});
```

### ノードのリトライ
```ts
import { Node, Workflow } from "tokiwa";

const MAX_ATTEMPTS = 3;
const INITIAL_DELAY_MS = 500;

const workflow = new Workflow({
  name: "retry-flow",
  nodes: [
    new Node({
      name: "unstable",
      retry: { maxAttempts: MAX_ATTEMPTS, initialDelayMs: INITIAL_DELAY_MS },
      handler: async () => {
        // retryable task
      },
    }),
  ],
});
```

## Cron 仕様
- 5 フィールド形式（分 時 日 月 曜日）。
- ローカル時刻で評価します。
- `dayOfMonth` と `dayOfWeek` は AND 条件です。
- `Scheduler` は分境界で実行します。`checkIntervalMs` 指定時は固定間隔チェックになります。
- ジョブIDは自動生成され、登録メソッドは生成IDを返します。
- ジョブ名（`name`）は必須です。

## API サマリ
- `Orchestrator`
  - `start()` / `stop(): Promise<void>` / `drain()`
  - `publish(type, payload, metadata?)` / `enqueue(event)`
  - `registerWorkflow(workflow, trigger?, options?)` / `unregisterWorkflow(workflowId)`
  - `registerCronJob(cronExpression, name, handler)`
  - `registerCronEvent(cronExpression, eventType, name, payload?, metadata?)`
  - `registerCronWorkflow(cronExpression, workflowId, name, options?)`
  - `removeCronJob(jobId)` / `isCronJobScheduled(jobId)`
  - `runWorkflow(workflowId, options?)`
  - `snapshot(): Promise<Snapshot>`
- `EventDispatcher`
  - `subscribe(type, handler, options?)`
  - `unsubscribe(subscriberId)` / `clear(type?)` / `getSubscribers(type?)`
- `Workflow`
  - `addNode(node)` / `connect(from, to)` / `getExecutionPlan()`
- `Runner`
  - `run(workflow, options?)`（`WorkflowRunResult` に `timeline` / `attempts` / `memory` が含まれます）
- `Scheduler`
  - `start()` / `stop()` / `addJob(cronExpression, name, handler)` / `removeJob()` / `getNextExecutionTime()`
- `LeaderScheduler`
  - `start()` / `stop()` / `addJob(cronExpression, name, handler)` / `removeJob()`
- `Cron`
  - `matches(date)` / `getNextExecution(after?)`
- `RunStore`
  - `save()` / `get()` / `list?()`（`FileRunStore` / `InMemoryRunStore`）
- `ConversationStore`
  - `get()` / `set()` / `delete?()`（`DeltaConversationStore` / `InMemoryConversationStore`）
- `Queue`
  - `enqueue()` / `dequeue()` / `size()` / `drain()` ほか

## Core
- `createConfig` / `Config` / `createLogger` / `Logger` / `generateId` は core に集約しています。
- `Config` / `Logger` はクラスとして提供されるため、用途に応じてインスタンスを生成して DI します。
- `OrchestratorOptions` には `onWorkflowError`（トリガー経由の実行失敗フック）、`ackPolicy`、`conversationLock` を指定できます。
- `chatflow` 実行には `conversationStore` と `conversationId` が必要です。
- `runStore` を指定すると実行履歴が保存されます（`onRunStoreError` で保存失敗フック）。
- `mode: "all" | "producer" | "worker"` と `queue` でワーカー分離構成にできます。
- エラーは `src/core/errors.ts` のカスタムクラスを使用します。

## ディレクトリ
- `src/core` 設定・ロガー・エラー・ID 生成・ファイルシステム・DB アダプタ
- `src/orchestrator` オーケストレーターとイベント基盤
- `src/workflow` ワークフロー実行系
- `src/cron` Cron パーサー / Scheduler / LeaderScheduler
- `src/utils` 汎用ユーティリティ

## セキュリティメモ
- `generateId` は `crypto.randomUUID()` を使用します。
- `utils/execCommand` は `execFile` ベースで `command` と `args` を分離して実行します。
- `execAsync` は `allowShell: true` が必要で、シェル経由のため入力の検証が必要です。

## 開発
- `pnpm build`（成果物は `dist` に出力され、npm 配布時は `dist` を参照します）
- `pnpm test`
- `pnpm coverage`
- テスト対象は `src` 配下で、`src/utils` と `src/**/index.ts` はカバレッジ集計から除外しています。
- `pnpm fix`
