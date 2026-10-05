import React, { useState, useEffect, useRef } from "react";
import { native, core, errorText, displayValue, type Event, type Pending } from "./api";
export function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 64 64" aria-hidden="true">
      <ellipse
        cx="32"
        cy="32"
        rx="27"
        ry="12"
        fill="none"
        stroke="#729aff"
        strokeWidth="3"
        transform="rotate(-34 32 32)"
      />
      <circle cx="32" cy="32" r="6" fill="#dce6ff" />
      <circle cx="54" cy="19" r="4" fill="#9b7dff" />
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
              'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]',
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
              {entry.directory ? "▸" : "·"} {entry.name}
            </button>
          ))}
        </div>
        <pre>{content || "Select a text file to preview."}</pre>
      </div>
    </>
  );
}

export function Icon({ name, size = 24 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    chat: "M4 4h16v12H9l-5 4V4Z",
    folder: "M3 6h7l2 2h9v12H3V6Z",
    file: "M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6M9 16h6",
    memory: "M12 3a9 9 0 1 1-9 9M3 3v6h6M12 7v5l3 2",
    star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
    book: "M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H3V4Zm18 0h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h5V4Z",
    code: "m8 5-7 7 7 7m8-14 7 7-7 7m-3-17-2 20",
    orbit: "M20 4C8-1-4 18 5 20S28 5 20 4ZM12 10v4m-2-2h4",
    cloud: "M6 19a5 5 0 0 1-1-10 7 7 0 0 1 13-2 6 6 0 0 1 0 12H6Z",
    local: "M3 3h18v14H3V3Zm9 14v4m-5 0h10",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.orbit} />
    </svg>
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
