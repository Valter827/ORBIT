import { useCallback, useEffect, useState } from "react";
import { core, errorText } from "./api";
import { Button, ErrorNotice, Icon } from "./components";
import { intelligenceDefaults, type AIState, type Intelligence } from "./ai-types";
import { brainOutcome } from "../../packages/core/src/ai/brain-outcomes";
import { comparableBrainResults } from "../../packages/core/src/ai/brain-comparison";
import { brainAliases, modelProvenance } from "../../packages/core/src/ai/brain-aliases";

type Runtime = {
  runtime: string;
  endpoint: string;
  state: string;
  detail: string;
  running: boolean;
  evidence: string;
  models: { id: string; sizeBytes?: number }[];
};
type Hardware = {
  cpu: string;
  cores: number;
  ramBytes: number;
  freeRamBytes: number;
  gpu: string | null;
  vramBytes: number | null;
  architecture: string;
};
type Result = {
  id: string;
  model: string;
  provider: string;
  at: string;
  suite: string;
  status: string;
  capabilities: Record<string, string>;
  configuration: { repetitions: number };
  hardware?: Hardware;
  metadata: Record<string, unknown>;
  cases: {
    name: string;
    category: string;
    passed: boolean;
    elapsedMs: number;
    ttftMs: number | null;
    tokensPerSecond: number | null;
    response: string;
    error?: string;
  }[];
};
type EvaluationState = { results: Result[]; progress: { current: string; completed: number; total: number } | null };
const roles = ["Fast", "Main", "Logic", "Code", "Vision", "Embedding"] as const;
const gb = (bytes: number | null | undefined) => (bytes == null ? "Unknown" : (bytes / 2 ** 30).toFixed(1) + " GB");
const stateLabel = (state: string) =>
  state
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (s) => s.toUpperCase());

