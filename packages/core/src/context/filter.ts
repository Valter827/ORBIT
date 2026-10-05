import { redactDeep } from "../security/redactor.js";

export interface ContextSnapshot {
  capturedAt: number;
  project: { name: string; root: string; stack: string[] } | null;
  activeApplication: { name: string; title: string } | null;
  activeFile: { path: string; language: string; excerpt?: string } | null;
  workspace: { openFiles: string[] };
  terminalState: { cwd: string; recentCommands: string[]; recentOutput: string[] } | null;
  gitState: { branch: string; modified: string[]; recentCommits: string[]; diff?: string } | null;
  browserState: { tabs: Array<{ title: string; url: string }> } | null;
  screenState: { enabled: boolean; capturedAt: number | null };
  recentActions: string[];
  recentErrors: string[];
}

export interface ContextSource {
  key: keyof ContextSnapshot;
  enabled: boolean;
}

export interface FilterOptions {
  /** Rough character budget for the serialised context. */
  budgetChars: number;
  /** Sources the user has switched off in Privacy settings. */
  disabled: ReadonlySet<keyof ContextSnapshot>;
  /** Free-text request used to score relevance. */
  query: string;
}

export interface FilteredContext {
  snapshot: Partial<ContextSnapshot>;
  includedKeys: string[];
  droppedKeys: string[];
  redactions: Array<{ kind: string; count: number }>;
  approxChars: number;
}

/** Keywords that pull a source into the prompt when they appear in the request. */
const AFFINITY: Partial<Record<keyof ContextSnapshot, RegExp>> = {
  gitState: /\b(git|branch|commit|merge|diff|push|pull|rebase|stash|конфликт|ветк)/i,
  terminalState: /\b(terminal|command|build|run|install|test|error|fail|терминал|ошибк|сборк)/i,
  browserState: /\b(browser|tab|page|url|site|docs|браузер|вкладк|страниц)/i,
  activeFile: /\b(this|file|code|function|component|refactor|explain|файл|код|функц)/i,
  recentErrors: /\b(error|bug|fail|crash|broken|not working|ошибк|баг|не работает)/i,
};

const BASE_PRIORITY: Array<keyof ContextSnapshot> = [
  "project",
  "activeFile",
  "recentErrors",
  "gitState",
  "terminalState",
  "workspace",
  "activeApplication",
  "recentActions",
  "browserState",
  "screenState",
];

function sizeOf(value: unknown): number {
  return JSON.stringify(value ?? null).length;
}

/**
 * Selects the smallest slice of the snapshot that plausibly answers the query.
 * Nothing is sent that the user disabled, and screenState is excluded unless
 * Screen Mode is actually on.
 */
export function filterContext(snapshot: ContextSnapshot, options: FilterOptions): FilteredContext {
  const scored = BASE_PRIORITY.map((key, i) => {
    const affinity = AFFINITY[key];
    const boost = affinity && affinity.test(options.query) ? 100 : 0;
    return { key, score: boost + (BASE_PRIORITY.length - i) };
  }).sort((a, b) => b.score - a.score);

  const out: Partial<ContextSnapshot> = { capturedAt: snapshot.capturedAt };
  const included: string[] = [];
  const dropped: string[] = [];
  let used = 0;

  for (const { key } of scored) {
    if (options.disabled.has(key)) {
      dropped.push(key);
      continue;
    }
    if (key === "screenState" && !snapshot.screenState.enabled) {
      dropped.push(key);
      continue;
    }
    const value = snapshot[key];
    if (value === null || value === undefined) {
      dropped.push(key);
      continue;
    }
    const cost = sizeOf(value);
    if (used + cost > options.budgetChars) {
      dropped.push(key);
      continue;
    }
    Object.assign(out, { [key]: value });
    included.push(key);
    used += cost;
  }

  const { value, redactions } = redactDeep(out);
  return {
    snapshot: value,
    includedKeys: included,
    droppedKeys: dropped,
    redactions,
    approxChars: sizeOf(value),
  };
}
