import { intelligenceDefaults } from "./ai-types";
import { ProvidersPanel } from "./providers";
import { useState, useEffect } from "react";
import { core, errorText } from "./api";
import { Button, Modal, Logo, Icon, LoadingState } from "./components";
import { KnowledgePanel } from "./knowledge";
import {
  capabilityLabels,
  skillNames,
  type Profile,
  type AIState,
  type Capability,
  type Model,
  type Personality,
} from "./ai-types";
const steps = [
  "Identity",
  "Purpose",
  "Personality",
  "Brain",
  "Knowledge",
  "Memory",
  "Skills & Tools",
  "Permissions",
  "Test",
  "Create",
];
const purposes = [
  "Programming",
  "Study",
  "Writing",
  "Research",
  "Work",
  "Personal assistant",
  "Gaming",
  "Creative work",
  "Business",
  "Other",
];
export function AIWizard({
  initial,
  state,
  onClose,
  onSaved,
}: {
  initial: Profile;
  state: AIState;
  onClose: () => void;
  onSaved: (profile: Profile) => Promise<void>;
}) {
  const [connections, setConnections] = useState(state);
  const [draft, setDraft] = useState<Profile>(structuredClone(initial)),
    [step, setStep] = useState(0),
    [advanced, setAdvanced] = useState(false),
    [models, setModels] = useState<Model[]>(
      connections.providers.find((p) => p.id === initial.providerId)?.models ?? [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [question, setQuestion] = useState("Introduce yourself and explain how you can help."),
    [answer, setAnswer] = useState<{
      text: string;
      model: string;
      knowledge: { strategy: string; sources: Array<{ name: string }> };
      memory: Array<{ category: string }>;
    }>(),
    [savedDraft, setSavedDraft] = useState(state.profiles.some((p) => p.id === initial.id)),
    [workflowName, setWorkflowName] = useState("Review my project"),
    [workflowSteps, setWorkflowSteps] = useState(
      "Read project structure\nRun configured tests\nInspect failures\nProduce a report",
    );
  const [knowledgeCount, setKnowledgeCount] = useState(state.knowledgeCounts?.[initial.id] ?? 0);
  const [created, setCreated] = useState<Profile>();
  useEffect(() => {
    document.querySelector(".wizard-body")?.scrollTo(0, 0);
  }, [step]);
  const run = async (fn: () => Promise<unknown>) => {
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
  const saveDraft = async () => {
    await core("ai.saveProfile", { ...draft, isDraft: true });
    setSavedDraft(true);
  };
  const provider = connections.providers.find((p) => p.id === draft.providerId),
    model = models.find((m) => m.model === draft.modelId);
  const generate = () =>
    setDraft({
      ...draft,
      systemPrompt: `You are ${draft.name}, an assistant for ${draft.purposes.join(", ") || "the user's tasks"}. ${draft.goal}\nUse clear, accurate explanations. Say when evidence is missing. Explain proposed actions and respect the user's approvals.`,
    });
  const template = (purpose: string) =>
    setDraft({
      ...draft,
      purposes: purpose === "Blank AI" ? [] : [purpose],
      description: purpose === "Blank AI" ? "My AI assistant" : purpose + " assistant",
      goal: "",
      personality: purpose === "Study" ? "Teacher" : "Balanced",
      capabilities: purpose === "Programming" ? ["read", "search", "tests", "gitRead"] : ["read", "search"],
      skills: purpose === "Study" ? ["study-tutor"] : purpose === "Writing" ? ["summarizer"] : [],
    });
  if (created)
    return (
      <Modal title={"Meet " + created.name}>
        <div className="creation-success">
          <Icon name={created.icon} size={44} />
          <h2>{created.name} is yours.</h2>
          <p>{created.description}</p>
          <p className="muted">
            {created.modelId
              ? "Your assistant is saved. Start a conversation when you are ready."
              : "Your assistant is saved. Connect a brain in Settings before chatting."}
          </p>
        </div>
        {error && <p role="alert">{error}</p>}
        <Button variant="primary" disabled={busy} onClick={() => void run(() => onSaved(created))}>
          Start chatting
        </Button>
      </Modal>
    );
  return (
    <Modal title={"Create My AI · " + steps[step]}>
      <div className="wizard-progress">
        <span>
          {step + 1} / 10 · {steps[step]}
        </span>
        <progress max={10} value={step + 1} />
      </div>
      <div className="wizard-layout">
        <div className="wizard-body">
          {step === 0 && (
            <>
              <h3>What should your AI be called?</h3>
              <label>
                Name
                <input
                  value={draft.name}
                  maxLength={60}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                Description
                <input
                  value={draft.description}
                  maxLength={300}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </label>
              <label>
                Icon
                <select
                  aria-label="Icon"
                  value={draft.icon}
                  onChange={(e) => setDraft({ ...draft, icon: e.target.value as Profile["icon"] })}
                >
                  {["orbit", "star", "code", "book"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <p className="muted">Any language is welcome. Your AI has its own identity, separate from its model.</p>
              <h3>Start with a template</h3>
              <div className="template-grid">
                {["Programming", "Study", "Research", "Writing", "Personal assistant", "Blank AI"].map((p) => (
                  <Button key={p} onClick={() => template(p)}>
                    {p}
                  </Button>
                ))}
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <h3>What should {draft.name} help you with?</h3>
              <div className="template-grid">
                {purposes.map((p) => (
                  <label className="check" key={p}>
                    <input
                      type="checkbox"
                      checked={draft.purposes.includes(p)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          purposes: e.target.checked ? [...draft.purposes, p] : draft.purposes.filter((v) => v !== p),
                        })
                      }
                    />
                    <Icon name={p === "Programming" ? "code" : p === "Study" || p === "Research" ? "book" : "star"} />
                    {p}
                  </label>
                ))}
              </div>
              <label>
                Tell us what you want your AI to do
                <textarea
                  maxLength={4000}
                  value={draft.goal}
                  onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
                  placeholder="Help me build applications, explain code and find bugs."
                />
              </label>
            </>
          )}
          {step === 2 && (
            <>
              <label>
                Personality
                <select
                  aria-label="Personality"
                  value={draft.personality}
                  onChange={(e) => setDraft({ ...draft, personality: e.target.value as Personality })}
                >
                  {[
                    "Balanced",
                    "Friendly",
                    "Professional",
                    "Teacher",
                    "Concise",
                    "Creative",
                    "Technical",
                    "Custom",
                    "Programmer",
                  ].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              {(["length", "creativity", "initiative", "explanation"] as const).map((key) => (
                <label className="trait-slider" key={key}>
                  {
                    {
                      length: "Response length · Short → Detailed",
                      creativity: "Creativity · Precise → Creative",
                      initiative: "Initiative · Wait → Suggest next steps",
                      explanation: "Explanation · Simple → Technical",
                    }[key]
                  }
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={draft.traits[key]}
                    onChange={(e) => setDraft({ ...draft, traits: { ...draft.traits, [key]: Number(e.target.value) } })}
                  />
                </label>
              ))}
              <p className="personality-summary" aria-live="polite">
                {draft.name || "Your AI"} gives{" "}
                {draft.traits.length < 35 ? "short" : draft.traits.length > 65 ? "detailed" : "balanced"} answers,{" "}
                {draft.traits.creativity > 60 ? "explores creative ideas" : "focuses on precision"},{" "}
                {draft.traits.initiative > 60 ? "suggests next steps" : "follows your lead"}, and uses{" "}
                {draft.traits.explanation > 60 ? "technical" : "plain-language"} explanations.
              </p>
              <Button onClick={() => setAdvanced(!advanced)}>
                {advanced ? "Basic mode" : "Edit advanced instructions"}
              </Button>
              {advanced && (
                <>
                  <Button onClick={generate}>Generate editable instructions</Button>
                  <label>
                    System instructions
                    <textarea
                      className="prompt-editor"
                      value={draft.systemPrompt}
                      maxLength={24000}
                      onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
                    />
                  </label>
                  <label>
                    Extra instructions
                    <textarea
                      value={draft.instructions}
                      maxLength={12000}
                      onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
                    />
                  </label>
                </>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <h3>Choose {draft.name}'s brain</h3>
              <p className="muted">
                Cloud AI may send your question and relevant knowledge to the selected provider. Local AI uses a
                separately installed local runtime. Connect a brain below or choose one already configured.
              </p>
              <div className="template-grid">
                {(["cloud", "local"] as const).map((kind) => (
                  <button
                    type="button"
                    className="brain-card"
                    key={kind}
                    aria-pressed={
                      kind === "local" ? provider?.type === "local" : !!provider && provider.type !== "local"
                    }
                    onClick={() => {
                      const match = connections.providers.find((p) =>
                        kind === "local" ? p.type === "local" : p.type !== "local",
                      );
                      if (match) {
                        setDraft({ ...draft, providerId: match.id, modelId: "" });
                        setModels(match.models);
                      } else setError("Connect a " + kind + " brain below first.");
                    }}
                  >
                    <Icon name={kind} />
                    <strong>{kind === "local" ? "Local AI" : "Cloud AI"}</strong>
                    <span>
                      {kind === "local"
                        ? "Runs through a local runtime on your PC."
                        : "Sends selected context to your cloud provider."}
                    </span>
                  </button>
                ))}
              </div>
              <details>
                <summary>Connect or manage a brain</summary>
                <ProvidersPanel refresh={async () => setConnections(await core<AIState>("ai.state"))} />
              </details>
              <label>
                Provider
                <select
                  aria-label="Provider"
                  value={draft.providerId}
                  onChange={(e) => {
                    setDraft({ ...draft, providerId: e.target.value, modelId: "" });
                    setModels(connections.providers.find((p) => p.id === e.target.value)?.models ?? []);
                  }}
                >
                  {connections.providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.type === "local" ? "Local AI" : "Cloud AI"}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () =>
                    setModels(await core<Model[]>("ai.models", { providerId: draft.providerId, refresh: true })),
                  )
                }
              >
                Refresh available models
              </Button>
              <label>
                Model
                <select
                  aria-label="Model"
                  value={draft.modelId}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      modelId: e.target.value,
                      intelligence: { ...intelligenceDefaults, ...draft.intelligence, auto: false },
                    })
                  }
                >
                  <option value="">Choose later</option>
                  {draft.modelId && !models.some((m) => m.model === draft.modelId) && (
                    <option value={draft.modelId}>{draft.modelId} · not verified this session</option>
                  )}
                  {models.map((m) => (
                    <option key={m.model} value={m.model}>
                      {m.displayName ?? m.model}
                    </option>
                  ))}
                </select>
              </label>
              {model && (
                <table className="capability-table">
                  <tbody>
                    {[
                      ["Chat", model.capabilities?.text],
                      ["Streaming", model.capabilities?.streaming],
                      ["Agent tools", model.capabilities?.toolCalling],
                      ["Structured output", model.capabilities?.structuredOutput],
                      ["Vision", model.capabilities?.vision],
                      ["Local endpoint", provider?.type === "local"],
                    ].map(([label, value]) => (
                      <tr key={String(label)}>
                        <td>{label}</td>
                        <td>{value === true ? "Supported" : value === false ? "Not supported" : "Unknown"}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>Context window</td>
                      <td>{model.capabilities?.contextWindow?.toLocaleString() ?? "Unknown"}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {!model?.supportsTools && draft.modelId && (
                <p className="notice">
                  Agent Mode is unavailable until the model's tool support is confirmed. Your AI, knowledge and memory
                  stay intact when you change the brain.
                </p>
              )}
            </>
          )}
          {step === 4 && (
            <>
              <p className="muted">Optional. Adding knowledge saves a recoverable draft of this AI.</p>
              <KnowledgePanel profileId={draft.id} beforeAdd={saveDraft} onCount={setKnowledgeCount} />
            </>
          )}
          {step === 5 && (
            <>
              <h3>What may {draft.name} remember?</h3>
              {(["conversation", "user", "project", "shared"] as const).map((key) => (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    checked={draft.memory[key]}
                    onChange={(e) => setDraft({ ...draft, memory: { ...draft.memory, [key]: e.target.checked } })}
                  />
                  {
                    {
                      conversation: "Conversation history",
                      user: "Private AI memory",
                      project: "Project memory",
                      shared: "Shared user memory — explicit opt-in",
                    }[key]
                  }
                </label>
              ))}
              <p className="muted">
                Permanent memory is saved only when you choose Remember. You can inspect, edit, disable and delete it
                later.
              </p>
            </>
          )}
          {step === 6 && (
            <>
              <h3>Skills</h3>
              <div className="template-grid">
                {Object.entries(skillNames).map(([id, name]) => (
                  <label className="check" key={id}>
                    <input
                      type="checkbox"
                      checked={draft.skills.includes(id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          skills: e.target.checked ? [...draft.skills, id] : draft.skills.filter((s) => s !== id),
                        })
                      }
                    />
                    {name}
                  </label>
                ))}
              </div>
              <p className="muted">
                Skills provide reusable instructions. They do not install code or grant tool access.
              </p>
              <h3>Capabilities</h3>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!draft.senseEnabled}
                  onChange={(e) => setDraft({ ...draft, senseEnabled: e.target.checked })}
                />
                Sense — see and understand a window you explicitly share
              </label>
              <p className="muted">Sense starts off. Enabling the capability does not start screen capture.</p>
              <h3>Tools</h3>
              {(["read", "search", "tests", "gitRead", "write", "terminal"] as Capability[]).map((cap) => (
                <label className="check" key={cap}>
                  <input
                    type="checkbox"
                    checked={draft.capabilities.includes(cap)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        capabilities: e.target.checked
                          ? [...draft.capabilities, cap]
                          : draft.capabilities.filter((c) => c !== cap),
                      })
                    }
                  />
                  {capabilityLabels[cap]}
                </label>
              ))}
              <details>
                <summary>Repeatable workflows</summary>
                <label>
                  Workflow name
                  <input value={workflowName} maxLength={100} onChange={(e) => setWorkflowName(e.target.value)} />
                </label>
                <label>
                  Steps, one per line
                  <textarea value={workflowSteps} onChange={(e) => setWorkflowSteps(e.target.value)} />
                </label>
                <Button
                  disabled={!workflowName.trim() || !workflowSteps.trim() || draft.workflows.length >= 20}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      workflows: [
                        ...draft.workflows,
                        {
                          id: crypto.randomUUID(),
                          name: workflowName,
                          steps: workflowSteps
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .slice(0, 20),
                        },
                      ],
                    })
                  }
                >
                  Add workflow
                </Button>
                {draft.workflows.map((w) => (
                  <article key={w.id}>
                    <strong>{w.name}</strong>
                    <ol>
                      {w.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                    <Button
                      onClick={() => setDraft({ ...draft, workflows: draft.workflows.filter((v) => v.id !== w.id) })}
                    >
                      Remove workflow
                    </Button>
                  </article>
                ))}
              </details>
            </>
          )}
          {step === 7 && (
            <>
              <h3>Your rules, enforced by ORBIT</h3>
              {draft.capabilities.map((cap) => (
                <label key={cap}>
                  {capabilityLabels[cap]}
                  <small className="permission-help">
                    {
                      {
                        read: "Let your AI read files in the selected project.",
                        search: "Find relevant text in your project.",
                        tests: "Run your configured checks and read the results.",
                        gitRead: "Inspect changes without modifying Git history.",
                        write: "Propose edits that you review before applying.",
                        terminal: "Run approved commands with your Windows account permissions.",
                        network: "Not available yet.",
                        gitWrite: "Not available yet.",
                      }[cap]
                    }
                  </small>
                  <select
                    aria-label={capabilityLabels[cap] + " permission"}
                    value={draft.permissionPolicy[cap]}
                    onChange={(e) =>
                      setDraft({ ...draft, permissionPolicy: { ...draft.permissionPolicy, [cap]: e.target.value } })
                    }
                  >
                    <option value="disabled">Disabled</option>
                    <option value="ask">Ask every time</option>
                    <option value="task">Allow for task after approval</option>
                    <option value="always">Always allow where policy permits, after approval</option>
                  </select>
                </label>
              ))}
              <p className="notice">
                ORBIT's workspace, risk and secret restrictions always apply. AI instructions cannot bypass them.
                Terminal commands run with your Windows account permissions.
              </p>
            </>
          )}
          {step === 8 && (
            <>
              <h3>Test {draft.name}</h3>
              <p className="muted">
                Preview sends a real request to your selected brain, with relevant knowledge and enabled memory. Preview
                does not execute tools or save the exchange.
              </p>
              <label>
                Test question
                <textarea
                  aria-label="Test question"
                  value={question}
                  maxLength={5000}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </label>
              <Button
                disabled={busy || !draft.modelId || !question.trim()}
                onClick={() => void run(async () => setAnswer(await core("ai.preview", { profile: draft, question })))}
              >
                Test my AI
              </Button>
              {busy && <Button onClick={() => void core("chat.stop")}>Stop preview</Button>}
              {!draft.modelId && <p>Choose a brain to test, or create now and connect later.</p>}
              {answer && (
                <article className="card">
                  <p className="preview-answer">{answer.text}</p>
                  <p>Brain: {answer.model}</p>
                  <p>
                    Knowledge used ({answer.knowledge.strategy}):{" "}
                    {answer.knowledge.sources.map((s) => s.name).join(", ") || "None"}
                  </p>
                  <p>Memory used: {answer.memory.map((m) => m.category).join(", ") || "None"}</p>
                  <p>Tools executed: none</p>
                </article>
              )}
            </>
          )}
          {step === 9 && (
            <>
              <h3>Meet {draft.name}</h3>
              <p>{draft.description}</p>
              <p>{draft.purposes.join(" · ")}</p>
              <p>
                Brain: {provider?.name ?? draft.providerId} · {draft.modelId || "Connect later"}
              </p>
              <p>Knowledge: {knowledgeCount + " sources"}</p>
              <p>
                Memory:{" "}
                {Object.entries(draft.memory)
                  .filter(([, v]) => v)
                  .map(([k]) => (k === "user" ? "Private AI" : k))
                  .join(", ") || "Off"}
              </p>
              <p>Tools: {draft.capabilities.map((c) => capabilityLabels[c]).join(", ") || "None"}</p>
              <p>
                {draft.skills.length} skills · {draft.workflows.length} workflows
              </p>
              <p className="muted">
                You are creating an assistant powered by an existing model. No new foundation model is trained.
              </p>
            </>
          )}
          {busy && <LoadingState label={step === 8 ? "Waiting for your AI…" : "Saving your AI…"} />}
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
        </div>
        <aside className="wizard-preview" aria-label="Live AI preview">
          <Logo />
          <small>YOUR AI · LIVE PREVIEW</small>
          <h2>{draft.name || "Your AI"}</h2>
          <p>{draft.description || "Give your assistant a purpose."}</p>
          <dl>
            <dt>Purpose</dt>
            <dd>{draft.purposes.join(", ") || "Choose what it helps with"}</dd>
            <dt>Personality</dt>
            <dd>{draft.personality}</dd>
            <dt>Brain</dt>
            <dd>{draft.modelId || "Connect later"}</dd>
            <dt>Knowledge</dt>
            <dd>{knowledgeCount} sources</dd>
            <dt>Tools</dt>
            <dd>{draft.capabilities.length} selected</dd>
          </dl>
          <p className="muted">You can change these choices later.</p>
        </aside>
      </div>
      <div className="actions wizard-footer">
        <Button disabled={busy} onClick={onClose}>
          {savedDraft ? "Close (draft kept)" : "Cancel"}
        </Button>
        {step > 0 && (
          <Button disabled={busy} onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step < 9 ? (
          <Button disabled={busy || !draft.name.trim()} onClick={() => setStep(step + 1)}>
            Continue
          </Button>
        ) : (
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const p = await core<Profile>("ai.saveProfile", { ...draft, isDraft: false });
                setCreated(p);
              })
            }
          >
            Create AI · Start chatting
          </Button>
        )}
      </div>
    </Modal>
  );
}
