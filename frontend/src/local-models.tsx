import { intelligenceDefaults } from "./ai-types";
import { useEffect, useState } from "react";
import { core, errorText } from "./api";
import type { AIState, Model } from "./ai-types";
import { Button } from "./components";

export function LocalModels({
  ai,
  refresh,
  onSetup,
}: {
  ai?: AIState;
  refresh: () => Promise<void>;
  onSetup: () => void;
}) {
  const [runtimes, setRuntimes] = useState<Array<{ runtime: string; endpoint: string; models: Model[] }>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  const detect = async () => {
    setRuntimes(await core<typeof runtimes>("ai.detect"));
  };
  useEffect(() => {
    void run(detect);
  }, []);
  const profile = ai?.profiles.find((p) => p.id === ai.selected);
  return (
    <>
      <p>Run your AI on this computer. No API key required.</p>
      <div className="actions">
        <Button disabled={busy} onClick={() => void run(detect)}>
          Refresh runtimes
        </Button>
        <Button onClick={onSetup}>Change model / Download</Button>
      </div>
      {busy && <p role="status">Checking local AI…</p>}
      {!busy && !runtimes.length && <p>No supported runtime detected. Open Local AI setup to connect Ollama.</p>}
      {runtimes.map((runtime) => (
        <section className="card" key={runtime.endpoint}>
          <h3>{runtime.runtime}</h3>
          <p className="muted">● Running</p>
          <details>
            <summary>Advanced connection</summary>
            <p>{runtime.endpoint}</p>
          </details>
          {runtime.models
            .filter((m) => m.metadata?.remote !== true && !/:cloud$|-cloud$/.test(m.model))
            .map((model) => {
              const provider = ai?.providers.find(
                (p) =>
                  p.type === "local" && p.endpoint === runtime.endpoint && p.configured && p.localInferenceConfirmed,
              );
              const selected = profile?.modelId === model.model && profile?.providerId === provider?.id;
              return (
                <div className="local-model-row" key={model.model}>
                  <div>
                    <strong>{model.model}</strong>
                    <p className="muted">
                      Chat ✓ · Vision {model.capabilities?.vision === true ? "✓" : "—"} · Agent tools{" "}
                      {model.supportsTools ? "✓" : "—"}
                    </p>
                  </div>
                  <Button
                    disabled={busy || selected}
                    onClick={() => {
                      if (!provider || !profile) {
                        onSetup();
                        return;
                      }
                      void run(async () => {
                        await core("ai.saveProfile", {
                          ...profile,
                          providerId: provider.id,
                          modelId: model.model,
                          intelligence: { ...intelligenceDefaults, ...profile.intelligence, auto: false },
                        });
                        await refresh();
                        setMessage("Brain selected. Return to Chats to talk to your AI.");
                      });
                    }}
                  >
                    {selected ? "Selected" : "Use"}
                  </Button>
                  {selected && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await core<{ text: string }>("ai.brainTest", { profileId: profile?.id });
                          setMessage(result.text);
                        })
                      }
                    >
                      Test model
                    </Button>
                  )}
                </div>
              );
            })}
          {!runtime.models.length && <p>No models installed.</p>}
        </section>
      ))}
      <p className="muted">
        Model removal is not available in ORBIT yet. Manage removal in your runtime. Downloads always require your
        confirmation.
      </p>
      <p role="status">{message}</p>
    </>
  );
}
