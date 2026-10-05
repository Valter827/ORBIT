import { sanitizeSense } from "../sense/session.js";
import { AIHub, ProviderConfiguration, validateProviders } from "./ai-hub.js";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promises as fs } from "node:fs";
import { z } from "zod";
import { createOrbitService } from "../service.js";
import { AnthropicProvider } from "../ai/providers/anthropic.js";
import type { AIProvider } from "../ai/router.js";
import { redactDeep } from "../security/redactor.js";
import { DesktopStore } from "./store.js";
const Configuration = z
  .object({
    workspace: z.string().max(2000).nullable(),
    stateDirectory: z.string().min(1).max(2000),
    key: z.string().max(1000).default(""),
    model: z.string().min(1).max(200).default("claude-sonnet-4-6"),
    providers: z.array(ProviderConfiguration).max(20).default([]),
    providerKeys: z.record(z.string().max(1000)).default({}),
    verificationCommand: z.string().min(1).max(2000).default("npm test"),
    filesEnabled: z.boolean().default(true),
    terminalEnabled: z.boolean().default(true),
  })
  .strict();
export function createDesktopHost(notify: (topic: string, payload: unknown) => void, testProvider?: AIProvider) {
  let config: z.infer<typeof Configuration> | undefined,
    service: Awaited<ReturnType<typeof createOrbitService>> | undefined;
  let store: DesktopStore | undefined,
    changing = false,
    shuttingDown = false;
  let provider: AIProvider;
  let hub: AIHub | undefined, preparing: AbortController | undefined;
  let preparingDone: Promise<unknown> | undefined;
  let cancelledSenseEpoch = -1,
    activeSenseEpoch: number | undefined;
  async function request(method: string, value: unknown = {}): Promise<unknown> {
    if (shuttingDown && method !== "status") throw new Error("ORBIT is shutting down");
    if (method === "configure") {
      if (changing || preparing || hub?.busy()) throw new Error("Stop the active task before changing settings");
      changing = true;
      try {
        if ((await service?.status())?.busy) throw new Error("Stop the active task before changing settings");
        const next = Configuration.parse(value);
        validateProviders(next.providers);
        if (config && next.stateDirectory !== config.stateDirectory) throw new Error("Data directory cannot change");
        const nextProvider = testProvider ?? new AnthropicProvider({ get: () => Promise.resolve(next.key || null) });
        const nextService = next.workspace
          ? await createOrbitService({
              workspace: next.workspace,
              stateDirectory: next.stateDirectory,
              auditDirectory: path.join(next.stateDirectory, "logs"),
              provider: nextProvider,
              verificationCommand: next.verificationCommand,
              model: testProvider?.models()[0]?.model ?? next.model,
              filesEnabled: next.filesEnabled,
              terminalEnabled: next.terminalEnabled,
              onEvent: (event) => {
                store?.record(event, next.workspace!);
                notify("event", event);
              },
              onPending: () => notify("pending", {}),
            })
          : undefined;
        await service?.shutdown();
        store ??= new DesktopStore(path.join(next.stateDirectory, "database"));
        hub ??= new AIHub(next.stateDirectory, notify);
        hub.configure(
          next.providers.length
            ? next.providers
            : [
                {
                  id: "anthropic",
                  name: "Anthropic",
                  type: "anthropic",
                  endpoint: "",
                  remoteAcknowledged: false,
                  localInferenceConfirmed: false,
                },
              ],
          { ...next.providerKeys, anthropic: next.key },
        );
        config = next;
        provider = nextProvider;
        service = nextService;
        return { ok: true };
      } finally {
        changing = false;
      }
    }
    if (!config || !store) throw new Error("Core has not initialized");
    if (method === "status") {
      const status = service
        ? await service.status()
        : {
            configured: await provider.isConfigured(),
            workspace: null,
            busy: false,
            current: null,
            pending: [],
            events: [],
          };
      const ai = await hub!.state(),
        profile = hub!.profile();
      return {
        ...status,
        busy: status.busy || hub!.busy() || !!preparing,
        ...(!testProvider
          ? {
              configured: !!profile.modelId && !!ai.providers.find((p) => p.id === profile.providerId)?.configured,
              aiName: profile.name,
              localOnly: ai.localOnly,
            }
          : {}),
      };
    }
    if (["ai.knowledgeResume", "ai.knowledgeReindex"].includes(method) && !config.filesEnabled)
      throw new Error("File access is disabled.");
    if (method === "knowledge.ingest") {
      if (changing || preparing || hub!.busy() || (await service?.status())?.busy)
        throw new Error("Stop active AI work first.");
      if (!config.filesEnabled) throw new Error("File access is disabled.");
      const i = z
        .object({
          profileId: z.string().uuid(),
          paths: z.array(z.string().max(2000)).min(1).max(100),
          spaces: z.array(z.string().uuid()).max(30).default([]),
        })
        .strict()
        .parse(value);
      hub!.store.profile(i.profileId);
      return hub!.knowledge.ingest(
        i.profileId,
        i.paths,
        JSON.parse(hub!.store.preference("knowledgeLimits", "{}")),
        i.spaces,
      );
    }
    if (method === "sense.sanitize") return sanitizeSense(value);
    if (method === "sense.cancel") {
      const { epoch } = z.object({ epoch: z.number().int().nonnegative() }).strict().parse(value);
      cancelledSenseEpoch = Math.max(cancelledSenseEpoch, epoch);
      if (activeSenseEpoch !== undefined && activeSenseEpoch <= cancelledSenseEpoch)
        await hub!.operation("chat.stop", {}, config.workspace ?? "");
      return { ok: true };
    }
    if (method === "sense.analyze") {
      const { epoch, input } = z
        .object({ epoch: z.number().int().nonnegative(), input: z.unknown() })
        .strict()
        .parse(value);
      if (changing || preparing || (await service?.status())?.busy) throw new Error("Stop active work first.");
      if (epoch <= cancelledSenseEpoch) throw new Error("Sense stopped.");
      activeSenseEpoch = epoch;
      try {
        return await hub!.sense(input, config.workspace ?? "");
      } finally {
        if (activeSenseEpoch === epoch) activeSenseEpoch = undefined;
      }
    }
    if (method === "providers.validate") {
      return validateProviders(value);
    }
    if (method.startsWith("ai.") || method.startsWith("chat.")) {
      if (changing || preparing) throw new Error("Wait for the active operation.");
      const agentBusy = (await service?.status())?.busy;
      if (changing || preparing) throw new Error("Wait for the active operation.");
      if (
        agentBusy &&
        ![
          "ai.state",
          "chat.status",
          "chat.stop",
          "chat.history",
          "chat.messages",
          "ai.memory",
          "ai.localDownloadCancel",
          "ai.localDownloadStatus",
        ].includes(method)
      )
        throw new Error("Stop the active agent before changing AI configuration.");
      if (method === "chat.start") {
        if (agentBusy) throw new Error("Stop the active agent first.");
        return hub!.chat(
          value,
          config.workspace ?? "",
          service ? async (file) => (await service!.read({ file })).content : undefined,
        );
      }
      return hub!.operation(method, value, config.workspace ?? "");
    }
    if (method === "start" && !testProvider) {
      if (changing || preparing || hub!.busy()) throw new Error("An AI operation is already active.");
      const input = z
        .object({ request: z.string().min(1).max(10000), profileId: z.string().uuid().optional() })
        .strict()
        .parse(value);
      if (!config.workspace) throw new Error("Select a project first.");
      const current = config,
        controller = new AbortController();
      preparing = controller;
      preparingDone = (async () => {
        if ((await service?.status())?.busy) throw new Error("An AI operation is already active.");
        const resolved = await hub!.resolve(input.profileId, true, controller.signal);
        if (controller.signal.aborted) throw new Error("Task cancelled.");
        const nextService = await createOrbitService({
          workspace: current.workspace!,
          stateDirectory: current.stateDirectory,
          auditDirectory: path.join(current.stateDirectory, "logs"),
          provider: resolved.provider,
          model: resolved.model.model,
          profile: resolved.profile,
          profileContext: hub!.context(
            resolved.profile,
            current.workspace!,
            (await hub!.knowledge.retrieve(resolved.profile.id, input.request, controller.signal)).sources,
            hub!.store.personal.retrieve(
              resolved.profile,
              current.workspace!,
              input.request,
              resolved.profile.intelligence.mode,
            ),
          ),
          verificationCommand: current.verificationCommand,
          filesEnabled: current.filesEnabled,
          terminalEnabled: current.terminalEnabled,
          onEvent: (event) => {
            store!.record(event, current.workspace!);
            notify("event", event);
          },
          onPending: () => notify("pending", {}),
        });
        await service?.shutdown();
        service = nextService;
        if (controller.signal.aborted) throw new Error("Task cancelled.");
        return service.start({ request: input.request });
      })();
      try {
        return await preparingDone;
      } finally {
        preparing = undefined;
      }
    }
    if (method === "stop") preparing?.abort();
    if (method === "history") return store.history();
    if (method === "historyEvents") return store.events(z.object({ taskId: z.string().uuid() }).parse(value).taskId);
    if (method === "testConnection") {
      if ((await hub!.state()).localOnly) throw new Error("LOCAL ONLY blocks remote connection tests.");
      await provider.complete(config.model, {
        system: "Reply OK.",
        messages: [{ role: "user", content: "Connection test. Reply OK." }],
        maxTokens: 8,
        signal: AbortSignal.timeout(15000),
      });
      return { connected: true };
    }
    if (method === "shutdown") {
      shuttingDown = true;
      preparing?.abort();
      await preparingDone?.catch(() => {});
      while (changing) await new Promise((r) => setTimeout(r, 10));
      await hub?.shutdown();
      await service?.shutdown();
      store.close();
      return { ok: true };
    }
    if (changing) throw new Error("Settings are being updated");
    if (!service) throw new Error("Select a project first");
    switch (method) {
      case "start":
        return service.start(value);
      case "answer":
        return service.answer(value);
      case "pause":
        return service.pause();
      case "resume":
        return service.resume();
      case "stop":
        return service.stop();
      case "undo": {
        const input = z.object({ taskId: z.string().uuid() }).parse(value);
        const result = await service.undo(input);
        store.markUndone(input.taskId, config.workspace!);
        return result;
      }
      case "files":
        return service.files(value);
      case "read":
        return service.read(value);
      default:
        throw new Error("Unknown desktop operation");
    }
  }
  return { request };
}
async function main() {
  const send = (v: unknown) => process.stdout.write(JSON.stringify(v) + "\n");
  const host = createDesktopHost((topic, payload) => send({ topic, payload }));
  // The only transport is inherited stdin/stdout; no HTTP server or listening port.
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on("line", (line) => {
    if (Buffer.byteLength(line) > 1100000) {
      send({ id: null, error: "Message too large" });
      return;
    }
    void (async () => {
      let id: unknown = null;
      try {
        const input = z
          .object({ id: z.number().int(), method: z.string().max(40), params: z.unknown().optional() })
          .strict()
          .parse(JSON.parse(line));
        id = input.id;
        const result = await host.request(input.method, input.params ?? {});
        send({ id, result });
      } catch (e) {
        const message =
          e instanceof z.ZodError
            ? "Invalid desktop request"
            : e instanceof Error
              ? e.message
              : "Desktop operation failed";
        send({ id, error: redactDeep(message).value });
      }
    })();
  });
  lines.on("close", () => {
    void host.request("shutdown").finally(() => process.exit());
  });
  // Stderr contains only a fixed diagnostic; provider requests / secrets are never logged.
  process.on("uncaughtException", () => {
    process.stderr.write("ORBIT core stopped unexpectedly.\n");
    process.exit(1);
  });
  await fs.mkdir(process.cwd(), { recursive: true });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
