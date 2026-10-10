import { Worker } from "node:worker_threads";
import { checkSignal } from "../ai/transport.js";
import type { Passage } from "./knowledge-structure.js";

export async function parseDocumentIsolated(
  file: string,
  limit: number,
  signal?: AbortSignal,
): Promise<{ text: string; passages: Passage[]; warning: string }> {
  checkSignal(signal);
  const workerFile = import.meta.url.endsWith(".mjs")
    ? "./knowledge-document-worker.mjs"
    : "./knowledge-document-worker.js";
  const worker = new Worker(new URL(workerFile, import.meta.url), {
    workerData: { file, limit },
    resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },
  });
  let timeout: ReturnType<typeof setTimeout> | undefined,
    abort: () => void = () => {};
  try {
    return await new Promise((resolve, reject) => {
      abort = () => reject(new Error("Document parsing cancelled."));
      signal?.addEventListener("abort", abort, { once: true });
      timeout = setTimeout(() => reject(new Error("Document parsing time limit exceeded.")), 20000);
      worker.once(
        "message",
        (message: { error?: string; result: { text: string; passages: Passage[]; warning: string } }) =>
          message.error ? reject(new Error(String(message.error))) : resolve(message.result),
      );
      worker.once("error", () => reject(new Error("Document parser exceeded limits or could not start.")));
      worker.once("exit", (code) => {
        if (code !== 0) reject(new Error("Document parser stopped."));
      });
    });
  } finally {
    if (timeout) clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
    await worker.terminate();
  }
}
