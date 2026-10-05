import { useEffect, useState } from "react";
import { core, native, errorText, displayValue } from "./api";
import { Button } from "./components";
import type { AIState, ProviderConfig, Model } from "./ai-types";
const blank = (type: ProviderConfig["type"]): ProviderConfig => ({
  id: type === "anthropic" ? "anthropic" : type + "-" + crypto.randomUUID(),
  name: type === "anthropic" ? "Anthropic" : type === "local" ? "Local AI" : "Compatible API",
  type,
  endpoint: type === "local" ? "http://127.0.0.1:11434/v1/" : "",
  remoteAcknowledged: false,
  localInferenceConfirmed: false,
});
export function ProvidersPanel({ refresh }: { refresh: () => Promise<void> }) {
  const [state, setState] = useState<AIState>(),
    [form, setForm] = useState<ProviderConfig>(blank("anthropic")),
    [key, setKey] = useState(""),
    [model, setModel] = useState(""),
    [models, setModels] = useState<Model[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [hardware, setHardware] = useState<Record<string, unknown>>(),
    [found, setFound] = useState<Array<{ runtime: string; endpoint: string; models: Model[] }>>([]);
  const [advanced, setAdvanced] = useState(false);
  const load = async () => setState(await core<AIState>("ai.state"));
  useEffect(() => {
    void load().catch((e) => setMessage(errorText(e)));
  }, []);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async (disconnect = false) => {
    await native("save_provider", { input: { provider: form, apiKey: key || null, disconnect } });
    setKey("");
    await load();
    await refresh();
  };
  return (
    <section className="card ai-providers">
      <h2>AI Providers</h2>
      <p className="muted">Choose cloud or local inference. Keys stay in Windows Credential Manager.</p>
      <div className="actions">
        {state?.providers.map((p) => (
          <Button
            key={p.id}
            onClick={() => {
              setForm({
                id: p.id,
                name: p.name,
                type: p.type,
                endpoint: p.endpoint,
                remoteAcknowledged: p.remoteAcknowledged,
                localInferenceConfirmed: p.localInferenceConfirmed,
              });
              setModels(p.models);
              setKey("");
              setModel("");
              setMessage("");
            }}
          >
            {p.name}
          </Button>
        ))}
      </div>
      <div className="actions">
        <button type="button" aria-pressed={!advanced} onClick={() => setAdvanced(false)}>
          Simple
        </button>
        <button type="button" aria-pressed={advanced} onClick={() => setAdvanced(true)}>
          Advanced
        </button>
      </div>
      <div className="actions">
        <Button
          onClick={() => {
            setForm(blank("local"));
            setModels([]);
            setKey("");
          }}
        >
          Add local provider
        </Button>
        {advanced && (
          <Button
            onClick={() => {
              setForm(blank("compatible"));
              setModels([]);
              setKey("");
            }}
          >
            Add compatible API
          </Button>
        )}
      </div>
      <label>
        Provider name
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} />
      </label>
      <p>
        {form.type === "anthropic"
          ? "Anthropic · remote cloud"
          : form.type === "local"
            ? "LOCAL endpoint · on this PC"
            : "REMOTE custom endpoint"}
      </p>
      {(advanced || form.type === "compatible") && form.type !== "anthropic" && (
        <label>
          Base URL
          <input
            value={form.endpoint}
            onChange={(e) => {
              setForm({ ...form, endpoint: e.target.value, remoteAcknowledged: false, localInferenceConfirmed: false });
              setModels([]);
              setModel("");
            }}
            placeholder="https://server.example/v1/"
          />
        </label>
      )}
      {form.type === "compatible" && (
        <label className="check">
          <input
            type="checkbox"
            checked={form.remoteAcknowledged}
            onChange={(e) => setForm({ ...form, remoteAcknowledged: e.target.checked })}
          />
          I approve sending prompts and selected project / knowledge context to this remote endpoint:{" "}
          {form.endpoint || "(enter URL)"}
        </label>
      )}
      {form.type === "local" && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={form.localInferenceConfirmed}
              onChange={(e) => setForm({ ...form, localInferenceConfirmed: e.target.checked })}
            />
            I have configured this runtime for local inference, without cloud forwarding.
          </label>
          <p className="muted">
            Only 127.0.0.1 / [::1] endpoints are accepted here. A local server can itself forward data; ORBIT cannot
            control the server's network access.
          </p>
        </>
      )}
      <label>
        API key {form.type !== "anthropic" && "(if required)"}
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Empty keeps the saved key at the same endpoint"
        />
      </label>
      <p className="muted">
        {state?.providers.find((p) => p.id === form.id)?.configured
          ? "Configured · connection not yet tested here"
          : "Not configured"}
      </p>
      <div className="actions">
        <Button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await save();
              setMessage("Provider saved securely.");
            })
          }
        >
          Connect / Save provider
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await save(true);
              setMessage("Credential removed.");
            })
          }
        >
          Disconnect
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const list = await core<Model[]>("ai.models", { providerId: form.id, refresh: true });
              setModels(list);
              setMessage(list.length + " models found. Select a model.");
            })
          }
        >
          Refresh models
        </Button>
      </div>
      <label>
        Available model
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="">Select an available model</option>
          {models.map((m) => (
            <option key={m.model} value={m.model}>
              {m.displayName ?? m.model}
            </option>
          ))}
        </select>
      </label>
      {models.find((m) => m.model === model) && (
        <div className="notice">
          Tools:{" "}
          {models.find((m) => m.model === model)?.capabilities?.toolCalling === true
            ? "supported"
            : models.find((m) => m.model === model)?.capabilities?.toolCalling === false
              ? "unsupported"
              : "unknown — Agent Mode unavailable"}{" "}
          · Context: {models.find((m) => m.model === model)?.contextWindow || "unknown"}
          {advanced && <pre>{JSON.stringify(models.find((m) => m.model === model)?.metadata ?? {}, null, 2)}</pre>}
        </div>
      )}
      <div className="actions">
        <Button
          disabled={busy || !model}
          onClick={() =>
            void run(async () => {
              const r = await core<{ latencyMs: number; model: string }>("ai.test", {
                providerId: form.id,
                modelId: model,
              });
              setMessage("Connected · " + r.latencyMs + " ms · Model access: " + r.model);
            })
          }
        >
          Test connection
        </Button>
        <Button
          disabled={busy || !model || !state}
          onClick={() =>
            void run(async () => {
              const p = state!.profiles.find((p) => p.id === state!.selected)!;
              await core("ai.saveProfile", { ...p, providerId: form.id, modelId: model });
              await refresh();
              setMessage("Model selected for " + p.name);
            })
          }
        >
          Use model for current AI
        </Button>
      </div>
      <p className="muted">
        Connection tests use the selected provider and may consume API tokens. Discovery never silently changes your
        model.
      </p>
      <p role="status">{message}</p>
      <h3>Local AI discovery</h3>
      <Button
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const result = await core<typeof found>("ai.detect");
            setFound(result);
            setMessage(
              result.length
                ? "Local compatible endpoints detected."
                : "No supported local runtime responded. Start a local server and refresh.",
            );
          })
        }
      >
        Auto Detect
      </Button>
      {found.map((p) => (
        <div className="card" key={p.endpoint}>
          <strong>{p.runtime}</strong>
          <p>
            {p.endpoint} · {p.models.length} models
          </p>
          <Button
            onClick={() => {
              setForm({ ...blank("local"), name: p.runtime, endpoint: p.endpoint });
              setModels(p.models);
            }}
          >
            Configure endpoint
          </Button>
        </div>
      ))}
      <p className="muted">No models are downloaded automatically. Install/manage models in your runtime.</p>
      <h3>Local Hardware</h3>
      <Button onClick={() => void run(async () => setHardware(await core("ai.hardware")))}>
        Read hardware information
      </Button>
      {hardware && (
        <dl>
          {Object.entries(hardware).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>
                {v === null
                  ? "Unavailable"
                  : typeof v === "number" && k.endsWith("Bytes")
                    ? (v / 1024 ** 3).toFixed(1) + " GiB"
                    : displayValue(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="muted">
        Hardware information is factual. ORBIT does not infer benchmark speed or recommend a model without
        measured/documented requirements.
      </p>
    </section>
  );
}
