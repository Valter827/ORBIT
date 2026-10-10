import { intelligenceDefaults } from "./ai-types";
import { useEffect, useState, useRef } from "react";
import { core, native, errorText } from "./api";
import { Button } from "./components";
import type { AIState, Model, Profile } from "./ai-types";
type Runtime = { runtime: string; endpoint: string; models: Model[] };
type Hardware = {
  cpu: string | null;
  ramBytes: number;
  gpu: string | null;
  vramBytes: number | null;
  diskAvailableBytes: number | null;
  modelDirectory: string;
  catalog: Array<{
    id: string;
    label: string;
    downloadBytes: number;
    minRamBytes: number;
    reason: string;
    publisher: string;
    license: string;
    source: string;
    licenseUrl: string;
    vision: boolean;
  }>;
};
type Download = { status: string; phase?: string; completed?: number; total?: number; error?: string; model?: string };
const gb = (n: number | null) => (n === null ? "Unknown" : (n / 1e9).toFixed(1) + " GB");
export function LocalSetup({
  ai,
  refresh,
  onDone,
  onAdvanced,
}: {
  ai: AIState;
  refresh: () => Promise<void>;
  onDone: () => void;
  onAdvanced: () => void;
}) {
  const epoch = useRef(0);
  const stop = () => {
    epoch.current++;
    void core("chat.stop").catch(() => {});
  };
  const profile = ai.profiles.find((p) => p.id === ai.selected)!;
  const [hardware, setHardware] = useState<Hardware>(),
    [runtimes, setRuntimes] = useState<Runtime[]>([]),
    [endpoint, setEndpoint] = useState(""),
    [model, setModel] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [answer, setAnswer] = useState(""),
    [download, setDownload] = useState<Download>({ status: "idle" }),
    [storage, setStorage] = useState(false),
    [local, setLocal] = useState(false);
  const runtime = runtimes.find((r) => r.endpoint === endpoint),
    chosen = runtime?.models.find((m) => m.model === model);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const detect = async () => {
    const [hw, list] = await Promise.all([core<Hardware>("ai.hardware"), core<Runtime[]>("ai.detect")]);
    setHardware(hw);
    setRuntimes(list);
    setEndpoint((old) => (list.some((r) => r.endpoint === old) ? old : (list[0]?.endpoint ?? "")));
  };
  useEffect(() => {
    void run(detect);
    return () => {
      epoch.current++;
      void core("ai.localDownloadCancel").catch(() => {});
      void core("chat.stop").catch(() => {});
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      void core<Download>("ai.localDownloadStatus")
        .then(setDownload)
        .catch(() => {});
    }, 750);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setModel("");
    setAnswer("");
  }, [endpoint]);
  const test = async () => {
    const ticket = ++epoch.current;
    setAnswer("");
    const check = () => {
      if (ticket !== epoch.current) throw new Error("Test cancelled.");
    };
    if (!runtime || !chosen || !local) throw new Error("Choose a model and confirm local inference.");
    const existing = ai.providers.find((p) => p.type === "local" && p.endpoint === endpoint);
    const providerId =
      existing?.id ??
      "local-" + (endpoint.includes(":11434") ? "ollama" : endpoint.includes(":1234") ? "lmstudio" : "llamacpp");
    await native("save_provider", {
      input: {
        provider: {
          id: providerId,
          name: runtime.runtime,
          type: "local",
          endpoint,
          remoteAcknowledged: false,
          localInferenceConfirmed: true,
        },
        apiKey: null,
        disconnect: false,
      },
    });
    check();
    const next: Profile = {
      ...profile,
      providerId,
      modelId: model,
      intelligence: { ...intelligenceDefaults, ...profile.intelligence, auto: false },
    };
    await core("ai.saveProfile", next);
    await refresh();
    check();
    const result = await core<{ text: string }>("ai.brainTest", { profileId: profile.id });
    check();
    if (!result.text.trim()) throw new Error("Model returned no text.");
    setAnswer(result.text);
    await refresh();
    check();
    onDone();
  };
  return (
    <section className="card local-setup">
      <Button onClick={onDone}>Close setup</Button>
      <small>NO API KEY REQUIRED</small>
      <h1>Set up {profile.builtin ? "COSMO" : profile.name} locally</h1>
      <p>The assistant is your identity, knowledge and preferences. A separately installed model is its brain.</p>
      <ol className="setup-steps">
        <li>Check this PC</li>
        <li>Find local AI</li>
        <li>Choose model</li>
        <li>Download / configure</li>
        <li>Test</li>
        <li>Start chatting</li>
      </ol>
      {error && <p role="alert">{error}</p>}
      <h2>1 · This PC</h2>
      {hardware ? (
        <p>
          CPU: {hardware.cpu ?? "Unknown"}
          <br />
          RAM: {gb(hardware.ramBytes)} · GPU: {hardware.gpu ?? "Unknown"} · VRAM: {gb(hardware.vramBytes)}
          <br />
          Free model-drive space: {gb(hardware.diskAvailableBytes)}
        </p>
      ) : (
        <p>Checking hardware…</p>
      )}
      <h2>2 · Local AI runtime</h2>
      {["Ollama", "LM Studio compatible", "llama.cpp compatible"].map((name) => (
        <p key={name}>
          {name} · {runtimes.some((r) => r.runtime === name) ? "Running" : "Not detected"}
        </p>
      ))}
      <Button disabled={busy} onClick={() => void run(detect)}>
        Reconnect / Check again
      </Button>
      {!runtimes.length && (
        <div className="setup-disclosure">
          <h3>COSMO needs a local AI runtime</h3>
          <p>
            No supported local AI runtime was found. Ollama is the guided option; existing LM Studio and llama.cpp
            servers also work.
          </p>
          <h3>Guided Setup · Ollama</h3>
          <p>
            Official source: ollama.com. This separate third-party application runs the model on your PC. Installer
            download size: unknown. The official Windows guide requires at least 4 GB for the runtime; models need extra
            space. Default installation: your Windows user profile.
          </p>
          <p>
            Open the official page, download OllamaSetup.exe, check its verified publisher in Windows, and follow the
            installer. If Windows blocks it, keep the policy enabled. Open Ollama, return here and click Check again.
            ORBIT does not silently install or redistribute Ollama.
          </p>
          <Button
            onClick={() =>
              void run(async () => {
                await native("window_action", { action: "ollama-install" });
              })
            }
          >
            Install · Open official Ollama installer
          </Button>
          <Button onClick={onAdvanced}>I already have a local server</Button>
        </div>
      )}
      {!!runtimes.length && (
        <>
          <h2>3 · Choose the brain</h2>
          <label>
            Runtime
            <select disabled={busy} aria-label="Runtime" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}>
              {runtimes.map((r) => (
                <option key={r.endpoint} value={r.endpoint}>
                  {r.runtime}
                </option>
              ))}
            </select>
          </label>
          <label>
            Installed models
            <select
              disabled={busy}
              aria-label="Installed models"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setAnswer("");
              }}
            >
              <option value="">Choose an installed model</option>
              {runtime?.models
                .filter((m) => m.metadata?.remote !== true && !/:cloud$|-cloud$/.test(m.model))
                .map((m) => (
                  <option key={m.model} value={m.model}>
                    {m.model}
                  </option>
                ))}
            </select>
          </label>
          {chosen && (
            <p>
              Chat supported · Streaming {chosen.capabilities?.streaming ? "Supported" : "Unknown"} · Agent{" "}
              {chosen.supportsTools ? "Supported" : "Unavailable"} · Sense Text supported · Vision{" "}
              {chosen.capabilities?.vision === true ? "Supported" : "Unavailable / unknown"}
            </p>
          )}
          <label className="check">
            <input
              type="checkbox"
              aria-label="Confirm local inference"
              checked={local}
              onChange={(e) => setLocal(e.target.checked)}
            />
            I confirm this runtime uses local inference. ORBIT cannot guarantee that arbitrary local software never
            communicates externally.
          </label>
        </>
      )}
      {endpoint === "http://127.0.0.1:11434/v1/" && hardware && (
        <>
          <h2>4 · Download a model</h2>
          <p>
            These are third-party models, not ORBIT models. Downloads require Internet. Size estimates come from the
            official catalog; RAM labels are guidance, not benchmarks. Actual working memory is unknown.
          </p>
          <label className="check">
            <input type="checkbox" checked={storage} onChange={(e) => setStorage(e.target.checked)} />
            Ollama stores models at {hardware.modelDirectory}. If you changed this location elsewhere, use Ollama to
            download instead.
          </label>
          <div className="project-grid">
            {hardware.catalog.map((m) => (
              <section className="card" key={m.id}>
                <h3>
                  {m.label} · {m.id}
                </h3>
                <p>{m.reason}</p>
                <p>
                  {hardware.ramBytes >= m.minRamBytes ? "Fits the RAM guidance" : "Below the RAM guidance"} · Approx.
                  download {gb(m.downloadBytes)}
                </p>
                <p>
                  {m.publisher} · {m.license}
                </p>
                <a href={m.source} target="_blank" rel="noreferrer">
                  Model source
                </a>
                {" · "}
                <a href={m.licenseUrl} target="_blank" rel="noreferrer">
                  License terms
                </a>
                <Button
                  disabled={busy || !storage || download.status === "downloading"}
                  onClick={() =>
                    void run(async () => {
                      setDownload(
                        await core<Download>("ai.localDownload", {
                          model: m.id,
                          confirmed: true,
                          storageConfirmed: true,
                        }),
                      );
                    })
                  }
                >
                  Download {m.id} · Accept model terms
                </Button>
              </section>
            ))}
          </div>
          <p role="status">
            {download.status} {download.phase} {download.error}
          </p>
          {download.status === "downloading" && (
            <>
              <p>
                Current layer:{" "}
                {download.total ? gb(download.completed ?? 0) + " / " + gb(download.total) : "Size unknown"}
              </p>
              <progress
                {...(download.total
                  ? { value: Math.min(download.completed ?? 0, download.total), max: download.total }
                  : {})}
              />
              <Button onClick={() => void core<Download>("ai.localDownloadCancel").then(setDownload)}>
                Cancel download
              </Button>
            </>
          )}
          <p>
            Cancelled downloads are never marked ready. Ollama may retain partial layers for resume. After completion,
            Check again and select the installed model.
          </p>
        </>
      )}
      <h2>5 · Test {profile.builtin ? "COSMO" : profile.name}</h2>
      <p>
        {busy
          ? "Working / loading brain…"
          : "The test sends a real, small inference request to the selected model. No sample answer is substituted."}
      </p>
      <Button disabled={busy || !model || !local || !chosen} onClick={() => void run(test)}>
        Test model
      </Button>
      {busy && <Button onClick={stop}>Stop test</Button>}
      {answer && (
        <>
          <p className="pill">Ready · Local · {model}</p>
          <blockquote>{answer}</blockquote>
          <h2>6 · Start chatting</h2>
          <Button onClick={onDone}>Chat with {profile.builtin ? "COSMO" : profile.name}</Button>
        </>
      )}
      <p>
        Installed local models can chat offline. Downloads, updates, web services and cloud providers still need a
        network. Changing the brain preserves your assistant, Knowledge, Memory and chats.
      </p>
      <Button onClick={onAdvanced}>Advanced / Cloud provider settings</Button>
    </section>
  );
}
