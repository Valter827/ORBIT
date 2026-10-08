import {
  MessageSquare,
  Folder,
  FileText,
  Brain,
  Sparkles,
  BookOpen,
  Code,
  Orbit,
  Cloud,
  Monitor,
  Globe,
  Settings,
  Search,
  Plus,
  ArrowUp,
  Square,
  Copy,
  Check,
  RotateCcw,
  Pencil,
  Trash2,
  Pin,
  Upload,
  Download,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Ellipsis,
  ShieldCheck,
  AlertTriangle,
  CircleAlert,
  WifiOff,
  LoaderCircle,
  Link,
  Eye,
  Paperclip,
  Zap,
  Layers,
  ChevronDown,
  MapPin,
  Play,
  Gamepad2,
  Palette,
  Keyboard,
  Lock,
  Info,
  SlidersHorizontal,
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { native, core, errorText, displayValue, type Event, type Pending } from "./api";
export function Logo() {
  return (
    <svg className="orbit-mark" width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="3" y="3" width="58" height="58" rx="19" fill="var(--accent-muted)" />
      <circle cx="32" cy="32" r="17" fill="none" stroke="var(--accent)" strokeWidth="4" />
      <path d="M13 41C5 28 40 9 51 22C59 36 24 55 13 41Z" fill="none" stroke="var(--text-primary)" strokeWidth="3" />
      <circle cx="48" cy="22" r="5" fill="var(--accent)" />
    </svg>
  );
}
export function Button({
  children,
  onClick,
  disabled = false,
  variant = "secondary",
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "quiet";
  title?: string;
  id?: string;
  "aria-expanded"?: boolean;
  "aria-pressed"?: boolean;
}) {
  return (
    <button {...rest} className={"ui-button " + variant} type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
export function Modal({ title, children }: { title: string; children: React.ReactNode }) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (dialog.current?.querySelector<HTMLElement>("[data-autofocus]") ?? dialog.current)?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="overlay">
      <section
        ref={dialog}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            const cancel = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((b) =>
              /^(Close|Cancel|Not now|Got it)$/.test(b.textContent?.trim() ?? ""),
            );
            if (cancel) {
              e.preventDefault();
              cancel.click();
            }
            return;
          }
          if (e.key !== "Tab") return;
          const elements = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              'a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]',
            ) ?? [],
          ).filter((el) => el.getClientRects().length);
          const first = elements[0],
            last = elements.at(-1);
          if (!first) {
            e.preventDefault();
            return;
          }
          if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
            e.preventDefault();
            first.focus();
          }
        }}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}
