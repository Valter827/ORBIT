import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "./types.js";
import type { PathGuard } from "../security/path-guard.js";
import { UndoStore, type Backup } from "./undo-store.js";
import { diffLines, formatUnifiedish, stats } from "./diff.js";
import { readText, atomicWrite, LIMITS, missing } from "./safe-fs.js";
import { checkAbort } from "../agent/abort.js";
export class FileToolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FileToolError";
  }
}
async function checked(guard: PathGuard, p: string, mode: "read" | "write"): Promise<string> {
  try {
    return await guard.validate(p, mode);
  } catch (e) {
    throw new FileToolError("path_denied", e instanceof Error ? e.message : "Path denied");
  }
}
async function snapshot(target: string): Promise<Backup> {
  try {
    const t = await readText(target);
    return { path: target, previousContent: t.content, existedBefore: true, mode: t.mode, at: Date.now() };
  } catch (e) {
    if (missing(e)) return { path: target, previousContent: null, existedBefore: false, at: Date.now() };
    throw e;
  }
}
const PathInput = z.object({ path: z.string().min(1) });
export function createReadTool(
  guard: PathGuard,
): ToolDefinition<z.infer<typeof PathInput>, { path: string; content: string; bytes: number }> {
  return {
    name: "FileTool.read",
    domain: "files",
    action: "read",
    description: "Read a bounded UTF-8 workspace file.",
    input: PathInput,
    jsonSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    output: z.object({ path: z.string(), content: z.string(), bytes: z.number() }),
    baseRisk: "LOW",
    describe: (i) => "Read " + i.path,
    validate: async (i) => {
      await checked(guard, i.path, "read");
    },
    async execute(i, ctx) {
      checkAbort(ctx.signal);
      const t = await readText(await checked(guard, i.path, "read"));
      checkAbort(ctx.signal);
      return { path: i.path, content: t.content, bytes: Buffer.byteLength(t.content) };
    },
  };
}
const WriteInput = z.object({
  path: z.string().min(1),
  content: z
    .string()
    .refine((s) => Buffer.byteLength(s) <= LIMITS.diffBytes && !s.includes("\0"), "Text too large or binary"),
});
export async function previewWrite(guard: PathGuard, input: z.infer<typeof WriteInput>): Promise<string> {
  WriteInput.parse(input);
  const before = await snapshot(await checked(guard, input.path, "write"));
  if (Buffer.byteLength(before.previousContent ?? "") > LIMITS.diffBytes) throw new Error("Diff size limit exceeded");
  return formatUnifiedish(diffLines(before.previousContent ?? "", input.content));
}
export function createWriteTool(
  guard: PathGuard,
  undo: UndoStore,
): ToolDefinition<
  z.infer<typeof WriteInput>,
  { path: string; created: boolean; diff: string; insertions: number; deletions: number }
