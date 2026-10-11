import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { cosmoDataset } from "./dataset-v1.js";
import { hash, validateDataset, scoreAnswer } from "./dataset.js";
import {
  TrainingConfigSchema,
  baseCandidates,
  DATASET_VERSION,
  HELDOUT_VERSION,
  type TrainingStorage,
  type TrainingJob,
} from "./types.js";
import { checkedPath, validateStorage, prepareOwned, freeSpace, inside } from "./storage.js";
import { compareEvaluations, type EvalRun } from "./evaluation.js";
import { baselineCases } from "../ai/model-studio.js";
const activeStates = ["Preparing", "Training", "Evaluating"];
const workerPath = () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(here, "training-worker.py"), path.resolve(here, "../../../../../training/worker.py")];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw Error("Bundled training worker missing");
  return found;
};
const read = (p: string) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "")) as Record<string, unknown>;
function atomic(p: string, value: unknown) {
  const temp = p + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, p);
}
async function fileHash(p: string) {
  const h = createHash("sha256");
  for await (const b of fs.createReadStream(p)) h.update(b as Buffer);
  return h.digest("hex");
}
export class TrainingLab {
  private settings: TrainingStorage | undefined;
  private jobs: TrainingJob[] = [];
  private process: ChildProcess | undefined;
  private running: Promise<void> | undefined;
  private root: string;
  constructor(private readonly privateRoot: string) {
    this.root = path.join(privateRoot, "training-lab");
    fs.mkdirSync(this.root, { recursive: true });
    const state = path.join(this.root, "state.json");
    if (fs.existsSync(state)) {
      const saved = read(state);
      if (saved["schema"] !== 1) throw Error("Unsupported Training Lab state version");
      this.settings = saved["settings"] as TrainingStorage | undefined;
      this.jobs = (saved["jobs"] ?? []) as TrainingJob[];
      for (const j of this.jobs)
        if (activeStates.includes(j.state)) {
          j.state = "Failed";
          j.interrupted = true;
          j.error =
            "Interrupted training. Resume is unsupported; create a new experiment. Existing checkpoints are preserved.";
          j.ended = new Date().toISOString();
        }
      this.save();
    }
  }
  busy() {
    return !!this.running || !!this.process;
  }
  private save() {
    atomic(path.join(this.root, "state.json"), { schema: 1, settings: this.settings, jobs: this.jobs });
  }
  state() {
    const report = validateDataset(
      cosmoDataset,
      baselineCases.map((c) => c.prompt),
    );
    return {
      dataset: {
        version: DATASET_VERSION,
        heldout: HELDOUT_VERSION,
        ...report,
        examples: report.examples.filter((e) => e.split !== "test"),
      },
      candidates: baseCandidates,
      settings: this.settings ?? null,
      storage: this.settings
        ? Object.fromEntries(
            Object.entries(this.settings)
              .filter(([k]) => k !== "python")
              .map(([k, p]) => [k, { path: p, freeBytes: freeSpace(p) }]),
          )
        : {},
      jobs: this.jobs,
      backend: "Offline isolated Python CUDA / Transformers + PEFT",
      privateData: "OFF — no application data source connected",
      alpha: "NOT CREATED",
      pauseSupported: false,
      resumeSupported: false,
      preferenceTraining: "NOT IMPLEMENTED",
      cloudBackend: "NOT IMPLEMENTED",
      fit: {
        state: "May fail",
        estimated: true,
        vramGiB: [6, 10],
        ramGiB: [12, 24],
        diskGiB: 25,
        duration: "Pilot: minutes to hours; full run requires measured pilot",
        note: "8 GiB inference success does not prove training fit. Estimates are not measured results.",
      },
    };
  }
  configure(value: unknown) {
    if (this.running || this.process) throw Error("Stop training before changing storage.");
    const settings = validateStorage(value, this.privateRoot);
    for (const key of ["training", "datasets", "adapters"] as const) prepareOwned(settings[key]);
    this.settings = settings;
    this.save();
    return this.state();
  }
  private environment() {
    return {
      SystemRoot: process.env["SystemRoot"] ?? "",
      WINDIR: process.env["WINDIR"] ?? "",
      PATH: path.dirname(this.settings!.python),
      TEMP: this.settings!.training,
      TMP: this.settings!.training,
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
      HF_HUB_DISABLE_TELEMETRY: "1",
      WANDB_DISABLED: "true",
      TOKENIZERS_PARALLELISM: "false",
      PYTHONUTF8: "1",
    };
  }
  private async execute(args: string[], onEvent: (e: Record<string, unknown>) => void) {
    if (!this.settings) throw Error("Configure isolated Python and storage first.");
    const child = spawn(this.settings.python, ["-I", workerPath(), ...args], {
      shell: false,
      windowsHide: true,
      env: this.environment(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process = child;
    let pending = "",
      stderr = "";
    child.stdout?.on("data", (b: Buffer) => {
      pending += b.toString();
      if (pending.length > 1000000) {
        child.kill();
        return;
      }
      let index;
      while ((index = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, index);
        pending = pending.slice(index + 1);
        try {
          onEvent(JSON.parse(line) as Record<string, unknown>);
        } catch {
          /* Non-JSON library output is not a worker event. */
        }
      }
    });
    child.stderr?.on("data", (b: Buffer) => {
      stderr = (stderr + b.toString()).slice(-6000);
    });
    try {
      return await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code) => resolve({ code, stderr }));
      });
    } finally {
      if (this.process === child) this.process = undefined;
    }
  }
  async probe() {
    if (this.running || this.process) throw Error("Worker is busy.");
    let result: Record<string, unknown> = { ready: false };
    const task = this.execute(["--probe"], (e) => {
      if (e["kind"] === "preflight") result = e;
    });
    const timer = setTimeout(() => this.process?.kill(), 60000);
    try {
      const r = await task;
      if (r.code !== 0) throw Error(r.stderr || "Training environment probe failed");
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
  draft(value: unknown) {
    if (!this.settings) throw Error("Configure storage first.");
    if (this.running || this.process) throw Error("Worker is busy.");
    const config = TrainingConfigSchema.parse(value);
    if (config.pilot && config.maxSteps > 16) throw Error("Pilot is bounded to 16 steps.");
    if (
      !config.pilot &&
      !this.jobs.some(
        (j) =>
          j.state === "Completed" &&
          j.config.pilot &&
          j.adapter &&
          j.config.base === config.base &&
          j.config.revision === config.revision,
      )
    )
      throw Error("A completed real pilot with saved/loadable adapter is required before full training.");
    const examples = cosmoDataset.filter((e) => e.split === "test" || !config.excludedIds.includes(e.id));
    if (config.excludedIds.some((id) => !cosmoDataset.some((e) => e.id === id && e.split !== "test")))
      throw Error("Only train/validation examples may be removed.");
    const report = validateDataset(
      examples,
      baselineCases.map((c) => c.prompt),
    );
    if (!report.valid) throw Error("Dataset validation/leak gate failed: " + JSON.stringify(report.issues));
    const id = randomUUID();
    const job: TrainingJob = {
      id,
      state: "Draft",
      created: new Date().toISOString(),
      config,
      configHash: hash(config),
      datasetHash: report.hash,
      directory: path.join(this.settings.training, id),
      adapterDirectory: path.join(this.settings.adapters, id),
      events: [],
    };
    this.jobs.unshift(job);
    this.save();
    return job;
  }
  private job(id: string) {
    z.string().uuid().parse(id);
    const job = this.jobs.find((j) => j.id === id);
    if (!job) throw Error("Training job not found");
    if (
      !this.settings ||
      job.directory !== path.join(this.settings.training, id) ||
      job.adapterDirectory !== path.join(this.settings.adapters, id)
    )
      throw Error("Stored job path differs from configured storage");
    checkedPath(job.directory);
    checkedPath(job.adapterDirectory);
    return job;
  }
  start(id: string) {
    const job = this.job(id);
    if (this.running || this.process || job.state !== "Draft") throw Error("Only a draft job can start when idle.");
    job.state = "Preparing";
    this.save();
    this.running = this.train(job)
      .catch((e) => {
        if (job.state !== "Cancelled") {
          job.state = "Failed";
          job.error = String(e);
        }
        job.ended = new Date().toISOString();
        this.save();
      })
      .finally(() => {
        this.running = undefined;
      });
    return { id, state: job.state };
  }
  private async train(job: TrainingJob) {
    const s = this.settings!;
    if (job.directory !== path.join(s.training, job.id) || job.adapterDirectory !== path.join(s.adapters, job.id))
      throw Error("Storage changed after draft; create a new experiment.");
    validateStorage(s, this.privateRoot);
    for (const root of [s.training, s.datasets, s.adapters]) prepareOwned(root);
    if ((freeSpace(s.training) ?? 0) < 2 * 2 ** 30 || (freeSpace(s.adapters) ?? 0) < 2 * 2 ** 30)
      throw Error("At least 2 GiB free per training/adapter volume required.");
    const base = checkedPath(s.models);
    const provenance = read(path.join(base, ".orbit-base.json"));
    if (
      provenance["model"] !== job.config.base ||
      provenance["revision"] !== job.config.revision ||
      provenance["licenseAccepted"] !== true
    )
      throw Error("Pinned base provenance/license record missing.");
    const files = z
      .array(z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict())
      .min(3)
      .parse(provenance["files"]);
    for (const f of files) {
      const p = checkedPath(path.resolve(base, f.path));
      if (!inside(base, p)) throw Error("Base manifest traversal rejected");
      if ((await fileHash(p)) !== f.sha256) throw Error("Base file hash mismatch");
      if (job.state === "Cancelled") return;
    }
    if (!files.some((f) => f.path.endsWith(".safetensors")) || !files.some((f) => f.path === "config.json"))
      throw Error("Training requires original safetensors and tokenizer/config, not an Ollama GGUF.");
    job.baseHash = hash(files);
    fs.mkdirSync(job.directory, { recursive: false });
    fs.mkdirSync(job.adapterDirectory, { recursive: false });
    const examples = cosmoDataset.filter((e) => !job.config.excludedIds.includes(e.id));
    for (const split of ["train", "validation"] as const)
      atomic(
        path.join(job.directory, split + ".json"),
        examples.filter((e) => e.split === split).map((e) => ({ messages: e.messages, answer: e.answer })),
      );
    const snapshot = {
      version: DATASET_VERSION,
      hash: job.datasetHash,
      ids: examples.map((e) => e.id),
      testAnswersPassedToWorker: false,
    };
    atomic(path.join(s.datasets, job.datasetHash + ".json"), snapshot);
    const cfg = {
      config: job.config,
      baseDirectory: base,
      adapterDirectory: job.adapterDirectory,
      baseHash: job.baseHash,
      datasetHash: job.datasetHash,
    };
    atomic(path.join(job.directory, "config.json"), cfg);
    atomic(path.join(job.directory, "dataset-manifest.json"), snapshot);
    job.state = "Ready";
    this.save();
    job.state = "Training";
    this.save();
    const result = await this.execute(["--config", path.join(job.directory, "config.json")], (e) => {
      job.events.push(e);
      if (job.events.length > 300) job.events.shift();
      this.save();
    });
    if ((job.state as string) === "Cancelled") return;
    if (result.code !== 0)
      throw Error("Training worker failed: " + (JSON.stringify(job.events.at(-1)?.["error"] ?? "") || result.stderr));
    const receipt = read(path.join(job.directory, "result.json"));
    const adapter = path.join(job.adapterDirectory, "adapter_model.safetensors");
    if (
      receipt["complete"] !== true ||
      receipt["adapterLoaded"] !== true ||
      typeof receipt["inference"] !== "string" ||
      !receipt["inference"].trim()
    )
      throw Error("No real adapter load/inference receipt");
    const digest = await fileHash(adapter);
    if (digest !== receipt["adapterHash"]) throw Error("Saved adapter hash mismatch");
    job.adapter = { hash: digest, bytes: fs.statSync(adapter).size };
    job.state = "Completed";
    job.ended = new Date().toISOString();
    this.save();
  }
  cancel(id: string) {
    const job = this.job(id);
    if (!activeStates.includes(job.state)) throw Error("Job is not active");
    if (fs.existsSync(job.directory)) fs.writeFileSync(path.join(job.directory, "cancel.request"), "cancel");
    job.state = "Cancelled";
    job.ended = new Date().toISOString();
    this.save();
    const child = this.process;
    setTimeout(() => {
      if (child && this.process === child) child.kill();
    }, 1500).unref();
    return { cancelled: true };
  }
  evaluate(id: string) {
    const job = this.job(id);
    if (this.running || this.process || job.state !== "Completed" || !job.adapter)
      throw Error("A completed adapter and idle worker are required");
    job.state = "Evaluating";
    this.save();
    this.running = this.evaluatePair(job)
      .catch((e) => {
        job.state = "Failed";
        job.error = "Evaluation failed: " + String(e);
        this.save();
      })
      .finally(() => {
        this.running = undefined;
      });
    return { started: true };
  }
  private async evaluatePair(job: TrainingJob) {
    if (
      !job.adapter ||
      (await fileHash(checkedPath(path.join(job.adapterDirectory, "adapter_model.safetensors")))) !== job.adapter.hash
    )
      throw Error("Adapter identity changed before evaluation.");
    const heldout = cosmoDataset.filter((e) => e.split === "test");
    const prompts = heldout.flatMap((e) => [0, 1].map((repeat) => ({ id: e.id, repeat, messages: e.messages })));
    atomic(path.join(job.directory, "eval-prompts.json"), prompts);
    const runs: EvalRun[] = [];
    for (const useAdapter of [false, true]) {
      const cfg = { ...read(path.join(job.directory, "config.json")), useAdapter };
      atomic(path.join(job.directory, "eval-config.json"), cfg);
      const result = await this.execute(
        ["--config", path.join(job.directory, "eval-config.json"), "--mode", "eval"],
        (e) => {
          job.events.push(e);
          this.save();
        },
      );
      if ((job.state as string) === "Cancelled") return;
      if (result.code !== 0) throw Error(result.stderr || "Evaluation worker failed");
      const output = read(path.join(job.directory, "evaluation-output.json"));
      const rows = z
        .array(
          z
            .object({
              id: z.string(),
              repeat: z.number(),
              response: z.string(),
              elapsedMs: z.number().nonnegative(),
              visibleTokens: z.number().nonnegative(),
            })
            .strict(),
        )
        .parse(output["results"]);
      const run: EvalRun = {
        suite: HELDOUT_VERSION,
        datasetHash: job.datasetHash,
        baseHash: job.baseHash!,
        configHash: hash({ temperature: 0, maxTokens: 512, seed: job.config.seed }),
        complete: output["complete"] === true && rows.length === prompts.length,
        observations: rows.map((r) => {
          const e = heldout.find((e) => e.id === r.id);
          if (!e) throw Error("Unexpected held-out ID");
          return { ...r, category: e.category, passed: scoreAnswer(e, r.response) };
        }),
      };
      runs.push(run);
      atomic(path.join(job.directory, useAdapter ? "adapter-eval.json" : "base-eval.json"), run);
    }
    const comparison = compareEvaluations(runs[0]!, runs[1]!);
    job.evaluation = {
      ...comparison,
      deployment: "NOT VERIFIED",
      vision: "NOT TESTED",
      toolProtocol: "NOT TESTED",
      realMemoryKnowledgeRegression: "NOT TESTED",
      promoted: false,
    };
    job.state = "Rejected";
    job.error = comparison.eligible
      ? "Quality screen passed, but native deployment, vision/tools and real Memory/Knowledge promotion gates remain unverified."
      : comparison.reasons.join(" ");
    atomic(path.join(job.directory, "comparison.json"), job.evaluation);
    this.save();
  }
  async export(id: string) {
    const job = this.job(id);
    if (!job.adapter || this.running) throw Error("Export requires an idle saved adapter");
    if (
      (await fileHash(checkedPath(path.join(job.adapterDirectory, "adapter_model.safetensors")))) !== job.adapter.hash
    )
      throw Error("Adapter changed after verification.");
    const folder = path.join(job.directory, "adapter-export");
    if (fs.existsSync(folder)) throw Error("Export already exists; immutable exports are not overwritten");
    fs.mkdirSync(folder);
    for (const name of ["adapter_model.safetensors", "adapter_config.json"]) {
      const src = checkedPath(path.join(job.adapterDirectory, name));
      fs.copyFileSync(src, path.join(folder, name), fs.constants.COPYFILE_EXCL);
    }
    atomic(path.join(folder, "manifest.json"), {
      format: "cosmo-adapter-v1",
      base: job.config.base,
      baseRevision: job.config.revision,
      baseHash: job.baseHash,
      adapter: job.adapter,
      datasetVersion: DATASET_VERSION,
      datasetHash: job.datasetHash,
      evalVersion: HELDOUT_VERSION,
      evaluation: job.evaluation ?? null,
      config: job.config,
      license: "Gemma Terms; preserve notices",
      promoted: false,
    });
    return { path: folder };
  }
  deleteAdapter(id: string, confirmed: boolean) {
    if (!confirmed) throw Error("Adapter deletion requires explicit confirmation.");
    const job = this.job(id);
    if (this.busy() || !job.adapter) throw Error("Only an idle registered adapter can be deleted.");
    const target = checkedPath(job.adapterDirectory);
    if (target !== path.join(this.settings!.adapters, job.id) || inside(this.settings!.models, target))
      throw Error("Unsafe adapter deletion target.");
    for (const name of fs.readdirSync(target)) checkedPath(path.join(target, name));
    // Only the two registered adapter files are removed; checkpoints/exports/base and run history remain.
    for (const name of ["adapter_model.safetensors", "adapter_config.json"]) {
      const file = path.join(target, name);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    delete job.adapter;
    job.state = "Rejected";
    job.error = "Adapter files deleted with confirmation; experiment history retained.";
    this.save();
    return { deleted: true };
  }
  async shutdown() {
    const job = this.jobs.find((j) => activeStates.includes(j.state));
    if (job) this.cancel(job.id);
    await this.running;
  }
}