export function ModelStudio({
  ai,
  refresh,
  onSetup,
}: {
  ai: AIState;
  refresh: () => Promise<void>;
  onSetup: () => void;
}) {
  const [runtimes, setRuntimes] = useState<Runtime[]>([]),
    [hardware, setHardware] = useState<Hardware>();
  const [evaluations, setEvaluations] = useState<EvaluationState>({ results: [], progress: null });
  const [estimates, setEstimates] = useState<
    Array<{ provider: string; model: string; status: string; estimatedBytes: number | null; note: string }>
  >([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState("");
  const [compare, setCompare] = useState<string[]>([]),
    [repetitions, setRepetitions] = useState(1);
  const profile = ai.profiles.find((p) => p.id === ai.selected);
  const models = ai.providers.flatMap((p) => p.models.map((m) => ({ ...m, provider: p.id, providerName: p.name })));
  const key = (model: { provider: string; model: string }) => JSON.stringify([model.provider, model.model]);
  const selectedModel = models.find((m) => key(m) === selected);
  const reconnect = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const runtime = await core<Runtime[]>("ai.runtimeStatus");
      setRuntimes(runtime);
      await Promise.all(
        ai.providers
          .filter((p) => p.type === "local" && p.localInferenceConfirmed)
          .map((p) => core("ai.models", { providerId: p.id, refresh: true }).catch(() => undefined)),
      );
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, [ai.providers, refresh]);
  useEffect(() => {
    void core<Runtime[]>("ai.runtimeStatus")
      .then(setRuntimes)
      .catch((e) => setError(errorText(e)));
    void core<{ hardware: Hardware; estimates: typeof estimates }>("ai.studioHardware")
      .then((v) => {
        setHardware(v.hardware);
        setEstimates(v.estimates);
      })
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    let active = true;
    const poll = () =>
      void core<EvaluationState>("ai.studioResults")
        .then((v) => {
          if (active) setEvaluations(v);
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function saveIntelligence(patch: Partial<Intelligence>) {
    if (!profile) return;
    setBusy(true);
    setError("");
    try {
      await core("ai.saveProfile", {
        ...profile,
        intelligence: { ...intelligenceDefaults, ...profile.intelligence, ...patch },
      });
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function benchmark() {
    if (!selectedModel) return;
    setBusy(true);
    setError("");
    try {
      await core("ai.studioBenchmark", {
        providerId: selectedModel.provider,
        modelId: selectedModel.model,
        repetitions,
      });
      setEvaluations(await core<EvaluationState>("ai.studioResults"));
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const latest = evaluations.results.find(
    (r) => r.model === selectedModel?.model && r.provider === selectedModel?.provider,
  );
  const compared = evaluations.results.filter((r) => compare.includes(r.id));
  const roleNames = (m: { provider: string; model: string }) =>
    roles
      .filter(
        (role) =>
          profile?.intelligence?.roles?.[role]?.provider === m.provider &&
          profile.intelligence.roles[role]?.model === m.model,
      )
      .map((role) => brainAliases[role])
      .join(" · ");
  const sameSuite = comparableBrainResults(compared, models, hardware);
  return (
    <div className="model-studio">
      <header className="studio-heading">
        <div>
          <span className="eyebrow">COSMO 1.0 · INTELLIGENCE</span>
          <h1>Model Studio</h1>
          <p className="muted">One assistant. Choose the right brain for each task.</p>
        </div>
        <div className="actions">
          <Button disabled={busy} onClick={() => void reconnect()}>
            <Icon name="refresh" />
            Reconnect
          </Button>
          <Button onClick={onSetup}>
            <Icon name="download" />
            Add local model
          </Button>
        </div>
      </header>
      {error && <ErrorNotice details={error} />}
      <section className="panel brain-identity">
        <Icon name="memory" size={28} />
        <div>
          <h2>{profile?.name ?? "COSMO"} is your assistant</h2>
          <p>Models provide inference. Your chats, Memory, Knowledge and permissions belong to the assistant.</p>
        </div>
        <label>
          Brain selection
          <select
            disabled={busy}
            value={profile?.intelligence?.manualRole ?? (profile?.intelligence?.auto ? "auto" : "manual")}
            onChange={(e) =>
              void saveIntelligence({
                auto: e.target.value !== "manual",
                manualRole: roles.filter((r) => r !== "Embedding").find((r) => r === e.target.value),
              })
            }
          >
            <option value="auto">Auto · recommended</option>
            <option value="manual">Manual · keep my selected model</option>
            {roles
              .filter((r) => r !== "Embedding")
              .map((role) => (
                <option key={role} value={role} disabled={!profile?.intelligence?.roles?.[role]}>
                  {brainAliases[role]}
                </option>
              ))}
          </select>
        </label>
        <p className="muted">
          {ai.localOnly
            ? "Local Only · cloud inference blocked"
            : "Cloud use follows your provider and profile permissions"}
        </p>
      </section>
      <div className="runtime-grid">
        {runtimes.map((runtime) => (
          <section className="panel" key={runtime.endpoint}>
            <div className="studio-heading">
              <h3>{runtime.runtime}</h3>
              <span className={runtime.running ? "badge" : "muted"}>{stateLabel(runtime.state)}</span>
            </div>
            <p>{runtime.detail}</p>
            <small>{runtime.endpoint}</small>
            <p className="muted">
              {runtime.models.length} models · Evidence: {runtime.evidence}
            </p>
          </section>
        ))}
      </div>
      <section className="panel">
        <h2>Your hardware</h2>
        {hardware ? (
          <>
            <div className="hardware-grid">
              <div>
                <small>CPU</small>
                <p>{hardware.cpu}</p>
              </div>
              <div>
                <small>Memory</small>
                <p>
                  {gb(hardware.ramBytes)} · {gb(hardware.freeRamBytes)} available
                </p>
              </div>
              <div>
                <small>GPU</small>
                <p>{hardware.gpu ?? "Unknown"}</p>
              </div>
              <div>
                <small>VRAM / architecture</small>
                <p>
                  {gb(hardware.vramBytes)} / {hardware.architecture}
                </p>
              </div>
            </div>
            <p className="muted">
              Detected locally. Memory fit is an estimate; runtime allocation and context length affect actual use.
            </p>
          </>
        ) : (
          <p>Detecting local hardware…</p>
        )}
      </section>
      <section className="panel">
        <h2>Brain roles</h2>
        <Button
          disabled={busy || !profile}
          onClick={() => {
            if (!profile) return;
            setBusy(true);
            setError("");
            void core("ai.applyEvaluatedRoles", { profileId: profile.id })
              .then(refresh)
              .catch((e) => setError(errorText(e)))
              .finally(() => setBusy(false));
          }}
        >
          Apply measured 0.10.1 roles
        </Button>
        <p className="muted">
          Uses completed release measurements only when hardware, runtime and all installed model digests match. Exact
          identities remain in Advanced Details.
        </p>
        <div className="role-grid">
          {roles.map((role) => (
            <article key={role}>
              <h3>{brainAliases[role]}</h3>
              <p>
                {profile?.intelligence?.roles?.[role]
                  ? "Assigned · capability checks apply"
                  : "Unassigned · no measured winner selected"}
              </p>
            </article>
          ))}
        </div>
        <details>
          <summary>Advanced role assignments · exact models</summary>
          <p className="muted">
            Assignments are preferences. Capability and privacy checks still apply. Embedding models never answer chats.
            Assigning Embedding updates the shared local search backend; existing indexes keep their recorded embedding
            identity.
          </p>
          <div className="role-grid">
            {roles.map((role) => (
              <label key={role}>
                {brainAliases[role]}
                <select
                  disabled={busy}
                  value={profile?.intelligence?.roles?.[role] ? key(profile.intelligence.roles[role]) : ""}
                  onChange={(e) => {
                    const assignments = { ...profile?.intelligence?.roles };
                    const found = models.find((m) => key(m) === e.target.value);
                    if (found) assignments[role] = { provider: found.provider, model: found.model };
                    else delete assignments[role];
                    void saveIntelligence({ roles: assignments });
                  }}
                >
                  <option value="">Auto / unassigned</option>
                  {models
                    .filter((m) =>
                      role === "Embedding"
                        ? (m.metadata?.["declaredCapabilities"] as string[] | undefined)?.includes("embedding")
                        : m.capabilities?.text !== false,
                    )
                    .map((m) => (
                      <option key={key(m)} value={key(m)}>
                        {m.model}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        </details>
      </section>
      <section className="panel">
        <details>
          <summary>Advanced local generation settings</summary>
          <p className="muted">
            Temperature and top-p apply to local chat generation. Benchmarks keep their fixed settings. Context is an
            application budget, not a claim about runtime maximum.
          </p>
          <div className="role-grid">
            <label>
              Temperature
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                placeholder="Runtime default"
                value={profile?.intelligence?.generation?.temperature ?? ""}
                disabled={busy}
                onChange={(e) => {
                  const generation = { ...profile?.intelligence?.generation };
                  if (e.target.value === "") delete generation.temperature;
                  else generation.temperature = Number(e.target.value);
                  void saveIntelligence({ generation });
                }}
              />
            </label>
            <label>
              Top-p
              <input
                type="number"
                min="0.01"
                max="1"
                step="0.05"
                placeholder="Runtime default"
                value={profile?.intelligence?.generation?.topP ?? ""}
                disabled={busy}
                onChange={(e) => {
                  const generation = { ...profile?.intelligence?.generation };
                  if (e.target.value === "") delete generation.topP;
                  else generation.topP = Number(e.target.value);
                  void saveIntelligence({ generation });
                }}
              />
            </label>
            <label>
              Context budget
              <select
                value={profile?.intelligence?.contextBudget ?? 4096}
                disabled={busy}
                onChange={(e) => void saveIntelligence({ contextBudget: Number(e.target.value) })}
              >
                {[2048, 4096, 8192, 16384, 32768].map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button disabled={busy} onClick={() => void saveIntelligence({ generation: {}, contextBudget: 4096 })}>
            Reset generation defaults
          </Button>
        </details>
      </section>
      <section className="panel">
        <h2>Installed models</h2>
        {!models.length && <p>No connected inventory yet. Reconnect or set up an existing local runtime.</p>}
        <div className="model-grid">
          {models.map((m, index) => (
            <button
              className="model-card"
              aria-pressed={selected === key(m)}
              key={key(m)}
              onClick={() => setSelected(key(m))}
            >
              <Icon name={m.capabilities?.text === false ? "book" : "memory"} />
              <strong>{roleNames(m) || `Unassigned candidate ${index + 1}`}</strong>
              <span>
                {m.providerName} · {m.local ? "Local" : "Cloud"}
              </span>
              <small>
                {m.contextWindow ? m.contextWindow.toLocaleString() + " context (metadata)" : "Context unknown"}
              </small>
              <small>
                {stateLabel(
                  estimates.find((e) => e.model === m.model && e.provider === m.provider)?.status ?? "UNKNOWN",
                )}{" "}
                · memory estimate
              </small>
              <small>
                {gb(typeof m.metadata?.["sizeBytes"] === "number" ? m.metadata["sizeBytes"] : null)} on disk
              </small>
            </button>
          ))}
        </div>
      </section>
      {selectedModel && (
        <section className="panel">
          <div className="studio-heading">
            <div>
              <span className="eyebrow">MODEL DETAILS</span>
              <h2>{roleNames(selectedModel) || "Unassigned brain candidate"}</h2>
            </div>
            <Button disabled={busy || !!evaluations.progress} onClick={() => void benchmark()}>
              Run real benchmark
            </Button>
          </div>
          <Button
            disabled={busy || selectedModel.capabilities?.text === false}
            onClick={() => {
              if (!profile) return;
              setBusy(true);
              void core("ai.saveProfile", {
                ...profile,
                providerId: selectedModel.provider,
                modelId: selectedModel.model,
                intelligence: { ...intelligenceDefaults, ...profile.intelligence, auto: false, manualRole: undefined },
              })
                .then(refresh)
                .catch((e) => setError(errorText(e)))
                .finally(() => setBusy(false));
            }}
          >
            Use for manual chat
          </Button>
          {selectedModel.metadata?.["runtime"] === "Ollama" && (
            <Button
              disabled={busy || !!evaluations.progress}
              onClick={() => {
                setBusy(true);
                setError("");
                void core("ai.studioUnload", { providerId: selectedModel.provider, modelId: selectedModel.model })
                  .then(() =>
                    dispatchEvent(
                      new CustomEvent("orbit-notice", { detail: "Model unloaded; it will load on the next request." }),
                    ),
                  )
                  .catch((e) => setError(errorText(e)))
                  .finally(() => setBusy(false));
              }}
            >
              Unload from memory
            </Button>
          )}
          <details>
            <summary>Advanced Details · underlying model and provenance</summary>
            <dl>
              {Object.entries(modelProvenance(selectedModel)).map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
              <dt>ORBIT role</dt>
              <dd>{roleNames(selectedModel) || "Unassigned"}</dd>
            </dl>
            <dl>
              {[
                "family",
                "parameter_size",
                "quantization_level",
                "runtimeVersion",
                "digest",
                "declaredCapabilities",
              ].map((name) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd style={{ overflowWrap: "anywhere" }}>
                    {selectedModel.metadata?.[name] == null ? "Unknown" : JSON.stringify(selectedModel.metadata[name])}
                  </dd>
                </div>
              ))}
            </dl>
            <p>
              Declared capabilities describe runtime metadata. Empirical results appear below after a real benchmark.
            </p>
          </details>
          <p>
            Uses synthetic prompts only. No chat history, personal memories or documents are sent. Runs locally for
            local models; configured cloud models use their approved provider.
          </p>
          <label>
            Repetitions
            <select value={repetitions} disabled={busy} onChange={(e) => setRepetitions(Number(e.target.value))}>
              <option value={1}>1 · baseline</option>
              <option value={2}>2 · repeated</option>
              <option value={3}>3 · repeated</option>
            </select>
          </label>
          <p className="muted">
            {estimates.find((e) => e.model === selectedModel.model && e.provider === selectedModel.provider)?.note}
          </p>
          <p className="muted">
            A benchmark measures these tests on this machine, not general intelligence. Unknown values are not scores.
          </p>
          {latest && (
            <>
              <h3>Latest run · {latest.status}</h3>
              <p>
                {new Date(latest.at).toLocaleString()} · {latest.suite}
              </p>
              <div className="capability-grid">
                {Object.entries(latest.capabilities).map(([name, state]) => (
                  <div key={name}>
                    <small>{name}</small>
                    <strong>{state}</strong>
                  </div>
                ))}
              </div>
              <p>
                {latest.cases.filter((c) => c.passed).length}/{latest.cases.length} deterministic checks passed
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Result</th>
                      <th>Total</th>
                      <th>First token</th>
                      <th>Tokens/s (end-to-end)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.cases.map((c, i) => (
                      <tr key={i}>
                        <td>
                          <details>
                            <summary>{c.name}</summary>
                            <pre>{c.error ?? c.response}</pre>
                          </details>
                        </td>
                        <td>{brainOutcome(c)}</td>
                        <td>{(c.elapsedMs / 1000).toFixed(2)} s</td>
                        <td>{c.ttftMs == null ? "Unknown" : Math.round(c.ttftMs) + " ms"}</td>
                        <td>{c.tokensPerSecond?.toFixed(1) ?? "Unknown"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {typeof latest.metadata["retrievalPipeline"] === "string" && (
                <p className="muted">{latest.metadata["retrievalPipeline"]}</p>
              )}
            </>
          )}
        </section>
      )}
      {evaluations.progress && (
        <section className="panel" aria-live="polite">
          <h2>Benchmark running</h2>
          <p>{evaluations.progress.current}</p>
          <progress value={evaluations.progress.completed} max={evaluations.progress.total} />
          <Button onClick={() => void core("ai.studioCancel").catch((e) => setError(errorText(e)))}>
            Stop benchmark
          </Button>
        </section>
      )}
      <section className="panel">
        <h2>Compare measured results</h2>
        <p>
          Select two to four completed runs with the same suite, settings and hardware. No downloaded or estimated score
          is used.
        </p>
        {evaluations.results
          .filter((r) => r.status === "COMPLETE")
          .map((r) => (
            <label className="check-row" key={r.id}>
              <input
                type="checkbox"
                checked={compare.includes(r.id)}
                disabled={!compare.includes(r.id) && compare.length >= 4}
                onChange={(e) =>
                  setCompare(e.target.checked ? [...compare, r.id] : compare.filter((id) => id !== r.id))
                }
              />
              {r.model} · {new Date(r.at).toLocaleString()}
            </label>
          ))}
        {compared.length >= 2 &&
          (sameSuite ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Checks passed</th>
                    <th>Mean response time</th>
                  </tr>
                </thead>
                <tbody>
                  {compared.map((r) => (
                    <tr key={r.id}>
                      <td>{r.model}</td>
                      <td>
                        {r.cases.filter((c) => c.passed).length}/{r.cases.length}
                      </td>
                      <td>{(r.cases.reduce((sum, c) => sum + c.elapsedMs, 0) / r.cases.length / 1000).toFixed(2)} s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table>
                <caption>Category results · exact models for technical comparison</caption>
                <thead>
                  <tr>
                    <th>Category</th>
                    {compared.map((r) => (
                      <th key={r.id}>{r.model}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(compared.flatMap((r) => r.cases.map((c) => c.category)))].map((category) => (
                    <tr key={category}>
                      <th>{category}</th>
                      {compared.map((r) => {
                        const cases = r.cases.filter((c) => c.category === category);
                        return (
                          <td key={r.id}>
                            {cases.length ? `${cases.filter((c) => c.passed).length}/${cases.length}` : "NOT TESTED"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p role="alert">
              Results are incomplete, outdated, or differ in tasks, settings, current model digests or hardware. They
              cannot be compared directly.
            </p>
          ))}
      </section>
    </div>
  );
}
