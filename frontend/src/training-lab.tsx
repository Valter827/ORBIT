import { useCallback, useEffect, useState } from "react";
import { core, errorText } from "./api";
import { Button, ErrorNotice } from "./components";
import type { TrainingStorage, TrainingJob, TrainingConfig } from "../../packages/core/src/training/types";
import { TrainingConfigSchema } from "../../packages/core/src/training/types";
import type { compareEvaluations } from "../../packages/core/src/training/evaluation";
function MeasuredProgress({ job }: { job: TrainingJob }) {
  const points = job.events.flatMap((event) => {
    const metrics = event["metrics"] as Record<string, unknown> | undefined;
    const loss = metrics?.["loss"];
    return typeof event["step"] === "number" && typeof loss === "number" && Number.isFinite(loss)
      ? [{ step: event["step"], loss }]
      : [];
  });
  if (!points.length) return <p className="muted">Loss measurements are not available yet.</p>;
  const min = Math.min(...points.map((p) => p.loss)),
    max = Math.max(...points.map((p) => p.loss));
  const coordinates = points
    .map(
      (p) => `${12 + (376 * p.step) / job.config.maxSteps},${108 - (96 * (p.loss - min)) / Math.max(0.001, max - min)}`,
    )
    .join(" ");
  const latest = points.at(-1)!;
  return (
    <figure>
      <figcaption>
        Training loss · step {latest.step}/{job.config.maxSteps} · {latest.loss.toFixed(4)}
      </figcaption>
      <progress value={latest.step} max={job.config.maxSteps} aria-label="Measured training steps" />
      <svg
        viewBox="0 0 400 120"
        role="img"
        aria-label={`Measured training loss, range ${min.toFixed(4)} to ${max.toFixed(4)}`}
      >
        <polyline points={coordinates} fill="none" stroke="currentColor" strokeWidth="2" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={12 + (376 * p.step) / job.config.maxSteps}
            cy={108 - (96 * (p.loss - min)) / Math.max(0.001, max - min)}
            r="3"
            fill="currentColor"
          />
        ))}
      </svg>
      <details>
        <summary>Accessible loss values</summary>
        <table>
          <thead>
            <tr>
              <th>Step</th>
              <th>Loss</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i}>
                <td>{p.step}</td>
                <td>{p.loss.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
function MeasuredComparison({ value }: { value: unknown }) {
  const comparison = value as ReturnType<typeof compareEvaluations>;
  return (
    <>
      <table>
        <caption>Held-out measured accuracy</caption>
        <thead>
          <tr>
            <th>Category</th>
            <th>Base</th>
            <th>Adapter</th>
            <th>Observations</th>
          </tr>
        </thead>
        <tbody>
          {comparison.scores.map((score) => (
            <tr key={score.category}>
              <td>{score.category}</td>
              <td>{(score.base * 100).toFixed(1)}%</td>
              <td>{(score.adapter * 100).toFixed(1)}%</td>
              <td>{score.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {comparison.independentItems} independent items. Improvement {(comparison.improvement * 100).toFixed(1)}{" "}
        percentage points; paired uncertainty ±{(comparison.uncertainty95 * 100).toFixed(1)} points.
      </p>
      <details>
        <summary>Full evaluation evidence</summary>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </>
  );
}
type LabState = {
  dataset: {
    version: string;
    heldout: string;
    valid: boolean;
    hash: string;
    counts: Record<string, number>;
    categories: Record<string, number>;
    languages: Record<string, number>;
    issues: Array<{ id: string; reason: string }>;
    examples: Array<{
      id: string;
      category: string;
      split: string;
      answer: string;
      messages: Array<{ content: string }>;
    }>;
  };
  candidates: Array<Record<string, string>>;
  settings: TrainingStorage | null;
  storage: Record<string, { path: string; freeBytes: number | null }>;
  jobs: TrainingJob[];
  backend: string;
  privateData: string;
  alpha: string;
  fit: { state: string; vramGiB: number[]; ramGiB: number[]; diskGiB: number; duration: string; note: string };
};
const sections = [
  "Overview",
  "Base Model",
  "Dataset",
  "Training",
  "Evaluations",
  "Adapters",
  "Compare",
  "Export",
] as const;
const defaultStorage: TrainingStorage = {
  models: "D:\\ORBIT\\Models\\gemma-3-4b-it",
  training: "D:\\ORBIT\\Training",
  datasets: "D:\\ORBIT\\Datasets",
  adapters: "D:\\ORBIT\\Adapters",
  python: "D:\\ORBIT\\TrainingEnv\\Scripts\\python.exe",
};
export function TrainingLab() {
  const [open, setOpen] = useState(false);
  return (
    <section className="panel training-entry">
      <div>
        <span className="eyebrow">COSMO · TRAINING LAB</span>
        <h2>Train behavior. Measure the result.</h2>
        <p className="muted">Controlled datasets, isolated experiments and evidence before promotion.</p>
      </div>
      <Button onClick={() => setOpen(!open)}>{open ? "Close Training Lab" : "Open Training Lab"}</Button>
      {open && <Lab />}
    </section>
  );
}
function Lab() {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [state, setState] = useState<LabState>(),
    [tab, setTab] = useState<(typeof sections)[number]>("Overview"),
    [storage, setStorage] = useState(defaultStorage),
    [config, setConfig] = useState<TrainingConfig>(
      TrainingConfigSchema.parse({
        base: "google/gemma-3-4b-it",
        revision: "093f9f388b31de276ce2de164bdc2081324b9767",
      }),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [step, setStep] = useState(0),
    [advanced, setAdvanced] = useState(false),
    [probe, setProbe] = useState<Record<string, unknown>>(),
    [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    const next = await core<LabState>("ai.trainingState");
    setState(next);
    return next;
  }, []);
  useEffect(() => {
    void refresh()
      .then((s) => {
        if (s.settings) setStorage(s.settings);
      })
      .catch((e) => setError(errorText(e)));
  }, [refresh]);
  useEffect(() => {
    if (!state?.jobs.some((j) => ["Preparing", "Ready", "Training", "Evaluating"].includes(j.state))) return;
    const timer = setInterval(() => void refresh().catch((e) => setError(errorText(e))), 1500);
    return () => clearInterval(timer);
  }, [state, refresh]);
  async function action(method: string, params: unknown = {}) {
    setBusy(true);
    setError("");
    try {
      const result = await core<Record<string, unknown>>(method, params);
      if (method === "ai.trainingProbe") setProbe(result);
      if (method === "ai.trainingExport") setNotice("Adapter package exported to " + String(result["path"]));
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (!state) return <p role="status">{error || "Loading Training Lab…"}</p>;
  const active = state.jobs.some((j) => ["Preparing", "Ready", "Training", "Evaluating"].includes(j.state));
  return (
    <div className="training-lab">
      <p role="status">
        COSMO Dataset v1.1 is preserved. The local Alpha experiment is paused: Windows Application Control blocks the
        approved NumPy training module. Voice uses the existing COSMO roles and does not resume training.
      </p>
      {deleteId && (
        <div role="alertdialog" aria-label="Confirm adapter deletion" className="panel training-card">
          <h3>Delete this adapter?</h3>
          <p>The base model and experiment history will remain. Saved adapter weights will be removed.</p>
          <Button
            onClick={() => {
              void action("ai.trainingDeleteAdapter", { id: deleteId, confirmed: true });
              setDeleteId(null);
            }}
          >
            Delete adapter
          </Button>
          <Button onClick={() => setDeleteId(null)}>Keep adapter</Button>
        </div>
      )}
      <nav aria-label="Training Lab sections" className="actions">
        {sections.map((t) => (
          <Button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </Button>
        ))}
      </nav>
      {error && <ErrorNotice details={error} />} {notice && <p role="status">{notice}</p>}
      {tab === "Overview" && (
        <>
          <div className="training-grid">
            <article className="panel training-card">
              <h3>Alpha status</h3>
              <strong>{state.alpha}</strong>
              <p>Existing COSMO roles remain active. Training completion alone never changes your assistant.</p>
            </article>
            <article className="panel training-card">
              <h3>Your data stays separate</h3>
              <strong>{state.privateData}</strong>
              <p>No chat, Memory, Knowledge, Sense or browsing history is connected to the dataset.</p>
            </article>
            <article className="panel training-card">
              <h3>Local training fit</h3>
              <strong>{state.fit.state}</strong>
              <p>
                Estimated VRAM: {state.fit.vramGiB.join("–")} GiB · RAM: {state.fit.ramGiB.join("–")} GiB · storage:{" "}
                {state.fit.diskGiB} GiB.
              </p>
              <p className="muted">{state.fit.note}</p>
            </article>
          </div>
          <h3>Dedicated storage</h3>
          <p className="muted">
            Choose empty folders for runs, datasets and adapters. Original model weights stay in place. No downloads or
            installations occur here.
          </p>
          <div className="training-grid">
            {(Object.keys(storage) as Array<keyof TrainingStorage>).map((k) => (
              <label key={k}>
                {
                  {
                    models: "Model storage (original Safetensors)",
                    training: "Training workspace",
                    datasets: "Dataset cache",
                    adapters: "Adapter output",
                    python: "Isolated Python interpreter",
                  }[k]
                }
                <input value={storage[k]} onChange={(e) => setStorage({ ...storage, [k]: e.target.value })} />
                {state.storage[k]?.freeBytes != null && (
                  <small>{(state.storage[k].freeBytes / 2 ** 30).toFixed(1)} GiB free</small>
                )}
              </label>
            ))}
          </div>
          <div className="actions">
            <Button disabled={busy || active} onClick={() => void action("ai.trainingStorage", storage)}>
              Save storage
            </Button>
            <Button disabled={busy || active || !state.settings} onClick={() => void action("ai.trainingProbe")}>
              Check training environment
            </Button>
          </div>
          {probe && (
            <div role="status">
              <strong>{probe["ready"] ? "Environment ready" : "Environment not ready"}</strong>
              <details>
                <summary>Dependency and CUDA details</summary>
                <pre>{JSON.stringify(probe, null, 2)}</pre>
              </details>
            </div>
          )}
          <p className="muted">
            Training may heavily use GPU/CPU for hours. Keep laptops plugged in with adequate cooling. Python packages
            and model downloads require separate approval.
          </p>
        </>
      )}
      {tab === "Base Model" && (
        <>
          <p>
            Gemma 3 4B Instruct is selected for a bounded pilot, not declared a trained COSMO model. A successful
            hardware pilot and fresh original-weight baseline are still required.
          </p>
          <div className="training-grid">
            {state.candidates.map((c) => (
              <article className="panel training-card" key={c["model"]}>
                <h3>{c["model"]}</h3>
                <strong>{c["selection"]}</strong>
                <p>{c["reason"]}</p>
                <details>
                  <summary>Evidence, license and architecture</summary>
                  <dl>
                    {Object.entries(c)
                      .filter(([k]) => !["model", "selection", "reason"].includes(k))
                      .map(([k, v]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                  </dl>
                </details>
              </article>
            ))}
          </div>
          <p className="muted">
            License records describe documented permissions with conditions; they are not legal guarantees. Ollama
            adapter deployment remains unverified.
          </p>
        </>
      )}
      {tab === "Dataset" && (
        <>
          <h3>{state.dataset.version}</h3>
          <p>
            {state.dataset.counts["train"]} training · {state.dataset.counts["validation"]} validation ·{" "}
            {state.dataset.counts["test"]} held-out
          </p>
          <strong>{state.dataset.valid ? "Validation and overlap checks passed" : "Dataset admission blocked"}</strong>
          {state.dataset.issues.map((x, i) => (
            <p key={i}>
              {x.id}: {x.reason}
            </p>
          ))}
          <p className="muted">
            Held-out answers are not shown or passed to training. This small authored pilot dataset is insufficient for
            general Alpha promotion; exact-answer metrics are intentionally strict.
          </p>
          <div className="training-grid">
            <div>
              <h4>Categories</h4>
              {Object.entries(state.dataset.categories).map(([k, v]) => (
                <p key={k}>
                  {k}: {v}
                </p>
              ))}
            </div>
            <div>
              <h4>Languages</h4>
              {Object.entries(state.dataset.languages).map(([k, v]) => (
                <p key={k}>
                  {k}: {v}
                </p>
              ))}
            </div>
          </div>
          <details>
            <summary>Inspect training/validation examples and exclude bad rows</summary>
            {state.dataset.examples.map((e) => (
              <article className="panel training-card" key={e.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={config.excludedIds.includes(e.id)}
                    onChange={(event) =>
                      setConfig({
                        ...config,
                        excludedIds: event.target.checked
                          ? [...config.excludedIds, e.id]
                          : config.excludedIds.filter((id) => id !== e.id),
                      })
                    }
                  />{" "}
                  Exclude {e.id}
                </label>
                <p>{e.messages.map((m) => m.content).join("\n")}</p>
                <p>{e.answer}</p>
                <small>ORBIT-authored synthetic scenario · reviewed · no private data · {e.split}</small>
              </article>
            ))}
          </details>
        </>
      )}
      {tab === "Training" && (
        <>
          <h3>New training run · {step + 1}/4</h3>
          {step === 0 && (
            <>
              <h4>1. Base and dataset</h4>
              <p>google/gemma-3-4b-it · pinned revision 093f9f3… · {state.dataset.version}</p>
              <p>
                Excluded rows: {config.excludedIds.length}. Original weights must already exist in configured model
                storage.
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <h4>2. Hardware and environment</h4>
              <p>
                {state.fit.state}: {state.fit.note}
              </p>
              <Button disabled={busy || active || !state.settings} onClick={() => void action("ai.trainingProbe")}>
                Run environment check
              </Button>
              <p>{probe?.["ready"] ? "Ready" : "No successful environment check recorded in this view."}</p>
            </>
          )}
          {step === 2 && (
            <>
              <h4>3. Low VRAM pilot</h4>
              <p>QLoRA NF4 · micro-batch 1 · gradient checkpointing · no automatic full run.</p>
              <label>
                <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} /> Advanced
                configuration
              </label>
              {advanced && (
                <div className="training-grid">
                  {(
                    [
                      "rank",
                      "alpha",
                      "learningRate",
                      "epochs",
                      "gradientAccumulation",
                      "sequenceLength",
                      "maxSteps",
                    ] as const
                  ).map((k) => (
                    <label key={k}>
                      {k}
                      <input
                        type="number"
                        step={k === "learningRate" ? 0.00001 : 1}
                        value={config[k]}
                        onChange={(e) => setConfig({ ...config, [k]: Number(e.target.value) })}
                      />
                    </label>
                  ))}
                  <label>
                    Method
                    <select
                      value={config.method}
                      onChange={(e) => setConfig({ ...config, method: e.target.value as "QLoRA" | "LoRA" })}
                    >
                      <option>QLoRA</option>
                      <option>LoRA</option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={config.pilot}
                      onChange={(e) => setConfig({ ...config, pilot: e.target.checked })}
                    />{" "}
                    Pilot (full training requires a completed real pilot)
                  </label>
                </div>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <h4>4. Review immutable experiment</h4>
              <p>
                {config.method}, {config.maxSteps} steps, rank {config.rank}, sequence {config.sequenceLength}, seed{" "}
                {config.seed}. Dataset hash: <code>{state.dataset.hash.slice(0, 16)}…</code>
              </p>
              <p>
                Creates a draft. Starting it is a separate action. No model becomes COSMO Brain Alpha automatically.
              </p>
              <Button
                disabled={busy || active || !state.dataset.valid || !state.settings}
                onClick={() => void action("ai.trainingDraft", config)}
              >
                Create training draft
              </Button>
            </>
          )}
          <div className="actions">
            <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
              Back
            </Button>
            <Button disabled={step === 3} onClick={() => setStep(step + 1)}>
              Next
            </Button>
          </div>
          <h3>Experiments</h3>
          {state.jobs.length === 0 && <p className="muted">No experiments yet. No training progress is simulated.</p>}
          {state.jobs.map((j) => (
            <article className="panel training-card" key={j.id}>
              <h4>
                Experiment {j.id.slice(0, 8)} · {j.state}
              </h4>
              <p>
                {j.config.method} · {j.config.pilot ? "pilot" : "full run"} · {j.created}
              </p>
              {j.error && <p role="status">{j.error}</p>}
              <MeasuredProgress job={j} />
              <div className="actions">
                {j.state === "Draft" && (
                  <Button disabled={busy || active} onClick={() => void action("ai.trainingStart", { id: j.id })}>
                    Start training
                  </Button>
                )}
                {["Preparing", "Training", "Evaluating"].includes(j.state) && (
                  <Button onClick={() => void action("ai.trainingCancel", { id: j.id })}>Stop</Button>
                )}
                {["Failed", "Cancelled", "Rejected"].includes(j.state) && (
                  <Button disabled={busy || active} onClick={() => void action("ai.trainingDraft", j.config)}>
                    Create new experiment from config
                  </Button>
                )}
                {j.state === "Completed" && (
                  <Button disabled={busy || active} onClick={() => void action("ai.trainingEvaluate", { id: j.id })}>
                    Run held-out comparison
                  </Button>
                )}
              </div>
              <details>
                <summary>Measured worker progress</summary>
                <pre>{JSON.stringify(j.events.slice(-8), null, 2)}</pre>
              </details>
            </article>
          ))}
        </>
      )}
      {["Evaluations", "Compare"].includes(tab) && (
        <>
          <h3>Before / after</h3>
          <p>
            Identical held-out prompts, two repetitions, fixed seed and token budget. Improvement must exceed paired
            uncertainty; fewer than 30 independent items cannot promote a general model.
          </p>
          {state.jobs
            .filter((j) => j.evaluation)
            .map((j) => (
              <article className="panel training-card" key={j.id}>
                <h4>
                  {j.id.slice(0, 8)} · {j.state}
                </h4>
                <MeasuredComparison value={j.evaluation} />
              </article>
            ))}
          {!state.jobs.some((j) => j.evaluation) && (
            <p className="muted">No real adapter comparison yet. No scores are available.</p>
          )}
        </>
      )}
      {["Adapters", "Export"].includes(tab) && (
        <>
          <h3>Adapter registry</h3>
          <p>
            Only saved, hash-verified adapters that passed load/inference verification appear here. Export contains
            Safetensors, config and provenance; no executable or private database.
          </p>
          {state.jobs
            .filter((j) => j.adapter)
            .map((j) => (
              <article className="panel training-card" key={j.id}>
                <h4>Experiment {j.id.slice(0, 8)}</h4>
                <p>
                  {j.config.base} · {j.config.method} · {(j.adapter!.bytes / 2 ** 20).toFixed(1)} MiB · {j.state}
                </p>
                <details>
                  <summary>Advanced provenance</summary>
                  <p>Adapter SHA256: {j.adapter!.hash}</p>
                  <p>Dataset: {j.datasetHash}</p>
                  <p>Base: {j.baseHash}</p>
                  <p>Gemma Terms · NOT PROMOTED · deployment NOT VERIFIED</p>
                </details>
                <Button disabled={busy || active} onClick={() => void action("ai.trainingExport", { id: j.id })}>
                  Export adapter package
                </Button>
                <Button disabled={busy || active} onClick={() => setDeleteId(j.id)}>
                  Delete adapter…
                </Button>
              </article>
            ))}
          {!state.jobs.some((j) => j.adapter) && <p className="muted">No trained adapter exists.</p>}
        </>
      )}
    </div>
  );
}
