export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type SideEffect = "READ_ONLY" | "EXECUTION" | "WRITE" | "DELETE" | "NETWORK" | "INSTALL" | "SYSTEM" | "UNKNOWN";
export interface RiskAssessment {
  level: RiskLevel;
  reason: string;
  requiresExplicitApproval: boolean;
  matched: string[];
  effects: SideEffect[];
  shell: "cmd" | "powershell" | "posix" | "unknown";
}
const order: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return order[a] >= order[b] ? a : b;
}
interface Tokens {
  segments: string[][];
  redirects: boolean;
  substitution: boolean;
  unknown: boolean;
}
/** Conservative lexer, not an interpreter. Ambiguous expansion/escaping never enters the safe list. */
function tokenize(raw: string): Tokens {
  const result: Tokens = { segments: [], redirects: false, substitution: false, unknown: false };
  let segment: string[] = [],
    word = "",
    quote = "";
  const flush = () => {
    if (word.length) {
      segment.push(word);
      word = "";
    }
  };
  const boundary = () => {
    flush();
    if (segment.length) result.segments.push(segment);
    segment = [];
  };
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c === "`" || (c === "$" && raw[i + 1] === "(")) result.substitution = true;
    if (c === "^" || c === "%" || c === "$" || c === "\\") result.unknown = true;
    if (quote) {
      if (c === quote) quote = "";
      else word += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (c === "(" || c === ")") {
      result.unknown = true;
      boundary();
      continue;
    }
    if ("><".includes(c)) {
      result.redirects = true;
      boundary();
      continue;
    }
    if ("&|;\n\r".includes(c)) {
      boundary();
      continue;
    }
    if (/\s/.test(c)) {
      flush();
      continue;
    }
    word += c;
  }
  if (quote) result.unknown = true;
  boundary();
  return result;
}
function segmentRisk(words: string[]): { level: RiskLevel; effect: SideEffect } {
  const cmd = (words[0] ?? "").toLowerCase(),
    args = words.slice(1),
    lower = args.map((a) => a.toLowerCase());
  const text = lower.join(" ");
  if (["cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe", "sh", "bash"].includes(cmd))
    return { level: "HIGH", effect: "UNKNOWN" };
  if (
    ["mkfs", "diskpart", "format", "fdisk", "regedit", "invoke-expression", "iex"].includes(cmd) ||
    cmd.startsWith("mkfs.")
  )
    return { level: "CRITICAL", effect: "SYSTEM" };
  if (cmd === "reg" && ["add", "delete"].includes(lower[0] ?? "")) return { level: "CRITICAL", effect: "SYSTEM" };
  if (["rm", "rmdir", "del", "erase", "remove-item"].includes(cmd)) {
    const recursive = lower.some((a) => /^-[a-z]*r/i.test(a) || a === "-recurse" || a === "/s" || a === "--recursive");
    return { level: recursive ? "CRITICAL" : "HIGH", effect: "DELETE" };
  }
  if (
    ["move-item", "set-content", "add-content", "out-file", "mv", "cp", "copy", "move", "mkdir", "touch"].includes(cmd)
  )
    return { level: "HIGH", effect: "WRITE" };
  if (["start-process", "sudo", "runas", "shutdown", "taskkill", "sc", "systemctl", "net"].includes(cmd))
    return { level: "HIGH", effect: "SYSTEM" };
  if (["curl", "wget", "invoke-webrequest", "iwr"].includes(cmd)) return { level: "HIGH", effect: "NETWORK" };
  if (cmd === "git") {
    const sub = lower[0],
      rest = lower.slice(1);
    if (
      (sub === "reset" && rest.includes("--hard")) ||
      (sub === "clean" && rest.some((a) => /^-[a-z]*[fd]/.test(a))) ||
      (sub === "push" && rest.some((a) => a === "--force" || a === "-f" || a.startsWith("--force=")))
    )
      return { level: "CRITICAL", effect: "DELETE" };
    if (sub === "push") return { level: "HIGH", effect: "NETWORK" };
    if (sub === "branch" && args.slice(1).some((a) => a === "-D" || a === "-d" || a === "--delete"))
      return { level: "HIGH", effect: "DELETE" };
    if (
      ["commit", "merge", "rebase", "checkout", "switch", "stash", "reset", "clean", "add", "tag"].includes(sub ?? "")
    )
      return { level: "MEDIUM", effect: "WRITE" };
    if (
      sub === "branch" &&
      rest.length > 0 &&
      !rest.every((a) => ["--list", "-a", "-r", "-v", "-vv", "--show-current"].includes(a))
    )
      return { level: "MEDIUM", effect: "WRITE" };
    if (
      ["status", "diff", "log", "show", "branch"].includes(sub ?? "") &&
      !rest.some((a) => a.startsWith("--output") || a === "--ext-diff" || a === "--textconv")
    )
      return { level: "LOW", effect: "READ_ONLY" };
    if (sub === "remote" && rest.length === 1 && rest[0] === "-v") return { level: "LOW", effect: "READ_ONLY" };
    return { level: "HIGH", effect: "UNKNOWN" };
  }
  if (["npm", "npm.cmd", "pnpm", "yarn", "bun"].includes(cmd)) {
    if (["install", "i", "add", "remove", "uninstall", "update"].includes(lower[0] ?? ""))
      return { level: "MEDIUM", effect: "INSTALL" };
    if (
      ["test", "build", "lint", "typecheck"].includes(lower[0] ?? "") ||
      (lower[0] === "run" && ["test", "build", "lint", "typecheck"].includes(lower[1] ?? ""))
    )
      return { level: "LOW", effect: "EXECUTION" };
    if (["-v", "--version", "ls"].includes(text)) return { level: "LOW", effect: "READ_ONLY" };
  }
  if (cmd === "prisma" && ["migrate", "db"].includes(lower[0] ?? "")) return { level: "MEDIUM", effect: "WRITE" };
  if (cmd === "tsc" || cmd === "pytest" || (cmd === "cargo" && ["test", "build", "check"].includes(lower[0] ?? "")))
    return { level: "LOW", effect: "EXECUTION" };
  if (cmd === "node" && ["-v", "--version"].includes(text)) return { level: "LOW", effect: "READ_ONLY" };
  if (["echo", "pwd", "ls", "dir", "cat", "type", "grep", "get-content", "get-childitem", "get-location"].includes(cmd))
    return { level: "LOW", effect: "READ_ONLY" };
  return { level: "HIGH", effect: "UNKNOWN" };
}
export function assessCommand(command: string): RiskAssessment {
  const tokens = tokenize(command);
  let level: RiskLevel = "LOW";
  const effects = new Set<SideEffect>();
  for (const segment of tokens.segments) {
    const result = segmentRisk(segment);
    level = maxRisk(level, result.level);
    effects.add(result.effect);
  }
  if (tokens.redirects) {
    level = maxRisk(level, "HIGH");
    effects.add("WRITE");
  }
  if (tokens.unknown || tokens.substitution || !tokens.segments.length) {
    level = maxRisk(level, "HIGH");
    effects.add("UNKNOWN");
  }
  // Nested shell text is classified too, without trusting its quoting.
  const first = tokens.segments[0]?.[0]?.toLowerCase() ?? "";
  const shell = first.startsWith("cmd")
    ? "cmd"
    : /^(powershell|pwsh)/.test(first)
      ? "powershell"
      : /^(sh|bash)$/.test(first)
        ? "posix"
        : "unknown";
  if (shell !== "unknown") {
    const nested = tokens.segments[0]!.slice(1)
      .filter((w) => !/^[-/](c|k|command|noprofile|noninteractive)$/i.test(w))
      .join(" ");
    if (nested && nested !== command) {
      const r = assessCommand(nested);
      level = maxRisk(level, r.level);
      r.effects.forEach((e) => effects.add(e));
    }
  }
  if (/\|\s*(?:sudo\s+)?(?:bash|sh|zsh)\b/i.test(command)) {
    level = "CRITICAL";
    effects.add("EXECUTION");
  }
  return {
    level,
    effects: [...effects],
    shell,
    reason: [...effects].join(", "),
    requiresExplicitApproval: order[level] >= order.HIGH,
    matched: [...effects],
  };
}
