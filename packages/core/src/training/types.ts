import { z } from "zod";
export const DATASET_VERSION = "cosmo-dataset-v1.0";
export const HELDOUT_VERSION = "cosmo-brain-heldout-1";
export const ExampleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,80}$/),
    group: z.string().min(3).max(80),
    category: z.enum([
      "reasoning",
      "code",
      "memory",
      "knowledge",
      "context",
      "russian",
      "ukrainian",
      "english",
      "json",
      "hallucination",
      "sources",
      "tools",
      "security",
      "style",
    ]),
    language: z.enum(["en", "ru", "uk"]),
    split: z.enum(["train", "validation", "test"]),
    messages: z
      .array(z.object({ role: z.enum(["system", "user"]), content: z.string().min(1).max(12000) }).strict())
      .min(1)
      .max(8),
    answer: z.string().min(1).max(8000),
    expected: z
      .object({
        kind: z.enum(["exact", "contains", "json"]),
        required: z.array(z.string().min(1)).max(20),
        forbidden: z.array(z.string().min(1)).max(20),
      })
      .strict(),
    provenance: z
      .object({
        kind: z.literal("synthetic"),
        source: z.literal("ORBIT-authored controlled scenario"),
        license: z.literal("ORBIT project dataset; no third-party text"),
        review: z.literal("reviewed"),
        privateData: z.literal(false),
      })
      .strict(),
  })
  .strict();
export type DatasetExample = z.infer<typeof ExampleSchema>;
export const TrainingConfigSchema = z
  .object({
    base: z.literal("google/gemma-3-4b-it"),
    revision: z.literal("093f9f388b31de276ce2de164bdc2081324b9767"),
    method: z.enum(["QLoRA", "LoRA"]).default("QLoRA"),
    pilot: z.boolean().default(true),
    epochs: z.number().int().min(1).max(5).default(1),
    learningRate: z.number().min(0.000001).max(0.001).default(0.0001),
    rank: z.union([z.literal(4), z.literal(8), z.literal(16)]).default(8),
    alpha: z.number().int().min(4).max(64).default(16),
    dropout: z.number().min(0).max(0.2).default(0.05),
    batch: z.literal(1).default(1),
    gradientAccumulation: z.number().int().min(1).max(32).default(8),
    sequenceLength: z.union([z.literal(256), z.literal(512), z.literal(1024)]).default(512),
    seed: z.number().int().min(0).max(2147483647).default(42),
    maxSteps: z.number().int().min(1).max(1000).default(8),
    precision: z.literal("bfloat16").default("bfloat16"),
    optimizer: z.literal("adamw_torch").default("adamw_torch"),
    scheduler: z.literal("linear").default("linear"),
    targetModules: z.enum(["attention", "all-linear"]).default("attention"),
    excludedIds: z.array(z.string().max(80)).max(500).default([]),
  })
  .strict();
export type TrainingConfig = z.infer<typeof TrainingConfigSchema>;
export const StorageSchema = z
  .object({
    models: z.string().min(3).max(2000),
    training: z.string().min(3).max(2000),
    datasets: z.string().min(3).max(2000),
    adapters: z.string().min(3).max(2000),
    python: z.string().min(3).max(2000),
  })
  .strict();
export type TrainingStorage = z.infer<typeof StorageSchema>;
export type JobState =
  | "Draft"
  | "Preparing"
  | "Ready"
  | "Training"
  | "Cancelled"
  | "Failed"
  | "Completed"
  | "Evaluating"
  | "Rejected"
  | "Promoted";
export interface TrainingJob {
  id: string;
  state: JobState;
  created: string;
  ended?: string;
  config: TrainingConfig;
  configHash: string;
  datasetHash: string;
  baseHash?: string;
  directory: string;
  adapterDirectory: string;
  error?: string;
  interrupted?: boolean;
  events: Array<Record<string, unknown>>;
  adapter?: { hash: string; bytes: number };
  evaluation?: unknown;
}
export const baseCandidates = [
  {
    model: "google/gemma-3-4b-it",
    family: "Gemma",
    selection: "SELECTED FOR PILOT; fit unverified",
    license: "Gemma Terms",
    source: "https://huggingface.co/google/gemma-3-4b-it",
    fineTuning: "YES, subject to terms",
    commercial: "YES, subject to terms",
    redistribution: "YES, subject to notices/restrictions",
    derivatives: "YES, subject to terms",
    quality: "Core 67.42%; Memory 4/4; Knowledge PASS; generated code 32/32",
    languages: "RU 6/10, UK 6/10, EN 4/10",
    architecture: "gemma3; Transformers/PEFT text-only adapter; vision must be rechecked",
    training: "4B QLoRA pilot may fit 8 GiB; measured fit required",
    deployment: "Transformers adapter loading implemented; Ollama adapter compatibility NOT VERIFIED",
    reason:
      "Reliable measured Memory/Knowledge, smallest tested candidate. Instruct preserves instruction-following prior; trainable original weights differ from Ollama quantization.",
  },
  {
    model: "Qwen3.5 9B",
    family: "Qwen",
    selection: "NOT SELECTED",
    license: "Apache-2.0",
    source: "https://huggingface.co/Qwen/Qwen3.5-9B",
    fineTuning: "YES",
    commercial: "YES",
    redistribution: "YES with notices",
    derivatives: "YES",
    quality: "Core 79.24%; Memory 4/4; Knowledge FAIL",
    languages: "RU 10/10, UK 6/10, EN 6/10",
    architecture: "Hybrid multimodal architecture needs architecture-specific support",
    training: "9B plus activations not recommended on 8 GiB without measured fit",
    deployment: "Exact adapter import unverified",
    reason: "Strong semantics/vision, but empty final answers and observed host memory pressure.",
  },
  {
    model: "Ministral 3 8B",
    family: "Mistral",
    selection: "NOT SELECTED",
    license: "Apache-2.0",
    source: "https://huggingface.co/mistralai/Ministral-3-8B-Instruct-2512",
    fineTuning: "YES",
    commercial: "YES",
    redistribution: "YES with notices",
    derivatives: "YES",
    quality: "Core 64.22%; Memory 4/4; Knowledge PASS; injection 0/2",
    languages: "RU 4/10, UK 4/10, EN 4/10; invented dates in natural UK",
    architecture: "Multimodal Ministral requires matching Transformers/PEFT support",
    training: "8B training not established on this GPU",
    deployment: "Exact adapter import unverified",
    reason: "Good code/latency, weaker grounding/security/language evidence for general adapter.",
  },
  {
    model: "DeepSeek R1 8B (Qwen3 distilled)",
    family: "DeepSeek/Qwen",
    selection: "NOT SELECTED",
    license: "MIT; preserve underlying model notices",
    source: "https://huggingface.co/deepseek-ai/DeepSeek-R1-0528-Qwen3-8B",
    fineTuning: "YES",
    commercial: "YES",
    redistribution: "YES with notices",
    derivatives: "YES",
    quality: "Core 83.99%; reasoning 21/26; Memory final 2/4",
    languages: "RU 6/10, UK 6/10, EN 4/10",
    architecture: "Qwen3 causal decoder PEFT support; thinking requires bounded final-answer evaluation",
    training: "8B training not established on 8 GiB",
    deployment: "Exact adapter import unverified",
    reason: "Best reasoning alone does not outweigh Memory regressions and budget-starved final answers.",
  },
] as const;
