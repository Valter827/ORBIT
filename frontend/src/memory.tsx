import { useEffect, useState } from "react";
import { core, errorText } from "./api";
import type { AIState } from "./ai-types";
import { Button, Modal, ErrorNotice, LoadingState, Icon } from "./components";
const types = ["preference", "project", "decision", "goal", "task", "fact"] as const;
type MemoryType = (typeof types)[number];
type Candidate = {
  type: MemoryType;
  content: string;
  scope: "user" | "project" | "conversation";
  normalizedKey: string;
  importance: "low" | "normal" | "important" | "pinned";
  reason: string;
  validUntil: number | null;
};
type Row = {
  id: string;
  content: string;
  scope: string;
  project: string;
  owner: string;
  type: MemoryType;
  importance: Candidate["importance"];
  status: string;
  at: number;
  updated: number;
  source: string;
  source_conversation: string;
  source_title?: string | null;
  source_message: string;
  reason: string;
  last_used: number | null;
  use_count: number;
  valid_until: number | null;
  supersedes: string | null;
  superseded_by: string | null;
  task_status: string;
  reviewReasons?: string[];
};
type Proposal = { id: string; candidate: Candidate; conflicts: Row[] };
export function MemorySuggestions({ revision }: { revision: string | undefined }) {
  const [items, setItems] = useState<Proposal[]>([]),
    [editing, setEditing] = useState<string>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => core<Proposal[]>("ai.memorySuggestions").then(setItems);
  useEffect(() => {
    let active = true;
    void core<Proposal[]>("ai.memorySuggestions")
      .then((r) => {
        if (active) setItems(r);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [revision]);
  const decide = async (item: Proposal, action: "remember" | "update" | "ignore") => {
    setBusy(true);
    try {
      await core("ai.memoryDecide", {
        id: item.id,
        action,
        ...(editing === item.id ? { candidate: item.candidate } : {}),
      });
      await load();
      window.dispatchEvent(new Event("orbit-memory-changed"));
      setEditing(undefined);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (!items.length) return null;
  return (
    <details className="card memory-suggestions">
      <summary>Memory suggestions · {items.length}</summary>
      <p>Review what your AI can remember. Suggestions are not used as permanent memory.</p>
      {error && <p role="alert">{error}</p>}
      {items.map((item) => (
        <article className="memory-proposal" key={item.id}>
          <p className="muted">
            {item.candidate.type} · {item.candidate.scope === "user" ? "Private AI" : item.candidate.scope}
          </p>
          {editing === item.id ? (
            <>
              <label>
                Suggested memory
                <textarea
                  maxLength={2000}
                  value={item.candidate.content}
                  onChange={(e) =>
                    setItems(
                      items.map((p) =>
                        p.id === item.id
                          ? { ...p, candidate: { ...p.candidate, content: e.target.value, normalizedKey: "" } }
                          : p,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Scope
                <select
                  value={item.candidate.scope}
                  onChange={(e) =>
                    setItems(
                      items.map((p) =>
                        p.id === item.id
                          ? { ...p, candidate: { ...p.candidate, scope: e.target.value as Candidate["scope"] } }
                          : p,
                      ),
                    )
                  }
                >
                  <option value="user">Private AI</option>
                  <option value="project">Current project</option>
                  <option value="conversation">This conversation</option>
                </select>
              </label>
            </>
          ) : (
            <p>{item.candidate.content}</p>
          )}
          {!!item.conflicts.length && (
            <div>
              <strong>Update memory?</strong>
              {item.conflicts.map((old) => (
                <p key={old.id}>Previous: {old.content}</p>
              ))}
              <p>Keep both only when the subject or scope differs; edit the proposal first.</p>
            </div>
          )}
          <div className="actions">
            <Button disabled={busy} onClick={() => void decide(item, item.conflicts.length ? "update" : "remember")}>
              {item.conflicts.length ? "Update" : "Remember"}
            </Button>
            <Button disabled={busy} onClick={() => setEditing(item.id)}>
              Edit
            </Button>
            <Button disabled={busy} onClick={() => void decide(item, "ignore")}>
              Not now
            </Button>
          </div>
        </article>
      ))}
    </details>
  );
}
export function MemoryPanel() {
  const [identity, setIdentity] = useState({ name: "Your AI", shared: [] as string[] });
  useEffect(() => {
    void core<AIState>("ai.state")
      .then((s) =>
        setIdentity({
          name: s.profiles.find((p) => p.id === s.selected)?.name ?? "Your AI",
          shared: s.profiles.filter((p) => p.memory.shared).map((p) => p.name),
        }),
      )
      .catch(() => {});
  }, []);
  const [strategy, setStrategy] = useState("Indexed keywords and categories");
  useEffect(() => {
    void core<{ strategy: string }>("ai.memorySearchInfo")
      .then((r) => setStrategy(r.strategy))
      .catch(() => {});
  }, []);
  const [rows, setRows] = useState<Row[]>([]),
    [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [status, setStatus] = useState("active"),
    [review, setReview] = useState(false),
    [text, setText] = useState(""),
    [scope, setScope] = useState("user"),
    [shared, setShared] = useState(false),
    [entryType, setEntryType] = useState<MemoryType>("fact"),
    [edit, setEdit] = useState<Row>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [exportText, setExportText] = useState(""),
    [exportTypes, setExportTypes] = useState<MemoryType[]>(["preference", "project", "decision"]),
    [exportShared, setExportShared] = useState(false);
  const load = () =>
    core<Row[]>(review ? "ai.memoryReview" : "ai.memoryRecords", review ? {} : { query }).then(setRows);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void core<Row[]>(review ? "ai.memoryReview" : "ai.memoryRecords", review ? {} : { query })
      .then((r) => {
        if (active) setRows(r);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, review]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const visible = rows.filter(
    (r) =>
      (type === "all" || r.type === type) &&
      (status === "all" || (status === "pinned" ? r.importance === "pinned" : r.status === status)) &&
      (!review || r.reviewReasons?.length) &&
      r.content.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <h1>Memory</h1>
      <p>{identity.name} remembers the things you choose to keep. Stored locally; no cloud sync.</p>
      <MemorySuggestions revision={String(rows.length)} />
      <div className="actions">
        <label>
          Search memory
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          Memory type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Memory status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="superseded">Superseded</option>
            <option value="pinned">Pinned</option>
            <option value="all">All history</option>
          </select>
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={review}
          onChange={(e) => {
            setReview(e.target.checked);
            setStatus("all");
          }}
        />
        Memory Review · outdated, expired, superseded or never used
      </label>
      <p className="muted">{strategy}. Memory-page text filtering uses keywords.</p>
      <details className="card">
        <summary>Add a memory</summary>
        <label>
          Memory note
          <textarea maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label>
          Type
          <select value={entryType} onChange={(e) => setEntryType(e.target.value as MemoryType)}>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Memory scope
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="user">Private AI memory</option>
            <option value="project">Current project memory</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Share with every AI that has Shared Memory enabled
        </label>
        <Button
          disabled={busy || !text.trim()}
          onClick={() =>
            void run(async () => {
              await core("ai.memoryCreate", { candidate: { type: entryType, content: text, scope }, shared });
              setText("");
            })
          }
        >
          Remember
        </Button>
      </details>
      {error && <ErrorNotice details={error} />} {(loading || busy) && <LoadingState label="Loading memory…" />}
      {!loading && !visible.length && <p className="memory-empty">No matching memories.</p>}
      {visible.map((row, index) => (
        <section key={row.id}>
          {(index === 0 ||
            new Date(visible[index - 1].updated).toDateString() !== new Date(row.updated).toDateString()) && (
            <h2>{new Date(row.updated).toLocaleDateString()}</h2>
          )}
          <article className="card memory-entry">
            <div className="memory-entry-type">
              <Icon name={row.type === "project" ? "folder" : row.type === "task" ? "check" : "memory"} size={16} />
              <span>{row.type}</span>
              <span className="pill">{row.status}</span>
            </div>
            <p className="memory-entry-content">{row.content}</p>
            <p className="muted">
              {row.type} · {row.scope === "user" ? "AI" : row.scope} {row.project.split(/[\\/]/).pop()} ·{" "}
              {row.owner === "shared" ? "Shared with: " + identity.shared.join(", ") : "Private"} · {row.status} ·{" "}
              {row.importance}
            </p>
            {row.type === "task" && <p>Task: {row.task_status}</p>}
            {row.valid_until && <p>Valid until {new Date(row.valid_until).toLocaleString()}</p>}
            <details>
              <summary>Why remembered?</summary>
              <p>{row.reason}</p>
              <p>
                Source: {row.source} · Saved {new Date(row.at).toLocaleString()}
              </p>
              <p>
                Conversation:{" "}
                {row.source_title ||
                  (row.source_conversation ? "Original conversation unavailable" : "Manual entry / legacy memory")}
              </p>
              <p>
                Used {row.use_count} times
                {row.last_used ? " · Last used " + new Date(row.last_used).toLocaleString() : ""}
              </p>
              {row.supersedes && <p>Replaces an earlier memory.</p>}
              {row.superseded_by && <p>A newer memory replaces this one.</p>}
            </details>
            {row.reviewReasons?.length ? <p>{row.reviewReasons.join(" · ")}</p> : null}
            <div className="actions">
              <Button disabled={busy} onClick={() => setEdit({ ...row })}>
                Edit
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    core("ai.memoryEdit", {
                      id: row.id,
                      importance: row.importance === "pinned" ? "normal" : "pinned",
                    }),
                  )
                }
              >
                {row.importance === "pinned" ? "Unpin" : "Pin"}
              </Button>
              {row.type === "task" && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      core("ai.memoryEdit", { id: row.id, taskStatus: row.task_status === "open" ? "done" : "open" }),
                    )
                  }
                >
                  {row.task_status === "open" ? "Mark done" : "Reopen"}
                </Button>
              )}
              <Button
                disabled={busy}
                onClick={() => {
                  if (
                    (row.owner === "shared" || row.scope === "project" || row.importance === "pinned") &&
                    !confirm("Forget this " + row.scope + " memory? It will no longer be retrieved.")
                  )
                    return;
                  void run(() => core("ai.memoryDelete", { id: row.id }));
                }}
              >
                Forget
              </Button>
            </div>
          </article>
        </section>
      ))}
      <details className="card">
        <summary>Export memory / backup</summary>
        <p>Separate from AI profile export. Review before sharing. Conversation snippets are excluded.</p>
        {types.map((t) => (
          <label className="check" key={t}>
            <input
              type="checkbox"
              checked={exportTypes.includes(t)}
              onChange={(e) =>
                setExportTypes(e.target.checked ? [...exportTypes, t] : exportTypes.filter((x) => x !== t))
              }
            />
            {t}
          </label>
        ))}
        <label className="check">
          <input type="checkbox" checked={exportShared} onChange={(e) => setExportShared(e.target.checked)} />
          Include shared memories
        </label>
        <Button
          onClick={() =>
            void run(async () =>
              setExportText(
                JSON.stringify(await core("ai.memoryExport", { types: exportTypes, shared: exportShared }), null, 2),
              ),
            )
          }
        >
          Prepare export
        </Button>
        {exportText && (
          <>
            <textarea aria-label="Memory export" readOnly value={exportText} />
            <a
              download="orbit-memory.json"
              href={"data:application/json;charset=utf-8," + encodeURIComponent(exportText)}
            >
              Save memory backup
            </a>
          </>
        )}
      </details>
      {edit && (
        <Modal title="Edit memory">
          <label>
            Content
            <textarea
              maxLength={2000}
              value={edit.content}
              onChange={(e) => setEdit({ ...edit, content: e.target.value })}
            />
          </label>
          <label>
            Type
            <select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as MemoryType })}>
              {types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {edit.type === "task" && (
            <label>
              Task status
              <select value={edit.task_status} onChange={(e) => setEdit({ ...edit, task_status: e.target.value })}>
                <option value="open">Open</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          )}
          <div className="actions">
            <Button onClick={() => setEdit(undefined)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await core("ai.memoryEdit", {
                    id: edit.id,
                    content: edit.content,
                    type: edit.type,
                    ...(edit.type === "task" ? { taskStatus: edit.task_status } : {}),
                  });
                  setEdit(undefined);
                })
              }
            >
              Save memory
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
