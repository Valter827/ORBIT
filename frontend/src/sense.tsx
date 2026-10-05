import { useEffect, useRef, useState } from "react";
import { core, native, errorText } from "./api";
import { Button, ErrorNotice } from "./components";
import type { AIState } from "./ai-types";

type WindowChoice = { id: string; title: string; application?: string; foreground?: boolean };
type Choices = { windows: WindowChoice[]; displays: WindowChoice[]; voiceAvailable?: boolean };
type Session = { sessionId: number; profileId: string; scope: string; target: WindowChoice };
type Snapshot = {
  capturedAt: number;
  visibleText: string;
  ocrText: string;
  ocrStatus: string;
  image: string | null;
  warnings: string[];
  nodes: { name: string; role: string; focused: boolean }[];
};
type Answer = { text: string; model: string; path: string; sources: string[]; warnings: string[] };
const command = <T,>(action: string, params: unknown = {}) => native<T>("sense_command", { action, params });

export function SensePanel({
  ai,
  refresh,
  initialQuestion,
}: {
  ai: AIState;
  refresh: () => Promise<void>;
  initialQuestion: string;
}) {
  const profile = ai.profiles.find((p) => p.id === ai.selected)!;
  const provider = ai.providers.find((p) => p.id === profile.providerId);
  const [choices, setChoices] = useState<Choices>({ windows: [], displays: [] });
  const [scope, setScope] = useState("current-window");
  const [targetId, setTargetId] = useState("");
  const [session, setSession] = useState<Session>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [answer, setAnswer] = useState<Answer>();
  const [question, setQuestion] = useState(initialQuestion || "What am I looking at?");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [includeImage, setIncludeImage] = useState(false);
  const [acknowledged, setAcknowledged] = useState("");
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem("orbit-sense-onboarding") === "1");
  const generation = useRef(0);
  const destination = JSON.stringify([provider?.id, provider?.type, provider?.endpoint, profile.modelId, scope]);
  const selectedModel = provider?.models.find((model) => model.model === profile.modelId);
  const remote =
    provider?.type !== "local" ||
    !provider.localInferenceConfirmed ||
    selectedModel?.metadata?.["remote"] === true ||
    /:cloud$|-cloud$/.test(profile.modelId);
  const stop = () => {
    generation.current++;
    setSession(undefined);
    setSnapshot(undefined);
    setAnswer(undefined);
    setBusy("");
    setAcknowledged("");
    void command("stop").catch(() => {});
  };
  useEffect(() => {
    setQuestion(initialQuestion || "What am I looking at?");
    generation.current++;
    setSession(undefined);
    setSnapshot(undefined);
    setAnswer(undefined);
    setAcknowledged("");
    setBusy("");
    void command("stop").catch(() => {});
    return () => {
      generation.current++;
      void command("stop").catch(() => {});
    };
  }, [
    ai.selected,
    ai.localOnly,
    profile.providerId,
    profile.modelId,
    provider?.endpoint,
    profile.senseEnabled,
    initialQuestion,
  ]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  const run = async (label: string, work: (current: () => boolean) => Promise<void>) => {
    const token = generation.current;
    setBusy(label);
    setError("");
    try {
      await work(() => generation.current === token);
    } catch (e) {
      if (generation.current === token) {
        setError(errorText(e));
        void refresh().catch(() => {});
      }
    } finally {
      if (generation.current === token) setBusy("");
    }
  };
  const refreshWindows = () =>
    run("Finding visible windows…", async (current) => {
      const result = await command<Choices>("windows");
      if (current()) {
        setChoices(result);
        setTargetId(
          (scope === "display" ? result.displays[0] : (result.windows.find((w) => w.foreground) ?? result.windows[0]))
            ?.id ?? "",
        );
      }
    });
  const capture = (active: Session) =>
    run("Reading visible text…", async (current) => {
      setSnapshot(undefined);
      setAnswer(undefined);
      const result = await command<Snapshot>("capture", { sessionId: active.sessionId, snapshot: includeImage });
      if (current()) {
        setSnapshot(result);
        setAnswer(undefined);
      }
    });
  const share = () =>
    run("Starting one-time sharing…", async (current) => {
      const result = await command<Session>("start", { profileId: profile.id, scope, targetId });
      if (current()) {
        setSession(result);
        setSnapshot(undefined);
        setAnswer(undefined);
        setAcknowledged("");
      }
    });
  const ask = () =>
    run("Analyzing with " + profile.name + "…", async (current) => {
      const result = await command<Answer>("ask", {
        sessionId: session?.sessionId,
        question,
        acknowledgedDestination: acknowledged,
        includeImage,
      });
      if (current()) setAnswer(result);
    });
  const selected = scope === "display" ? choices.displays : choices.windows;
  return (
    <section className="sense-panel card" aria-label="ORBIT Sense">
      <header className="sense-heading">
        <div>
          <span className="pill">ORBIT Sense</span>
          <h2>{profile.name} · See and understand</h2>
        </div>
        <span>One-time snapshot · No computer actions</span>
      </header>
      {!onboarded && (
        <section className="sense-onboarding">
          <h3>Give your AI eyes — on your terms</h3>
          <p>
            Choose a window, application window or display. Nothing is captured until you press Read shared window. Stop
            clears the snapshot. Cloud analysis needs separate consent.
          </p>
          <Button
            onClick={() => {
              localStorage.setItem("orbit-sense-onboarding", "1");
              setOnboarded(true);
            }}
          >
            Continue
          </Button>
        </section>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={!!profile.senseEnabled}
          disabled={!!busy}
          onChange={(e) => {
            const enabled = e.target.checked;
            stop();
            void run("Saving capability…", async () => {
              await core("ai.saveProfile", { ...profile, senseEnabled: enabled });
              await refresh();
            });
          }}
        />
        Enable Sense for {profile.name}
      </label>
      <p className="muted">
        Screen contents stay temporary. Sense reads and advises; it cannot click, type, scroll or launch applications.
      </p>
      {onboarded && profile.senseEnabled && (
        <>
          {session ? (
            <div className="sense-indicator" role="status">
              <strong>
                {profile.name} can use this shared snapshot · {session.target.title}
              </strong>
              <Button onClick={stop}>Stop sharing</Button>
            </div>
          ) : (
            <div className="sense-controls">
              <label>
                Sharing scope
                <select
                  aria-label="Sharing scope"
                  value={scope}
                  disabled={!!busy}
                  onChange={(e) => {
                    setScope(e.target.value);
                    setTargetId("");
                    setAcknowledged("");
                  }}
                >
                  <option value="current-window">Current window</option>
                  <option value="application">Selected application window</option>
                  <option value="display">Entire display</option>
                </select>
              </label>
              <Button disabled={!!busy} onClick={() => void refreshWindows()}>
                Choose visible window / display
              </Button>
              <label>
                Share target
                <select
                  aria-label="Share target"
                  value={targetId}
                  disabled={!!busy}
                  onChange={(e) => setTargetId(e.target.value)}
                >
                  <option value="">Choose a target…</option>
                  {selected.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.application ? w.application + " — " : ""}
                      {w.title}
                    </option>
                  ))}
                </select>
              </label>
              {scope === "display" && (
                <p>Entire display may include other applications and notifications. Review it before sending.</p>
              )}
              <Button disabled={!!busy || !targetId} onClick={() => void share()}>
                Share selected scope
              </Button>
            </div>
          )}
          {session && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={includeImage}
                  disabled={!!busy}
                  onChange={(e) => {
                    setIncludeImage(e.target.checked);
                    setAcknowledged("");
                    setSnapshot(undefined);
                  }}
                />
                Include an image snapshot if the model supports vision. Review what is visible first.
              </label>
              <Button disabled={!!busy} onClick={() => void capture(session)}>
                {snapshot ? "Refresh shared snapshot" : "Read shared window"}
              </Button>
              {snapshot && (
                <section className="sense-context">
                  <p>
                    Last updated: {new Date(snapshot.capturedAt).toLocaleTimeString()} · Accessibility first · OCR:{" "}
                    {snapshot.ocrStatus}
                  </p>
                  {snapshot.warnings.map((warning, i) => (
                    <p key={i} role="status">
                      {warning}
                    </p>
                  ))}
                  <details>
                    <summary>Visible text and accessibility ({snapshot.nodes.length} controls)</summary>
                    <pre>{snapshot.visibleText || "No accessibility text found."}</pre>
                    <pre>{snapshot.ocrText}</pre>
                  </details>
                  {snapshot.image && includeImage && (
                    <details>
                      <summary>Review ephemeral image</summary>
                      <img alt="Shared window snapshot" src={"data:image/jpeg;base64," + snapshot.image} />
                    </details>
                  )}
                  <p>
                    Knowledge and enabled profile memory may supplement the answer. Screen text is never automatically
                    saved as memory.
                  </p>
                </section>
              )}
              {remote && (
                <section className="sense-disclosure">
                  <p>
                    This request will send the reviewed screen context to{" "}
                    <strong>{provider?.name ?? "the selected provider"}</strong>
                    {provider?.endpoint ? " · " + provider.endpoint : ""}.
                  </p>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={acknowledged === destination}
                      onChange={(e) => setAcknowledged(e.target.checked ? destination : "")}
                    />
                    I understand and allow this provider to receive this scope.
                  </label>
                </section>
              )}
              {ai.localOnly && (
                <p role="status">LOCAL ONLY: remote screen analysis is blocked. An approved local model is required.</p>
              )}
              <label>
                Ask about this screen
                <textarea
                  id="sense-request"
                  value={question}
                  maxLength={5000}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="What do you want your AI to inspect?"
                />
              </label>
              <div className="sense-actions">
                <Button
                  disabled={
                    !!busy ||
                    !snapshot ||
                    !question.trim() ||
                    (remote && (acknowledged !== destination || ai.localOnly))
                  }
                  onClick={() => void ask()}
                >
                  Ask {profile.name}
                </Button>
                <Button
                  disabled={!!busy || choices.voiceAvailable === false}
                  onClick={() =>
                    void run("Microphone on · listening for up to 8 seconds…", async (current) => {
                      const result = await command<{ text: string; confidence: number }>("voice", {
                        sessionId: session.sessionId,
                      });
                      if (current()) {
                        setQuestion(result.text);
                        if (result.confidence < 0.6)
                          setError("Speech recognition is uncertain. Review the text before sending.");
                      }
                    })
                  }
                >
                  Click to speak
                </Button>
                {choices.voiceAvailable === false && (
                  <small>Offline Windows speech recognition is not installed. Type your question.</small>
                )}
              </div>
              <div className="sense-examples">
                {[
                  "What am I looking at?",
                  "Answer the question on this screen.",
                  "Explain this error.",
                  "What should I click next?",
                ].map((example) => (
                  <Button key={example} disabled={!!busy} onClick={() => setQuestion(example)}>
                    {example}
                  </Button>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {busy && (
        <p role="status">
          {busy} <Button onClick={stop}>Stop</Button>
        </p>
      )}
      {error && <ErrorNotice details={error} />}
      {answer && (
        <article className="sense-answer">
          <h3>{profile.name}</h3>
          <p className="sense-answer-text">{answer.text}</p>
          <small>
            {answer.model} ·{" "}
            {answer.path === "vision" ? "Image + extracted context" : "Extracted text context; no image understanding"}
          </small>
          <p>Observed from: {[...new Set(answer.sources)].join(" · ")}</p>
        </article>
      )}
    </section>
  );
}
