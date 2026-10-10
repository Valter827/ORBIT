import { profileStatus } from "./ai-types";
import { useState, useEffect } from "react";
import { core, native, errorText } from "./api";
import { Button, Modal, Icon, EmptyState, LoadingState, ErrorNotice } from "./components";
import { defaultProfile, type Profile, type AIState } from "./ai-types";
import { AIWizard } from "./wizard";
export { MemoryPanel } from "./memory";
export function AIStudio({
  refresh,
  create = false,
  onChat,
  onSetup,
}: {
  refresh: () => Promise<void>;
  create?: boolean;
  onChat?: () => void;
  onSetup?: () => void;
}) {
  const [state, setState] = useState<AIState>(),
    [draft, setDraft] = useState<Profile>(),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<{ profile: Profile; knowledge: Array<{ name: string; text?: string }> }>(),
    [importText, setImportText] = useState(""),
    [duplicate, setDuplicate] = useState<Profile>(),
    [copyKnowledge, setCopyKnowledge] = useState(false),
    [copyMemory, setCopyMemory] = useState(false),
    [deleting, setDeleting] = useState<Profile>(),
    [deleteKnowledge, setDeleteKnowledge] = useState(true),
    [exporting, setExporting] = useState<Profile>(),
    [includeKnowledge, setIncludeKnowledge] = useState(false),
    [versions, setVersions] = useState<{ profile: Profile; entries: Array<{ id: number; at: number }> }>();
  const load = () => core<AIState>("ai.state").then(setState);
  useEffect(() => {
    void load().catch((e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    if (create) setDraft(defaultProfile());
  }, [create]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const open = (p: Profile) =>
    void run(async () => {
      await core("ai.select", { id: p.id });
      onChat?.();
    });
  return (
    <div className="ai-studio">
      <div className="hero">
        <small>YOUR AI. YOUR RULES.</small>
        <h1>Build your own AI</h1>
        <p>Create, teach and run a personal assistant. No coding required.</p>
      </div>
      <div className="section-head">
        <h2>My AIs</h2>
        <Button onClick={() => setDraft(defaultProfile())}>+ Create My AI</Button>
        <label className="import-button">
          Import AI
          <input
            type="file"
            accept=".orbit-ai,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void run(async () => {
                  if (file.size > 750000) throw new Error("Package exceeds 750 KB.");
                  const text = await file.text();
                  setImportText(text);
                  setPreview(await core("ai.packagePreview", { text }));
                });
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <label>
        Search My AIs
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, purpose or model" />
      </label>
      {error && <ErrorNotice details={error} retry={() => void run(load)} />}{" "}
      {!state && !error && <LoadingState label="Loading your AIs…" />}
      {state &&
        !state.profiles.some((p) =>
          (p.name + " " + p.description + " " + p.modelId + " " + p.purposes.join(" "))
            .toLowerCase()
            .includes(query.toLowerCase()),
        ) && <EmptyState title="No AIs found">Try a different search or create your own AI.</EmptyState>}
      <div className="project-grid">
        {state?.profiles
          .filter((p) =>
            (p.name + " " + p.description + " " + p.modelId + " " + p.purposes.join(" "))
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((p) => {
            const provider = state.providers.find((v) => v.id === p.providerId);
            const status = profileStatus(state, p.id);
            return (
              <section className="card ai-card" key={p.id}>
                <div className={p.builtin ? "ai-icon cosmo-avatar" : "ai-icon"}>
                  <Icon name={p.icon} size={28} />
                </div>
                <h2>{p.builtin ? "COSMO 1.0" : p.name}</h2>
                <p>{p.description}</p>
                <p className="muted">{p.purposes.join(" · ") || "Custom assistant"}</p>
                <p>
                  {provider?.name ?? p.providerId} · {p.modelId || "No model selected"}
                </p>
                <span className="pill">{status}</span>
                {p.senseEnabled && <span className="pill">Sense capable · sharing off</span>}
                <p className="muted">
                  {state.knowledgeCounts?.[p.id] ?? 0} knowledge sources ·{" "}
                  {p.capabilities.filter((c) => p.permissionPolicy[c] !== "disabled").length} tools ·{" "}
                  {p.workflows.length} workflows
                </p>
                <div className="actions">
                  {p.builtin && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await core("ai.select", { id: p.id });
                          onSetup?.();
                        })
                      }
                    >
                      Set Up / Brain
                    </Button>
                  )}
                  <Button disabled={busy} onClick={() => open(p)}>
                    Open / Chat
                  </Button>
                  <details className="card-menu">
                    <summary aria-label={"More actions for " + p.name}>More actions</summary>
                    <div>
                      <Button onClick={() => setDraft(p)}>Edit</Button>
                      <Button
                        onClick={() => {
                          setCopyKnowledge(false);
                          setCopyMemory(false);
                          setDuplicate(p);
                        }}
                      >
                        Duplicate
                      </Button>
                      <Button
                        onClick={() => {
                          setIncludeKnowledge(false);
                          setExporting(p);
                        }}
                      >
                        Export
                      </Button>
                      <Button
                        onClick={() =>
                          void run(async () =>
                            setVersions({ profile: p, entries: await core("ai.versions", { id: p.id }) }),
                          )
                        }
                      >
                        History
                      </Button>
                      <Button
                        disabled={state.profiles.length === 1 || !!p.builtin}
                        onClick={() => {
                          setDeleteKnowledge(true);
                          setDeleting(p);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </details>
                </div>
              </section>
            );
          })}
      </div>
      {draft && state && (
        <AIWizard
          initial={draft}
          state={state}
          onClose={() => {
            setDraft(undefined);
            void load();
          }}
          onSaved={async (p) => {
            await core("ai.select", { id: p.id });
            setDraft(undefined);
            await load();
            await refresh();
            onChat?.();
          }}
        />
      )}
      {duplicate && (
        <Modal title={"Duplicate " + duplicate.name}>
          <p>Configuration, instructions, skills and workflows will be copied.</p>
          <label className="check">
            <input type="checkbox" checked={copyKnowledge} onChange={(e) => setCopyKnowledge(e.target.checked)} />
            Copy knowledge snapshots
          </label>
          <label className="check">
            <input type="checkbox" checked={copyMemory} onChange={(e) => setCopyMemory(e.target.checked)} />
            Copy private memory for the current project and AI
          </label>
          <div className="actions">
            <Button onClick={() => setDuplicate(undefined)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await core("ai.duplicate", { id: duplicate.id, copyKnowledge, copyMemory });
                  setDuplicate(undefined);
                })
              }
            >
              Duplicate AI
            </Button>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal title={"Delete " + deleting.name + "?"}>
          <p>
            This deletes the profile, its private memory, conversation history, skills, workflows and configuration
            history. Shared memory and original files are kept.
          </p>
          <label className="check">
            <input type="checkbox" checked={deleteKnowledge} onChange={(e) => setDeleteKnowledge(e.target.checked)} />
            Delete indexed knowledge copies
          </label>
          {!deleteKnowledge && (
            <p className="muted">
              Indexed copies remain in Knowledge, where you can explicitly attach them to another AI.
            </p>
          )}
          <div className="actions">
            <Button onClick={() => setDeleting(undefined)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await core("ai.delete", { id: deleting.id, deleteKnowledge });
                  setDeleting(undefined);
                })
              }
            >
              Delete AI
            </Button>
          </div>
        </Modal>
      )}
      {exporting && (
        <Modal title={"Export " + exporting.name}>
          <p>
            Includes identity, personality, instructions, skills, workflows, tool preferences and a knowledge manifest.
            Credentials and memory are excluded.
          </p>
          <label className="check">
            <input type="checkbox" checked={includeKnowledge} onChange={(e) => setIncludeKnowledge(e.target.checked)} />
            Include portable knowledge text (up to 750 KB total)
          </label>
          <div className="actions">
            <Button onClick={() => setExporting(undefined)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await native("export_ai", { id: exporting.id, includeKnowledge });
                  setExporting(undefined);
                })
              }
            >
              Save .orbit-ai
            </Button>
          </div>
        </Modal>
      )}
      {preview && (
        <Modal title="Review imported AI">
          <h3>{preview.profile.name}</h3>
          <p>
            Brain: {preview.profile.providerId} · {preview.profile.modelId}
          </p>
          <p>
            Knowledge: {preview.knowledge.length} sources,{" "}
            {preview.knowledge.filter((k) => k.text !== undefined).length} with portable content
          </p>
          <p>Requested tools: {preview.profile.capabilities.join(", ")}</p>
          <pre>{JSON.stringify(preview.profile.permissionPolicy, null, 2)}</pre>
          <p className="notice">
            Permissions will be reset to Ask or Disabled. Shared memory stays off. Credentials are never imported.
          </p>
          <div className="actions">
            <Button onClick={() => setPreview(undefined)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await core("ai.import", { text: importText, confirmed: true });
                  setPreview(undefined);
                })
              }
            >
              Import reviewed AI
            </Button>
          </div>
        </Modal>
      )}
      {versions && (
        <Modal title={"Configuration history · " + versions.profile.name}>
          <p>Restore a previous configuration. Knowledge, memory and credentials are unchanged.</p>
          {versions.entries.map((v) => (
            <div className="actions" key={v.id}>
              <span>{new Date(v.at).toLocaleString()}</span>
              <Button
                onClick={() =>
                  void run(async () => {
                    await core("ai.restore", { id: versions.profile.id, version: v.id });
                    setVersions(undefined);
                  })
                }
              >
                Restore version
              </Button>
            </div>
          ))}
          {!versions.entries.length && <p>No previous versions yet.</p>}
          <Button onClick={() => setVersions(undefined)}>Close</Button>
        </Modal>
      )}
    </div>
  );
}