export function Quick() {
  const [text, setText] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="quick">
      <Logo />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          native("quick_submit", { request: text }).catch((e) => setError(errorText(e)));
        }}
      >
        <input
          autoFocus
          aria-label="Ask ORBIT"
          placeholder="Ask ORBIT…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <small>Enter to continue in ORBIT · Review before running</small>
        <Button onClick={() => void native("quick_sense", { request: text }).catch((e) => setError(errorText(e)))}>
          ORBIT Sense · Ask about a window
        </Button>
        {error && <p role="alert">{error}</p>}
      </form>
    </div>
  );
}
export function Approval({ pending, answer }: { pending: Pending; answer: (id: string, answer: string) => void }) {
  const d = pending.data;
  const request = d.request && typeof d.request === "object" ? (d.request as Record<string, unknown>) : {};
  return (
    <section className="approval card">
      <h3>
        {pending.kind === "plan"
          ? "Review the plan"
          : pending.kind === "diff"
            ? "Review file changes"
            : "Permission required"}
      </h3>
      {pending.kind === "plan" ? (
        <pre>{displayValue(d.plan ?? "")}</pre>
      ) : pending.kind === "diff" ? (
        <>
          <p className="path">{displayValue(d.path ?? "")}</p>
          <DiffView diff={displayValue(d.diff ?? "")} />
        </>
      ) : (
        <>
          <p>{displayValue(request.reason ?? d.description ?? "Review this action")}</p>
          <dl className="permission-details">
            <div>
              <dt>Tool</dt>
              <dd>
                {displayValue(request.domain ?? "Unknown")} · {displayValue(request.action ?? "Action")}
              </dd>
            </div>
            <div>
              <dt>Risk</dt>
              <dd>{displayValue(request.risk ?? "Not provided")}</dd>
            </div>
          </dl>
          {typeof request.target === "string" && <pre className="permission-target">{request.target}</pre>}
          <p className="muted">This approval applies to the current selected workspace.</p>
        </>
      )}
      <div className="actions">
        {(pending.kind === "permission"
          ? [
              ["once", "Allow once"],
              ["task", "Allow for task"],
              ["deny", "Deny"],
            ]
          : [
              ["approve", pending.kind === "diff" ? "Apply changes" : "Approve plan"],
              ["reject", "Reject"],
            ]
        ).map(([a, label]) => (
          <Button
            variant={a === "approve" || a === "once" ? "primary" : "secondary"}
            key={a}
            onClick={() => answer(pending.id, a)}
          >
            {label}
          </Button>
        ))}
      </div>
    </section>
  );
}
export function EventList({ events }: { events: Event[] }) {
  return (
    <div className="timeline" aria-label="Agent activity">
      {!events.length && (
        <EmptyState title="No activity yet">
          Start a task from Home. Real progress and tool results will appear here.
        </EmptyState>
      )}
      {events
        .filter((e) => !["step.completed", "tool.requested", "permission.granted"].includes(e.type))
        .slice(-100)
        .map((event, index) => (
          <div
            className={"event " + (/failed|denied|rejected/.test(event.type) ? "failed" : "")}
            key={event.at + ":" + index}
          >
            <span className="dot" />
            <div>
              <strong>
                {(
                  {
                    "agent.created": "Task created",
                    "agent.started": "Agent started",
                    "step.started": "Working on a step",
                    "tool.started": "Running tool",
                    "permission.required": "Waiting for your permission",
                    "diff.created": "File changes ready for review",
                    "verification.started": "Checking the result",
                    "verification.passed": "Checks passed",
                    "agent.completed": "Task completed",
                  } as Record<string, string>
                )[event.type] ?? event.type.replaceAll(".", " ").replaceAll("_", " ")}
              </strong>
              <small>{new Date(event.at).toLocaleTimeString()}</small>
              {typeof event.data.message === "string" && <p>{event.data.message}</p>}
              {typeof event.data.text === "string" && <pre>{event.data.text}</pre>}
              {typeof event.data.description === "string" && <p>{event.data.description}</p>}
              {typeof event.data.diff === "string" && (
                <details>
                  <summary>File changes</summary>
                  <DiffView diff={event.data.diff} />
                </details>
              )}
              {event.data.output !== undefined && (
                <details>
                  <summary>Tool result</summary>
                  <pre>
                    {typeof event.data.output === "string"
                      ? event.data.output
                      : JSON.stringify(event.data.output, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}
export function Files() {
  const [directory, setDirectory] = useState("."),
    [entries, setEntries] = useState<{ name: string; directory: boolean; path: string }[]>([]),
    [content, setContent] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    setError("");
    core<typeof entries>("files", { directory })
      .then(setEntries)
      .catch((e) => setError(errorText(e)));
  }, [directory]);
  return (
    <>
      <h1>Files</h1>
      <p className="path">{directory}</p>
      {error && <p role="alert">{error}</p>}
      <Button
        onClick={() => {
          setDirectory(".");
          setContent("");
        }}
      >
        Project root
      </Button>
      <div className="file-layout">
        <div>
          {entries.map((entry) => (
            <button
              className="file"
              key={entry.path}
              onClick={() =>
                entry.directory
                  ? setDirectory(entry.path)
                  : void core<{ content: string }>("read", { file: entry.path })
                      .then((r) => setContent(r.content))
                      .catch((e) => setError(errorText(e)))
              }
            >
              <Icon name={entry.directory ? "folder" : "file"} size={16} /> {entry.name}
            </button>
          ))}
        </div>
        <pre>{content || "Select a text file to preview."}</pre>
      </div>
    </>
  );
}

const iconFamily = {
  chat: MessageSquare,
  folder: Folder,
  file: FileText,
  memory: Brain,
  star: Sparkles,
  book: BookOpen,
  code: Code,
  orbit: Orbit,
  cloud: Cloud,
  local: Monitor,
  browser: Globe,
  settings: Settings,
  search: Search,
  add: Plus,
  send: ArrowUp,
  stop: Square,
  copy: Copy,
  check: Check,
  retry: RotateCcw,
  edit: Pencil,
  delete: Trash2,
  pin: Pin,
  upload: Upload,
  download: Download,
  external: ExternalLink,
  back: ArrowLeft,
  forward: ArrowRight,
  refresh: RefreshCw,
  close: X,
  collapse: PanelLeftClose,
  expand: PanelLeftOpen,
  menu: Ellipsis,
  verified: ShieldCheck,
  warning: AlertTriangle,
  error: CircleAlert,
  offline: WifiOff,
  loading: LoaderCircle,
  link: Link,
  sense: Eye,
  attach: Paperclip,
  fast: Zap,
  balanced: Layers,
  deep: Brain,
  chevron: ChevronDown,
  place: MapPin,
  video: Play,
  steam: Gamepad2,
  appearance: Palette,
  shortcuts: Keyboard,
  privacy: Lock,
  info: Info,
  advanced: SlidersHorizontal,
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const Glyph = iconFamily[name as keyof typeof iconFamily] ?? Orbit;
  return <Glyph className="orbit-icon" size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" />;
}
export function IconButton({
  name,
  label,
  onClick,
  disabled = false,
}: {
  name: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={name} />
    </button>
  );
}
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!copied && !failed) return;
    const timer = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, [copied, failed]);
  return (
    <button
      type="button"
      className="copy-button"
      title={label}
      aria-label={label}
      onClick={() =>
        void navigator.clipboard
          .writeText(text)
          .then(() => setCopied(true))
          .catch(() => setFailed(true))
      }
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
      <span role="status">{failed ? "Copy unavailable" : copied ? "Copied" : label}</span>
    </button>
  );
}
export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="empty-state">
      <h3>{title}</h3>
      <div>{children}</div>
    </section>
  );
}
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <span className="loading-dot" />
      {label}
    </div>
  );
}
export function ErrorNotice({
  details,
  retry,
  onSettings,
}: {
  details: string;
  retry?: () => void;
  onSettings?: () => void;
}) {
  return (
    <div className="notice" role="alert">
      <strong>
        {/stopped|cancelled/i.test(details)
          ? "Generation stopped."
          : /model.*(unavailable|not found|missing)/i.test(details)
            ? "The selected model is unavailable."
            : /ECONNREFUSED|offline|fetch failed|connect/i.test(details)
              ? "Your AI could not connect."
              : "This action could not be completed."}
      </strong>
      <p>
        {/stopped|cancelled/i.test(details)
          ? "You can send another message when ready."
          : /model.*(unavailable|not found|missing)/i.test(details)
            ? "Refresh your models or choose another brain. ORBIT will not switch automatically."
            : "Check that your selected runtime or provider is available, then try again."}
      </p>
      {retry && <Button onClick={retry}>Retry</Button>}
      {onSettings && <Button onClick={onSettings}>Open settings</Button>}
      <details>
        <summary>Technical details</summary>
        <pre className="source-preview">{details}</pre>
      </details>
    </div>
  );
}

export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  const added = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length,
    removed = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;
  return (
    <div className="diff-view">
      <p className="diff-summary">
        <span className="diff-added">+{added} added</span>
        <span className="diff-removed">−{removed} removed</span>
      </p>
      <pre className="diff" aria-label="File diff">
        <code>
          {lines.map((line, i) => (
            <span
              key={i}
              className={
                line.startsWith("+++") || line.startsWith("---")
                  ? "diff-meta"
                  : line.startsWith("+")
                    ? "diff-added"
                    : line.startsWith("-")
                      ? "diff-removed"
                      : line.startsWith("@@")
                        ? "diff-meta"
                        : ""
              }
            >
              {line + "\n"}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

export function ToastRegion() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = (event: globalThis.Event) => {
      const value = (event as CustomEvent<unknown>).detail;
      if (typeof value !== "string") return;
      setMessage(value);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(""), 2600);
    };
    addEventListener("orbit-notice", show);
    return () => {
      removeEventListener("orbit-notice", show);
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className={message ? "toast" : "sr-only"} role="status" aria-live="polite">
      {message && <Icon name="check" size={16} />} {message}
    </div>
  );
}
