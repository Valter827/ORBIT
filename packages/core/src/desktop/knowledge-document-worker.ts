import { parentPort, workerData } from "node:worker_threads";
import { parseDocument } from "./knowledge-documents.js";

const input = workerData as { file: string; limit: number };
void parseDocument(String(input.file), Number(input.limit))
  .then((result) => parentPort?.postMessage({ result }))
  .catch(() =>
    parentPort?.postMessage({
      error: "Document parsing failed. The format may be invalid, unsupported or exceed parser limits.",
    }),
  );
