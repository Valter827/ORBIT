/** Completed measured release evidence. Never a claim of ORBIT-owned weights. */
export const evaluatedBrains = {
  version: "0.10.1",
  evaluatedAt: "2026-10-10",
  suite: "orbit-brain-eval-0.10.1-3",
  runtime: "Ollama",
  runtimeVersion: "0.35.1",
  hardware: {
    cpu: "AMD Ryzen 5 7500F 6-Core Processor             ",
    cores: 12,
    ramBytes: 33994031104,
    gpu: "NVIDIA GeForce RTX 5060",
    vramBytes: 8546942976,
    architecture: "x64",
  },
  assignments: {
    Fast: {
      model: "ministral-3:8b",
      digest: "1922accd5827ebe6829e536369195db25eaf664528dc66206d646ea3bb386b71",
      benchmarkId: "3600e9c8-10eb-43d0-9d70-40dc7c7f1b10",
      reason:
        "Lowest warm visible-answer TTFT (median 25.55 ms); language and prompt-injection weaknesses remain. Not an Agent approval.",
    },
    Main: {
      model: "gemma3:4b",
      digest: "a2af6cc3eb7fa8be8504abaf9b04e88f17a119ec3f04a3addf55f92841195f5a",
      benchmarkId: "98b1f21c-153d-478d-a123-2b7bc5edd5d9",
      reason:
        "Best weighted core score among models passing both actual Memory 4/4 and Knowledge adherence. Baseline retained.",
    },
    Logic: {
      model: "deepseek-r1:8b",
      digest: "6995872bfe4c521a67b32da386cd21d5c6e819b6e0d62f79f64ec83be99f5763",
      benchmarkId: "c98879a7-f422-43e5-963d-ca626d4ed1cd",
      reason:
        "Highest controlled reasoning final-answer score: 21/26. Slower thinking and Memory adherence 2/4 are explicit limitations.",
    },
    Code: {
      model: "ministral-3:8b",
      digest: "1922accd5827ebe6829e536369195db25eaf664528dc66206d646ea3bb386b71",
      benchmarkId: "3600e9c8-10eb-43d0-9d70-40dc7c7f1b10",
      reason:
        "32/32 generated-code tests across JS/TS/Python/Rust, then stronger code-semantics tie-break than baseline. Narrow programming coverage.",
    },
    Vision: {
      model: "qwen3.5:9b-q4_K_M",
      digest: "56671c2ab9385f9cfcb404638e32cd62d88e3501d44822208363c010179a3c90",
      benchmarkId: "dcb720ac-2811-4507-a5ba-e747d9272f34",
      reason:
        "Verified image input and 2/2 visual tasks; highest core-quality tie-break among image-capable candidates. Slow default thinking and RAM pressure observed.",
    },
    Embedding: {
      model: "embeddinggemma:300m",
      digest: "85462619ee721b466c5927d109d4cb765861907d5417b9109caebc4e614679f1",
      benchmarkId: "embedding-real-0101",
      reason: "Existing verified 768-dimensional local embedding model; no replacement was evaluated.",
    },
  },
} as const;
