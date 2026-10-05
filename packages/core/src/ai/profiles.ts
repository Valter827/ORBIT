import { IntelligenceSettings } from "./intelligence.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { redactDeep } from "../security/redactor.js";
export const Capability = z.enum(["read", "search", "tests", "gitRead", "write", "terminal", "network", "gitWrite"]);
export type Capability = z.infer<typeof Capability>;
const modes = z.enum(["ask", "task", "always", "disabled"]);
export const ProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    intelligence: IntelligenceSettings,
    builtin: z
      .object({ id: z.literal("cosmo"), version: z.literal("1.0") })
      .strict()
      .optional(),
    isDraft: z.boolean().default(false),
    senseEnabled: z.boolean().default(false),
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(60),
    description: z.string().max(300),
    icon: z.enum(["orbit", "star", "code", "book"]).default("orbit"),
    providerId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    modelId: z.string().max(200),
    personality: z
      .enum([
        "Professional",
        "Friendly",
        "Concise",
        "Teacher",
        "Programmer",
        "Custom",
        "Balanced",
        "Creative",
        "Technical",
      ])
      .default("Professional"),
    instructions: z.string().max(12000).default(""),
    systemPrompt: z.string().max(24000),
    capabilities: z
      .array(Capability)
      .max(8)
      .refine((a) => new Set(a).size === a.length),
    permissionPolicy: z
      .object({
        read: modes.default("ask"),
        search: modes.default("ask"),
        tests: modes.default("ask"),
        gitRead: modes.default("ask"),
        write: modes.default("ask"),
        terminal: modes.default("ask"),
        network: modes.default("disabled"),
        gitWrite: modes.default("disabled"),
      })
      .strict(),
    memory: z
      .object({
        conversation: z.boolean(),
        project: z.boolean(),
        user: z.boolean(),
        shared: z.boolean(),
        suggestions: z.boolean().default(true),
        automatic: z
          .array(z.enum(["preference", "decision", "goal", "task"]))
          .max(4)
          .default([]),
      })
      .strict(),

    purposes: z
      .array(
        z.enum([
          "Programming",
          "Study",
          "Writing",
          "Research",
          "Work",
          "Personal assistant",
          "Gaming",
          "Creative work",
          "Business",
          "Other",
        ]),
      )
      .max(10)
      .default([]),
    goal: z.string().max(4000).default(""),
    traits: z
      .object({
        length: z.number().min(0).max(100),
        creativity: z.number().min(0).max(100),
        initiative: z.number().min(0).max(100),
        explanation: z.number().min(0).max(100),
      })
      .strict()
      .default({ length: 50, creativity: 30, initiative: 20, explanation: 50 }),
    skills: z
      .array(z.enum(["code-reviewer", "bug-finder", "summarizer", "study-tutor", "project-explainer"]))
      .max(5)
      .default([]),
    workflows: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            name: z.string().min(1).max(100),
            steps: z.array(z.string().min(1).max(500)).min(1).max(20),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    maxTokens: z.number().int().min(64).max(8192).default(2048),
  })
  .strict();
export type AIProfile = z.infer<typeof ProfileSchema>;
export function createProfile(name = "NOVA", providerId = "anthropic", modelId = ""): AIProfile {
  return ProfileSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    name,
    description: "My AI assistant",
    providerId,
    modelId,
    systemPrompt: "You are " + name + ". Help the user with clear and accurate answers.",
    capabilities: ["read", "search", "tests", "gitRead"],
    permissionPolicy: {},
    memory: { conversation: true, project: true, user: true, shared: false },
  });
}
export function exportProfile(value: unknown): string {
  return JSON.stringify(redactDeep(ProfileSchema.parse(value)).value, null, 2);
}
export function importProfile(value: unknown): AIProfile {
  const profile = ProfileSchema.parse(value);
  profile.id = randomUUID();
  delete profile.builtin;
  for (const cap of Capability.options)
    profile.permissionPolicy[cap] = profile.permissionPolicy[cap] === "disabled" ? "disabled" : "ask";
  profile.memory.shared = false;
  profile.memory.automatic = [];
  profile.senseEnabled = false;
  profile.intelligence = IntelligenceSettings.parse({
    mode: profile.intelligence.mode,
    auto: profile.intelligence.auto,
  });
  return profile;
}
export function capabilityFor(tool: string, input: unknown, verificationCommand: string): Capability | null {
  if (tool === "FileTool.read") return "read";
  if (tool === "FileTool.search") return "search";
  if (["FileTool.write", "FileTool.delete", "FileTool.move"].includes(tool)) return "write";
  if (tool === "TerminalTool.run") {
    const cmd = typeof input === "object" && input !== null && "command" in input ? input.command : null;
    if (cmd === verificationCommand) return "tests";
    if (typeof cmd === "string" && ["git status --short", "git diff --stat", "git log -5 --oneline"].includes(cmd))
      return "gitRead";
    return "terminal";
  }
  return null;
}
export function authorizeProfile(profile: AIProfile, tool: string, input: unknown, verificationCommand: string) {
  const cap = capabilityFor(tool, input, verificationCommand);
  if (!cap || !profile.capabilities.includes(cap) || profile.permissionPolicy[cap] === "disabled")
    throw new Error("This AI profile is not allowed to use " + (cap ?? tool) + ".");
}
