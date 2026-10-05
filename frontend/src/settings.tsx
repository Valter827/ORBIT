import { intelligenceDefaults, type Intelligence } from "./ai-types";
import { profileStatus } from "./ai-types";
import { LocalModels } from "./local-models";
import type { AIState } from "./ai-types";
import { readPreference, writePreference } from "./chat-ui";
import { KnowledgeSettings } from "./knowledge";
import { PrivacyPanel } from "./privacy";
import { ProvidersPanel } from "./providers";
import { useState } from "react";
import { native, core, errorText, type Desktop } from "./api";
import { Logo, Button } from "./components";
export function SettingsPanel({
  desktop,
  aiState,
  section = "General",
  setSection = () => {},
  onNavigate = () => {},
  onLocalSetup = () => {},
  refresh,
  onboarding = false,
  done,
}: {
  desktop: Desktop;
  aiState?: AIState;
  section?: string;
  setSection?: (value: string) => void;
  onNavigate?: (page: string) => void;
  onLocalSetup?: () => void;
  refresh: () => Promise<void>;
  onboarding?: boolean;
  done?: () => void;
}) {
  const [appearance, setAppearance] = useState({
    accent: readPreference("accent", "violet"),
    density: readPreference("density", "comfortable"),
    animations: readPreference("animations", "on"),
    restore: readPreference("restore", "true"),
  });
  const preference = (name: keyof typeof appearance, value: string) => {
    writePreference(name, value);
    setAppearance((v) => ({ ...v, [name]: value }));
    document.documentElement.dataset[name] = value;
  };
  const profile = aiState?.profiles.find((p) => p.id === aiState.selected);
  const intelligence = profile?.intelligence ?? intelligenceDefaults;
  const saveIntelligence = (changes: Partial<Intelligence>) => {
    if (!profile) return;
    void run(async () => {
      await core("ai.saveProfile", { ...profile, intelligence: { ...intelligence, ...changes } });
      await refresh();
    });
  };
  const provider = aiState?.providers.find((p) => p.id === profile?.providerId);
  const [draft, setDraft] = useState(desktop.settings),
    [key, setKey] = useState(""),
    [autostart, setAutostart] = useState(desktop.autostart);
  const [probeResult, setProbeResult] = useState<Record<string, unknown>>();
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [connected, setConnected] = useState(false);
  const change = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((s) => ({ ...s, [key]: value }));
  const save = async (disconnect = false, finish = false) => {
    await native("save_settings", {
      input: {
        model: draft.model,
        verificationCommand: draft.verificationCommand,
        filesEnabled: draft.filesEnabled,
        terminalEnabled: draft.terminalEnabled,
        closeBehavior: draft.closeBehavior,
        notifications: draft.notifications,
        shortcut: draft.shortcut,
        paletteShortcut: draft.paletteShortcut,
        settingsShortcut: draft.settingsShortcut,
        newTaskShortcut: draft.newTaskShortcut,
        onboarding: finish || draft.onboarding,
        autostart,
        apiKey: key || null,
        disconnect,
      },
    });
    setKey("");
    await refresh();
  };
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
  const ai = (
    <>
      <h3>Anthropic</h3>
      <p className="muted">
        {connected
          ? "✓ Connected"
          : desktop.hasKey
            ? "API key stored securely · connection not tested this session"
            : "AI provider not configured."}
      </p>
      <label>
        API key
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          placeholder={desktop.hasKey ? "Leave empty to keep saved key" : "Paste your Anthropic API key"}
          onChange={(e) => {
            setKey(e.target.value);
            setConnected(false);
          }}
        />
      </label>
      <p className="muted">
        Saved in Windows Credential Manager. Never stored in browser storage or plain-text settings.
      </p>
      <p className="muted">Discover and select available models in Settings → AI after setup.</p>
      <label>
        Model
        <select value={draft.model} onChange={(e) => change("model", e.target.value)}>
          <option>{draft.model} · current selection</option>
        </select>
      </label>
      <div className="actions">
        <Button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await save();
              await core("testConnection");
              setConnected(true);
              setMessage("✓ Connected");
            })
          }
        >
          Test connection
        </Button>
        <Button
          disabled={busy || !desktop.hasKey}
          onClick={() =>
            void run(async () => {
              await save(true);
              setConnected(false);
              setMessage("Disconnected");
            })
          }
        >
          Disconnect
        </Button>
      </div>
      <p className="muted">The connection test sends a small request to Anthropic and may incur API usage.</p>
    </>
  );
  const permissions = (
    <>
      <h3>Permissions</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={draft.filesEnabled}
          onChange={(e) => change("filesEnabled", e.target.checked)}
        />
        Files
      </label>
      <p className="muted">
        Access is limited to your selected project. Every agent change requires a diff review and permission.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={draft.terminalEnabled}
          onChange={(e) => change("terminalEnabled", e.target.checked)}
        />
        Terminal
      </label>
      <p className="muted">
        Commands require approval and run with your Windows account permissions. Project scripts can access resources
        outside the project; this is not an OS sandbox.
      </p>
      <p>Git automation — coming later. Direct Git integration is disabled.</p>
    </>
  );
  if (onboarding)
    return (
      <div className="onboarding">
        <div className="brand">
          <Logo />
          <span className="wordmark">ORBIT</span>
        </div>
        <small>SETUP · {step + 1} OF 6</small>
        {step === 0 && (
          <>
            <h1>Your computer, understood.</h1>
            <p>Meet your personal AI agent. Review its plan, approve each change, and stay in control.</p>
            <p className="muted">
              Closing ORBIT exits by default. If a task is active, ORBIT asks before stopping it. You can enable tray
              mode in Settings.
            </p>
          </>
        )}
        {step === 1 && (
          <>
            <h1>Connect AI</h1>
            <p>Choose a provider.</p>
            <button className="provider selected">
              Anthropic <span>Available</span>
            </button>
            <button className="provider" disabled>
              OpenAI <span>Coming later</span>
            </button>
            <button className="provider" disabled>
              Local <span>Configure in Settings after setup</span>
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <h1>Your API key</h1>
            {ai}
            <p className="muted">
              You can continue without a key and connect later. Projects, history and settings work offline.
            </p>
          </>
        )}
        {step === 3 && (
          <>
            <h1>Choose Workspace</h1>
            <p className="path">{desktop.settings.workspace ?? "No project selected"}</p>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await native("choose_project");
                  await refresh();
                })
              }
            >
              Select Folder
            </Button>
          </>
        )}
        {step === 4 && permissions}
        {step === 5 && (
          <>
            <h1>ORBIT is ready.</h1>
            <p>Select a task, review the plan and approve the actions you want ORBIT to take.</p>
            <p className="muted">
              {desktop.hasKey ? "Your key is stored securely." : "Connect AI in Settings before running an agent."}
            </p>
          </>
        )}
        {message && <p role="status">{message}</p>}
        <div className="actions">
          {step > 0 && (
            <Button disabled={busy} onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button
            disabled={busy || (step === 3 && !desktop.settings.workspace)}
            onClick={() =>
              void run(async () => {
                if (step === 2 || step === 4) await save();
                if (step === 5) {
                  await save(false, true);
                  done?.();
                } else setStep(step + 1);
              })
            }
          >
            {step === 0 ? "Get Started" : step === 5 ? "Start using ORBIT" : "Continue"}
          </Button>
        </div>
      </div>
    );
  const sections = [
    "General",
    "Appearance",
    "AI & Models",
    "Local AI",
    "Sense",
    "Agent & Permissions",
    "Knowledge & Memory",
    "Shortcuts",
    "Privacy & Data",
    "Advanced",
    "About",
  ];
  return (
    <div className="settings">
      <h1>Settings</h1>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map((name) => (
            <button key={name} aria-current={section === name ? "page" : undefined} onClick={() => setSection(name)}>
              {name}
            </button>
          ))}
        </nav>
        <section className="settings-content">
          <h2>{section}</h2>
          {section === "General" && (
            <>
              <label>
                Current AI
                <select
                  value={aiState?.selected ?? ""}
                  onChange={(e) =>
                    void run(async () => {
                      await core("ai.select", { id: e.target.value });
                      await refresh();
                    })
                  }
                >
                  {aiState?.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">ORBIT opens in Chat with your selected AI.</p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={appearance.restore === "true"}
                  onChange={(e) => preference("restore", String(e.target.checked))}
                />
                Restore last conversation
              </label>
              <label>
                When closing ORBIT
                <select
                  value={draft.closeBehavior}
                  onChange={(e) => change("closeBehavior", e.target.value as "exit" | "tray")}
                >
                  <option value="exit">Exit application</option>
                  <option value="tray">Minimize to tray</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={autostart} onChange={(e) => setAutostart(e.target.checked)} />
                Launch ORBIT when Windows starts
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.notifications}
                  onChange={(e) => change("notifications", e.target.checked)}
                />
                Native notifications
              </label>
              <p>Interface language: English. You can chat in your preferred language.</p>
            </>
          )}
          {section === "Appearance" && (
            <>
              <p>Theme: ORBIT Dark</p>
              <label>
                Accent
                <select value={appearance.accent} onChange={(e) => preference("accent", e.target.value)}>
                  <option value="violet">ORBIT Violet</option>
                  <option value="blue">Blue</option>
                  <option value="neutral">Neutral</option>
                </select>
              </label>
              <label>
                Interface density
                <select value={appearance.density} onChange={(e) => preference("density", e.target.value)}>
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={appearance.animations === "on"}
                  onChange={(e) => preference("animations", e.target.checked ? "on" : "off")}
                />
                Animations
              </label>
              <p className="muted">
                Reduced motion in Windows is always respected. Sidebar size is remembered automatically.
              </p>
            </>
          )}
          {section === "AI & Models" && (
            <>
              <section className="card">
                <h3>Smart Brain</h3>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={intelligence.auto}
                    disabled={busy || !profile}
                    onChange={(e) => saveIntelligence({ auto: e.target.checked })}
                  />
                  Auto brain
                </label>
                {(["local", "anthropic", "compatible"] as const).map((key) => (
                  <label className="check" key={key}>
                    <input
                      type="checkbox"
                      checked={intelligence[key]}
                      disabled={busy || !profile}
                      onChange={(e) => saveIntelligence({ [key]: e.target.checked })}
                    />
                    {{ local: "Local models", anthropic: "Anthropic", compatible: "Compatible remote providers" }[key]}
                  </label>
                ))}
                <label>
                  Preference
                  <select
                    value={intelligence.preference}
                    disabled={busy || !profile}
                    onChange={(e) => saveIntelligence({ preference: e.target.value as Intelligence["preference"] })}
                  >
                    <option value="balanced">Balanced</option>
                    <option value="speed">Prefer speed</option>
                    <option value="quality">Prefer quality</option>
                  </select>
                </label>
                <details>
                  <summary>Capability Tests</summary>
                  <p>
                    Runs sequential technical probes on the selected model. Cloud models may incur costs. No OS tool is
                    executed.
                  </p>
                  <Button
                    disabled={busy || !profile}
                    onClick={() =>
                      void run(async () => {
                        setProbeResult(
                          await core<Record<string, unknown>>("ai.capabilityTest", {
                            profileId: profile?.id,
                            force: true,
                          }),
                        );
                      })
                    }
                  >
                    Run capability tests
                  </Button>
                  {probeResult && (
                    <dl>
                      {Object.entries(probeResult)
                        .filter(([key]) => !["identity"].includes(key))
                        .map(([key, value]) => (
                          <div key={key}>
                            <dt>{key}</dt>
                            <dd>{String(value)}</dd>
                          </div>
                        ))}
                    </dl>
                  )}
                </details>
                <small>Current brain</small>
                <h3>{profile?.builtin ? "COSMO 1.0" : profile?.name}</h3>
                <p role="status">{aiState && profileStatus(aiState, aiState.selected)}</p>
                <p>
                  {provider?.type === "local" ? "Local" : "Cloud"} · {profile?.modelId || "Needs a brain"}
                </p>
                <div className="actions">
                  <Button onClick={onLocalSetup}>Set Up Local AI</Button>
                  <Button onClick={() => onNavigate("My AIs")}>Change brain</Button>
                  <Button
                    disabled={!profile?.modelId || busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await core<{ text: string }>("ai.brainTest", { profileId: profile?.id });
                        setMessage(result.text);
                      })
                    }
                  >
                    Test model
                  </Button>
                </div>
              </section>
              <details>
                <summary>Manage cloud and advanced providers</summary>
                <ProvidersPanel refresh={refresh} />
              </details>
              <h3>Providers</h3>
              {aiState?.providers.map((p) => (
                <section className="provider-summary" key={p.id}>
                  <strong>{p.name}</strong>
                  <span>{p.configured ? "Configured" : "Not configured"}</span>
                </section>
              ))}
            </>
          )}
          {section === "Local AI" && <LocalModels ai={aiState} refresh={refresh} onSetup={onLocalSetup} />}
          {section === "Sense" && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!profile?.senseEnabled}
                  disabled={!profile || busy}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    void run(async () => {
                      await core("ai.saveProfile", { ...profile, senseEnabled: enabled });
                      await refresh();
                    });
                  }}
                />
                Enable Sense for {profile?.name}
              </label>
              <p>
                Choose a window or display each time you start sharing. Sharing is always visible and can be stopped
                immediately.
              </p>
              <p>
                Image sharing is opt-in when your model supports vision. Remote screen context requires confirmation for
                the selected destination.
              </p>
              <p className="muted">Screen captures are ephemeral. Enabling Sense does not start capture.</p>
              <Button
                onClick={() => {
                  onNavigate("Home");
                  window.dispatchEvent(new Event("orbit-open-sense"));
                }}
              >
                Open Sense
              </Button>
            </>
          )}
          {section === "Agent & Permissions" && (
            <>
              {permissions}
              <p>
                Profile-specific tool permissions remain available in My AIs. Mandatory security boundaries cannot be
                disabled.
              </p>
              <Button onClick={() => onNavigate("My AIs")}>Edit AI tool permissions</Button>
            </>
          )}
          {section === "Knowledge & Memory" && (
            <>
              <p>
                Give your AI information it can use. Memory is private to this AI unless you explicitly enable sharing.
              </p>
              {profile &&
                (["conversation", "user", "project", "shared"] as const).map((key, i) => (
                  <label className="check" key={key}>
                    <input
                      type="checkbox"
                      checked={profile.memory[key]}
                      disabled={busy}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        void run(async () => {
                          await core("ai.saveProfile", { ...profile, memory: { ...profile.memory, [key]: enabled } });
                          await refresh();
                        });
                      }}
                    />
                    {["Conversation memory", "Private AI memory", "Project memory", "Shared memory"][i]}
                  </label>
                ))}
              {profile && (
                <>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={profile.memory.suggestions ?? true}
                      disabled={busy}
                      onChange={(e) => {
                        const suggestions = e.target.checked;
                        void run(async () => {
                          await core("ai.saveProfile", { ...profile, memory: { ...profile.memory, suggestions } });
                          await refresh();
                        });
                      }}
                    />
                    Memory Suggestions
                  </label>
                  <p>
                    Permanent automatic storage is off by default. Explicit Remember commands still produce a reviewable
                    suggestion.
                  </p>
                  {(["preference", "decision", "goal", "task"] as const).map((kind) => (
                    <label className="check" key={kind}>
                      <input
                        type="checkbox"
                        checked={profile.memory.automatic?.includes(kind) ?? false}
                        disabled={busy}
                        onChange={(e) => {
                          const automatic = e.target.checked
                            ? [...(profile.memory.automatic ?? []), kind]
                            : (profile.memory.automatic ?? []).filter((t) => t !== kind);
                          void run(async () => {
                            await core("ai.saveProfile", { ...profile, memory: { ...profile.memory, automatic } });
                            await refresh();
                          });
                        }}
                      />
                      Automatically remember {kind}s
                    </label>
                  ))}
                  <p className="muted">
                    Automatic storage covers only clear, safe user statements. Conflicts still require review. Shared
                    memories and personal facts are never saved automatically.
                  </p>
                </>
              )}
              <div className="actions">
                <Button onClick={() => onNavigate("Knowledge")}>Open Knowledge</Button>
                <Button onClick={() => onNavigate("Memory")}>Manage memories</Button>
              </div>
            </>
          )}
          {section === "Shortcuts" && (
            <>
              <label>
                Quick Ask
                <input value={draft.shortcut} onChange={(e) => change("shortcut", e.target.value)} />
              </label>
              {(["paletteShortcut", "settingsShortcut", "newTaskShortcut"] as const).map((field, i) => (
                <label key={field}>
                  {["Command palette", "Settings", "New chat"][i]}
                  <input value={draft[field]} onChange={(e) => change(field, e.target.value)} />
                </label>
              ))}
              <p>
                Enter sends a message. Shift+Enter adds a line. Escape closes dialogs. Shortcut conflicts are checked
                when saving.
              </p>
            </>
          )}
          {section === "Privacy & Data" && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={aiState?.localOnly ?? false}
                  disabled={busy}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    void run(async () => {
                      await core("ai.localOnly", { enabled });
                      await refresh();
                    });
                  }}
                />
                Local Only Mode
              </label>
              <p>
                Local Only prevents inference through cloud providers. With cloud enabled, your message and selected
                context go to the chosen provider.
              </p>
              <label>
                Cloud Intelligence budget
                <select
                  value={intelligence.cloud}
                  disabled={busy || !profile}
                  onChange={(e) => saveIntelligence({ cloud: e.target.value as Intelligence["cloud"] })}
                >
                  <option value="never">Never use cloud automatically</option>
                  <option value="allow">Allow configured cloud</option>
                </select>
              </label>
              <p>
                Automatic cloud use requires both this setting and an allowed provider. Local Only always takes
                priority. Analysis and verification may add up to two paid calls only when configured cloud Intelligence
                is allowed.
              </p>
              <label>
                Web Research
                <select
                  value={intelligence.web ?? "ask"}
                  disabled={busy || !profile || aiState?.localOnly}
                  onChange={(e) => saveIntelligence({ web: e.target.value as "off" | "ask" | "allow" })}
                >
                  <option value="off">Off</option>
                  <option value="ask">Ask</option>
                  <option value="allow">Allow public research</option>
                </select>
              </label>
              <label>
                Search provider
                <select
                  value={intelligence.searchProvider ?? "wikipedia"}
                  disabled={busy || !profile}
                  onChange={(e) => saveIntelligence({ searchProvider: e.target.value as "none" | "wikipedia" })}
                >
                  <option value="none">Unavailable / disabled</option>
                  <option value="wikipedia">Wikipedia · official public API</option>
                </select>
              </label>
              <p>
                Local Only disables all web research. Queries use only the current public question; private files,
                memories and screen content are excluded.
              </p>
              <PrivacyPanel />
              <Button onClick={() => onNavigate("Memory")}>Manage, review or export memories</Button>
              <p>Screen captures are ephemeral. Logs are redacted; review them before sharing.</p>
            </>
          )}
          {section === "Advanced" && (
            <>
              <details>
                <summary>Provider endpoints and model IDs</summary>
                <ProvidersPanel refresh={refresh} />
              </details>
              <label>
                Verification command
                <input
                  value={draft.verificationCommand}
                  onChange={(e) => change("verificationCommand", e.target.value)}
                />
              </label>
              <p className="muted">The agent must verify changes before reporting completion.</p>
              <label>
                Context budget
                <select
                  value={intelligence.contextBudget}
                  disabled={busy || !profile}
                  onChange={(e) => saveIntelligence({ contextBudget: Number(e.target.value) })}
                >
                  {[2048, 4096, 8192, 16384, 32768].map((n) => (
                    <option key={n} value={n}>
                      {n} tokens
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Use a budget supported by your runtime allocation. Output and safety space are reserved. Deep uses up to
                three model calls: optional analysis, draft, and evidence verification. Concurrency is one.
              </p>
              <p>
                Response details contain measured routing timings. Unknown capabilities remain untested; no intelligence
                scores are assigned.
              </p>
              <KnowledgeSettings />
              <Button
                onClick={() =>
                  void run(async () => {
                    await native("window_action", { action: "logs" });
                  })
                }
              >
                Open Logs Folder
              </Button>
            </>
          )}
          {section === "About" && (
            <>
              <h3>ORBIT</h3>
              <p>Your AI. Your Rules.</p>
              <p>Version {desktop.version} · COSMO 1.0</p>
              <p>Development / unsigned test build. Windows signing is not configured.</p>
              <p>Updates: coming later.</p>
              <details>
                <summary>Privacy and licenses</summary>
                <p>
                  Conversations and knowledge are stored locally. Models have their own publisher licenses; the Local AI
                  catalog links to them before downloading.
                </p>
              </details>
            </>
          )}
          {["General", "Agent & Permissions", "Shortcuts", "Advanced"].includes(section) && (
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await save();
                  setMessage("Settings saved");
                })
              }
            >
              Save settings
            </Button>
          )}
          <p role="status">{message}</p>
        </section>
      </div>
    </div>
  );
}