> {
  return {
    name: "FileTool.write",
    domain: "files",
    action: "write",
    description: "Propose a replacement UTF-8 file; user reviews the diff before execution.",
    input: WriteInput,
    jsonSchema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    output: z.object({
      path: z.string(),
      created: z.boolean(),
      diff: z.string(),
      insertions: z.number(),
      deletions: z.number(),
    }),
    baseRisk: "MEDIUM",
    describe: (i) => "Write " + i.path,
    validate: async (i) => {
      await previewWrite(guard, i);
    },
    async execute(i, ctx) {
      WriteInput.parse(i);
      checkAbort(ctx.signal);
      let target = await checked(guard, i.path, "write");
      const before = await snapshot(target);
      if (Buffer.byteLength(before.previousContent ?? "") > LIMITS.diffBytes)
        throw new Error("Diff size limit exceeded");
      const lines = diffLines(before.previousContent ?? "", i.content);
      checkAbort(ctx.signal);
      undo.transaction(ctx.taskId, "write", [before]);
      checkAbort(ctx.signal);
      await fs.mkdir(path.dirname(target), { recursive: true });
      target = await checked(guard, i.path, "write");
      checkAbort(ctx.signal);
      await atomicWrite(target, i.content, ctx.signal, before.mode);
      ctx.log("wrote " + i.path);
      return { path: i.path, created: !before.existedBefore, diff: formatUnifiedish(lines), ...stats(lines) };
    },
  };
}
export function createDeleteTool(
  guard: PathGuard,
  undo: UndoStore,
): ToolDefinition<z.infer<typeof PathInput>, { path: string; deleted: boolean }> {
  return {
    name: "FileTool.delete",
    domain: "files",
    action: "delete",
    description: "Delete one text file, with backup.",
    input: PathInput,
    jsonSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    output: z.object({ path: z.string(), deleted: z.boolean() }),
    baseRisk: "HIGH",
    describe: (i) => "Delete " + i.path,
    validate: async (i) => {
      await checked(guard, i.path, "write");
    },
    async execute(i, ctx) {
      checkAbort(ctx.signal);
      const target = await checked(guard, i.path, "write");
      let before: Backup;
      try {
        before = await snapshot(target);
      } catch (e) {
        throw new FileToolError("invalid_file", String(e));
      }
      if (!before.existedBefore) return { path: i.path, deleted: false };
      checkAbort(ctx.signal);
      undo.transaction(ctx.taskId, "delete", [before]);
      await checked(guard, i.path, "write");
      checkAbort(ctx.signal);
      await fs.unlink(target);
      return { path: i.path, deleted: true };
    },
  };
}
const MoveInput = z.object({ from: z.string().min(1), to: z.string().min(1), overwrite: z.boolean().optional() });
export function createMoveTool(
  guard: PathGuard,
  undo: UndoStore,
): ToolDefinition<z.infer<typeof MoveInput>, { from: string; to: string }> {
  return {
    name: "FileTool.move",
    domain: "files",
    action: "move",
    description: "Move a text file. Existing targets require explicit overwrite.",
    input: MoveInput,
    jsonSchema: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" }, overwrite: { type: "boolean" } },
      required: ["from", "to"],
    },
    output: z.object({ from: z.string(), to: z.string() }),
    baseRisk: "MEDIUM",
    assess: (i) => (i.overwrite ? "HIGH" : "MEDIUM"),
    describe: (i) => "Move " + i.from + " to " + i.to + (i.overwrite ? " (overwrite)" : ""),
    validate: async (i) => {
      await checked(guard, i.from, "write");
      const to = await checked(guard, i.to, "write");
      if ((await snapshot(to)).existedBefore && !i.overwrite)
        throw new Error("Destination exists; explicit overwrite required");
    },
    async execute(i, ctx) {
      checkAbort(ctx.signal);
      const from = await checked(guard, i.from, "write"),
        to = await checked(guard, i.to, "write");
      if (from === to) throw new Error("Same source and destination");
      const src = await snapshot(from),
        dst = await snapshot(to);
      if (!src.existedBefore) throw new FileToolError("not_found", "Source missing");
      if (dst.existedBefore && !i.overwrite) throw new Error("Destination exists; explicit overwrite required");
      checkAbort(ctx.signal);
      undo.transaction(ctx.taskId, "move", [src, dst]);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await checked(guard, i.from, "write");
      await checked(guard, i.to, "write");
      checkAbort(ctx.signal);
      if (i.overwrite) await fs.rename(from, to);
      else {
        await fs.link(from, to);
        checkAbort(ctx.signal);
        await fs.unlink(from);
      }
      return { from: i.from, to: i.to };
    },
  };
}
const SearchInput = z.object({ query: z.string().min(1), extensions: z.array(z.string()).optional() });
const SearchOutput = z.object({
  matches: z.array(z.object({ path: z.string(), line: z.number(), text: z.string() })),
  truncated: z.boolean(),
});
export function createSearchTool(
  guard: PathGuard,
  workspaceRoot: string,
): ToolDefinition<z.infer<typeof SearchInput>, z.infer<typeof SearchOutput>> {
  return {
    name: "FileTool.search",
    domain: "files",
    action: "search",
    description: "Bounded literal text search.",
    input: SearchInput,
    output: SearchOutput,
    baseRisk: "LOW",
    describe: (i) => "Search " + i.query,
    jsonSchema: {
      type: "object",
      properties: { query: { type: "string" }, extensions: { type: "array", items: { type: "string" } } },
      required: ["query"],
    },
    async execute(i, ctx) {
      const matches: z.infer<typeof SearchOutput>["matches"] = [];
      let count = 0,
        entriesSeen = 0,
        truncated = false;
      const stack = [await checked(guard, workspaceRoot, "read")];
      while (stack.length && !truncated) {
        checkAbort(ctx.signal);
        const dir = stack.pop()!;
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          checkAbort(ctx.signal);
          if (++entriesSeen > LIMITS.searchEntries) {
            truncated = true;
            break;
          }
          if (
            ["node_modules", ".git", ".orbit", "dist", "build", ".venv"].includes(entry.name) ||
            entry.isSymbolicLink()
          )
            continue;
          const full = path.join(dir, entry.name);
          let target: string;
          try {
            target = await checked(guard, full, "read");
          } catch {
            continue;
          }
          if (entry.isDirectory()) {
            stack.push(target);
            continue;
          }
          if (!entry.isFile() || (i.extensions && !i.extensions.some((e) => entry.name.endsWith(e)))) continue;
          if (++count > LIMITS.searchFiles) {
            truncated = true;
            break;
          }
          let content: string;
          try {
            content = (await readText(target, LIMITS.searchBytes)).content;
          } catch {
            continue;
          }
          const lines = content.split("\n");
          for (let n = 0; n < lines.length; n++)
            if (lines[n]!.includes(i.query)) {
              matches.push({
                path: path.relative(workspaceRoot, target).split(path.sep).join("/"),
                line: n + 1,
                text: lines[n]!.trim().slice(0, 200),
              });
              if (matches.length >= LIMITS.searchResults) {
                truncated = true;
                break;
              }
            }
          if (truncated) break;
        }
      }
      return { matches, truncated };
    },
  };
}
export function registerFileTools(
  registry: { register: (t: ToolDefinition<never, unknown>) => void },
  guard: PathGuard,
  undo: UndoStore,
  root: string,
): void {
  for (const tool of [
    createReadTool(guard),
    createWriteTool(guard, undo),
    createDeleteTool(guard, undo),
    createMoveTool(guard, undo),
    createSearchTool(guard, root),
  ])
    registry.register(tool as ToolDefinition<never, unknown>);
}
