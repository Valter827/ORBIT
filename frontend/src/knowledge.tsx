import { SpaceManager, type Space } from "./knowledge-spaces";
import { useState, useEffect } from "react";
import { core, native, errorText } from "./api";
import { Button, Modal, EmptyState, LoadingState } from "./components";
type Source = {
  id: string;
  name: string;
  kind: string;
  bytes: number;
  updated: number;
  status: string;
  warning: string;
  chunkCount: number;
  sourcePath: string;
  profile: string;
  spaces: string;
};
type Job = {
  running: boolean;
  processed: number;
  indexed: number;
  unchanged: number;
  skipped: number;
  errors: string[];
};
export function KnowledgePanel({
  profileId,
  beforeAdd,
  onCount,
}: {
  profileId: string;
  beforeAdd?: () => Promise<void>;
  onCount?: (count: number) => void;
}) {
  const [jobs, setJobs] = useState<Array<{ id: string; state: string; updated: number }>>([]);
  const [spaces, setSpaces] = useState<Space[]>([]),
    [selectedSpaces, setSelectedSpaces] = useState<string[]>([]),
    [filterSpace, setFilterSpace] = useState(""),
    [filterType, setFilterType] = useState(""),
    [since, setSince] = useState("");
  const [sources, setSources] = useState<Source[]>([]),
    [job, setJob] = useState<Job | null>(null),
    [query, setQuery] = useState(""),
    [hits, setHits] = useState<
      Array<{
        name: string;
        text: string;
        sourceId: string;
        section?: string;
        symbol?: string;
        lineStart?: number;
        lineEnd?: number;
        page?: number | null;
      }>
    >([]),
    [preview, setPreview] = useState<{
      name: string;
      chunks: Array<{
        text: string;
        section?: string;
        symbol?: string;
        lineStart?: number;
        lineEnd?: number;
        page?: number | null;
      }>;
    }>(),
    [note, setNote] = useState(""),
    [name, setName] = useState("My notes"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setJobs(await core<typeof jobs>("ai.knowledgeJobs", { profileId }));
    setSpaces(await core<Space[]>("ai.knowledgeSpaces", { profileId }));
    await core<Source[]>("ai.knowledgeList", { profileId }).then((items) => {
      setSources(items);
      onCount?.(items.length);
    });
  };
  useEffect(() => {
    setSelectedSpaces([]);
    setFilterSpace("");
    setHits([]);
    setPreview(undefined);
    void load()
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
    let active = true,
      previous = "";
    const timer = setInterval(
      () =>
        void core<Job | null>("ai.knowledgeStatus")
          .then((j) => {
            if (!active) return;
            setJob(j);
            const signature = JSON.stringify(j);
            if (signature !== previous) {
              previous = signature;
              void load()
                .catch((e) => setError(errorText(e)))
                .finally(() => setLoading(false));
            }
          })
          .catch((e) => {
            if (active) setError(errorText(e));
          }),
      700,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [profileId]);
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="knowledge-panel">
      <h2>Knowledge</h2>
      <SpaceManager
        profileId={profileId}
        spaces={spaces}
        selected={selectedSpaces}
        onSelected={setSelectedSpaces}
        onChanged={load}
      />
      {(loading || busy) && <LoadingState label={loading ? "Loading knowledge…" : "Updating knowledge…"} />}
      <p className="muted">
        Add the things your AI should know. ORBIT retrieves relevant passages for each question. Keyword search works
        locally; semantic search needs a configured local embedding model.
      </p>
      <div className="actions">
        <Button
          disabled={busy || job?.running}
          onClick={() =>
            void run(async () => {
              await beforeAdd?.();
              await native("add_knowledge", { profileId, folder: false, spaces: selectedSpaces });
            })
          }
        >
          Add files
        </Button>
        <Button
          disabled={busy || job?.running}
          onClick={() =>
            void run(async () => {
              await beforeAdd?.();
              await native("add_knowledge", { profileId, folder: true, spaces: selectedSpaces });
            })
          }
        >
          Add folder / project
        </Button>
      </div>
      <p className="muted">
        Supported: UTF-8 text, Markdown, CSV, code, PDF text and DOCX. Scanned PDF OCR is not supported. Secret files,
        binaries and generated folders are excluded. Originals are never changed.
      </p>
      {job && (
        <p role="status">
          {job.running ? "Indexing…" : "Indexing finished"} · {job.processed} processed · {job.indexed} indexed ·{" "}
          {job.unchanged} unchanged · {job.skipped} skipped{" "}
          {job.running && <Button onClick={() => void core("ai.knowledgeCancel")}>Cancel indexing</Button>}
        </p>
      )}
      {jobs
        .filter((j) => ["Paused", "Failed"].includes(j.state))
        .map((j) => (
          <p key={j.id}>
            {j.state} indexing · {new Date(j.updated).toLocaleString()}{" "}
            <Button
              disabled={busy || job?.running}
              onClick={() => void run(() => core("ai.knowledgeResume", { profileId, id: j.id }))}
            >
              Resume indexing
            </Button>
          </p>
        ))}
      {!!job?.errors.length && (
        <details>
          <summary>{job.errors.length} indexing messages</summary>
          {job.errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </details>
      )}
      <details>
        <summary>Add manual knowledge</summary>
        <label>
          Source name
          <input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Knowledge text
          <textarea value={note} maxLength={50000} onChange={(e) => setNote(e.target.value)} />
        </label>
        <Button
          disabled={busy || !note.trim() || !name.trim()}
          onClick={() =>
            void run(async () => {
              await beforeAdd?.();
              await core("ai.knowledgeNote", { profileId, name, text: note, spaces: selectedSpaces });
              setNote("");
            })
          }
        >
          Save knowledge note
        </Button>
      </details>
      <div className="builder-grid">
        <label>
          Space
          <select value={filterSpace} onChange={(e) => setFilterSpace(e.target.value)}>
            <option value="">All accessible spaces</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          File type
          <input placeholder="md, ts, pdf…" value={filterType} onChange={(e) => setFilterType(e.target.value)} />
        </label>
        <label>
          Indexed since
          <input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
        </label>
      </div>
      <label>
        Search knowledge
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <Button
        disabled={!query.trim()}
        onClick={() =>
          void run(async () => {
            const result = await core<{ sources: typeof hits }>("ai.knowledgeSearch", {
              profileId,
              query,
              ...(filterSpace ? { space: filterSpace } : {}),
              ...(filterType ? { type: filterType } : {}),
              ...(since ? { since: new Date(since).getTime() } : {}),
            });
            setHits(result.sources);
          })
        }
      >
        Search passages
      </Button>
      {hits.map((h, i) => (
        <article className="card" key={i}>
          <strong>{h.name}</strong>
          <p className="muted">
            {[
              h.section,
              h.symbol,
              h.page ? "Page " + h.page : "",
              h.lineStart ? "Lines " + h.lineStart + "–" + h.lineEnd : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p>{h.text}</p>
          <Button onClick={() => setPreview({ name: h.name, chunks: [h] })}>Preview retrieved passage</Button>
        </article>
      ))}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {!loading && !error && !sources.length && !busy && !job?.running && (
        <EmptyState title="Give your AI something to learn from">
          Add a file, folder or note. Relevant passages will be used when you ask questions.
        </EmptyState>
      )}
      <RetainedKnowledge profileId={profileId} onRecovered={() => void load()} />
      <div className="knowledge-list">
        {sources
          .filter(
            (s) =>
              (!filterSpace || (JSON.parse(s.spaces) as string[]).includes(filterSpace)) &&
              (!filterType || s.name.toLowerCase().endsWith("." + filterType.toLowerCase())) &&
              (!since || s.updated >= new Date(since).getTime()),
          )
          .map((s) => (
            <article className="card" key={s.id}>
              <strong>{s.name}</strong>
              <p className="muted">
                {s.kind} · {s.bytes.toLocaleString()} bytes · {s.chunkCount} passages · {s.status} ·{" "}
                {new Date(s.updated).toLocaleString()}
              </p>
              {s.profile === profileId && (
                <details>
                  <summary>Document spaces</summary>
                  {spaces
                    .filter((space) => space.owner === profileId)
                    .map((space) => (
                      <label key={space.id}>
                        <input
                          type="checkbox"
                          checked={(JSON.parse(s.spaces) as string[]).includes(space.id)}
                          disabled={busy || job?.running}
                          onChange={(e) =>
                            void run(() =>
                              core("ai.knowledgeSpaceAssign", {
                                profileId,
                                id: s.id,
                                spaces: e.target.checked
                                  ? [...(JSON.parse(s.spaces) as string[]), space.id]
                                  : (JSON.parse(s.spaces) as string[]).filter((id) => id !== space.id),
                              }),
                            )
                          }
                        />
                        {space.name}
                      </label>
                    ))}
                </details>
              )}
              {s.warning && <p className="notice">{s.warning}</p>}
              <div className="actions">
                <Button
                  onClick={() =>
                    void run(async () => setPreview(await core("ai.knowledgePreview", { profileId, id: s.id })))
                  }
                >
                  Open passages
                </Button>
                <Button
                  disabled={s.profile !== profileId || !s.sourcePath || job?.running}
                  onClick={() => void run(() => core("ai.knowledgeReindex", { profileId, id: s.id }))}
                >
                  Re-index
                </Button>
                <Button
                  disabled={s.profile !== profileId || job?.running}
                  onClick={() => void run(() => core("ai.knowledgeRemove", { profileId, id: s.id }))}
                >
                  Remove from AI
                </Button>
              </div>
            </article>
          ))}
      </div>
      {preview && (
        <Modal title={preview.name}>
          <div className="wizard-body">
            {preview.chunks.map((c, i) => (
              <pre className="source-preview" key={i}>
                {[
                  c.section,
                  c.symbol,
                  c.page ? "Page " + c.page : "",
                  c.lineStart ? "Lines " + c.lineStart + "–" + c.lineEnd : "",
                ]
                  .filter(Boolean)
                  .join(" · ") +
                  "\n\n" +
                  c.text}
              </pre>
            ))}
          </div>
          <Button onClick={() => setPreview(undefined)}>Close</Button>
        </Modal>
      )}
    </section>
  );
}
export function KnowledgeSettings() {
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:11434/v1/"),
    [model, setModel] = useState(""),
    [files, setFiles] = useState(100),
    [fileBytes, setFileBytes] = useState(500000),
    [totalBytes, setTotalBytes] = useState(5000000),
    [chunks, setChunks] = useState(2000),
    [exclude, setExclude] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    void core<{
      limits: { files?: number; fileBytes?: number; totalBytes?: number; chunks?: number; exclude?: string[] };
      embedding: { endpoint: string; model: string } | null;
    }>("ai.knowledgeSettingsGet")
      .then((s) => {
        setFiles(s.limits.files ?? 100);
        setFileBytes(s.limits.fileBytes ?? 500000);
        setTotalBytes(s.limits.totalBytes ?? 5000000);
        setChunks(s.limits.chunks ?? 2000);
        setExclude(s.limits.exclude?.join("\n") ?? "");
        if (s.embedding) {
          setEndpoint(s.embedding.endpoint);
          setModel(s.embedding.model);
        }
      })
      .catch((e) => setError(errorText(e)));
  }, []);
  return (
    <details>
      <summary>Advanced knowledge settings</summary>
      <p className="muted">
        Optional local embeddings use a real local /embeddings endpoint. No model is downloaded. Re-index existing
        sources after changing the embedding model. If unavailable, ORBIT labels the fallback as keyword search.
      </p>
      <label>
        Local embedding endpoint
        <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
      </label>
      <label>
        Embedding model (blank = keyword search)
        <input value={model} onChange={(e) => setModel(e.target.value)} />
      </label>
      <div className="builder-grid">
        {[
          ["Files per import", files, setFiles],
          ["Bytes per file", fileBytes, setFileBytes],
          ["Total bytes per import", totalBytes, setTotalBytes],
          ["Chunks per AI", chunks, setChunks],
        ].map(([label, value, setter]) => (
          <label key={String(label)}>
            {String(label)}
            <input
              type="number"
              value={Number(value)}
              onChange={(e) => (setter as (v: number) => void)(Number(e.target.value))}
            />
          </label>
        ))}
      </div>
      <label>
        Extra excluded paths / patterns, one per line
        <textarea value={exclude} onChange={(e) => setExclude(e.target.value)} />
      </label>
      <p className="muted">
        Safety exclusions always apply. Root .gitignore exclusion rules are applied conservatively; negated exceptions
        do not override exclusions.
      </p>
      <Button
        onClick={() =>
          void core("ai.knowledgeSettings", {
            limits: { files, fileBytes, totalBytes, chunks, exclude: exclude.split("\n").filter(Boolean) },
            embedding: model.trim() ? { endpoint, model } : null,
          })
            .then(() => setError("Knowledge settings saved."))
            .catch((e) => setError(errorText(e)))
        }
      >
        Save knowledge settings
      </Button>
      {error && <p role="status">{error}</p>}
    </details>
  );
}

export function RetainedKnowledge({ profileId, onRecovered }: { profileId: string; onRecovered: () => void }) {
  const [rows, setRows] = useState<Array<{ id: string; name: string; bytes: number }>>([]),
    [error, setError] = useState("");
  useEffect(() => {
    void core<typeof rows>("ai.knowledgeRetained")
      .then(setRows)
      .catch((e) => setError(errorText(e)));
  }, [profileId]);
  if (!rows.length && !error) return null;
  return (
    <section className="card">
      <h3>Knowledge kept from deleted AIs</h3>
      <p className="muted">These local copies are not used by any AI. Attach a source explicitly to use it again.</p>
      {rows.map((r) => (
        <div className="actions" key={r.id}>
          <span>
            {r.name} · {r.bytes.toLocaleString()} bytes
          </span>
          <Button
            onClick={() =>
              void core("ai.knowledgeRecover", { profileId, id: r.id })
                .then(() => {
                  setRows((prev) => prev.filter((v) => v.id !== r.id));
                  onRecovered();
                })
                .catch((e) => setError(errorText(e)))
            }
          >
            Attach to this AI
          </Button>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
