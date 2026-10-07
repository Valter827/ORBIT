import { BrowserPanel, openPublicLink, type PageContext } from "./browser";
import { readPreference, writePreference, focusComposer, chatGroup, type RecentChat } from "./chat-ui";
import { LocalSetup } from "./local-setup";
import { SensePanel } from "./sense";
import { KnowledgePanel, KnowledgeSettings } from "./knowledge";
import { AIStudio, MemoryPanel } from "./studio";
import { ChatPanel } from "./chat";
import type { AIState } from "./ai-types";
import { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { native, core, errorText, type Desktop, type Status, type Task, type Event } from "./api";
import { Logo, Button, Modal, Quick, Approval, EventList, Files, ErrorNotice, Icon } from "./components";
import { SettingsPanel } from "./settings";
import "./style.css";
import { matchesShortcut } from "./keyboard";
const pages = [
  "Home",
  "My AIs",
  "Create AI",
  "Projects",
  "Agents",
  "Knowledge",
  "Memory",
  "Browser",
  "Files",
  "Settings",
];
function App() {
  const [browserInitial, setBrowserInitial] = useState<{ url: string; token: number }>();
  const [pageContext, setPageContext] = useState<PageContext>();

  useEffect(() => {
    const open = (event: Event) => {
      const url = (event as unknown as CustomEvent<string>).detail;
      setBrowserInitial({ url, token: Date.now() });
      setPage("Browser");
    };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest?.("a[href]");
      if (!anchor) return;
      event.preventDefault();
      const href = anchor.getAttribute("href") ?? "";
      if (!/^https:\/\//i.test(href)) {
        setError("Only public HTTPS links are supported.");
        return;
      }
      void openPublicLink(href).catch((e) => setError(errorText(e)));
    };
    window.addEventListener("orbit-browser-open", open as unknown as EventListener);
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("orbit-browser-open", open as unknown as EventListener);
      document.removeEventListener("click", click);
    };
  }, []);
  const [collapsed, setCollapsed] = useState(() => readPreference("sidebar") === "collapsed");
  const [recent, setRecent] = useState<RecentChat[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [activeChat, setActiveChat] = useState("");
  const [openChat, setOpenChat] = useState<{ id: string; token: number }>();
  const [paletteQuery, setPaletteQuery] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [brainStatus, setBrainStatus] = useState("Checking…");
  const [contextToken, setContextToken] = useState(0);
  const [chatDialog, setChatDialog] = useState<{ kind: "rename" | "delete"; chat: RecentChat; profileId: string }>();
  const [renameTitle, setRenameTitle] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [settingsSection, setSettingsSection] = useState("General");
  const [localSetup, setLocalSetup] = useState(false);
  const [ai, setAI] = useState<AIState>();
  const [newChatToken, setNewChatToken] = useState(0);
  const modeRef = useRef<"Chat" | "Agent" | "Sense">("Chat");
  const [agentHelp, setAgentHelp] = useState(() => readPreference("agent-help") !== "seen");
  const [mode, setMode] = useState<"Chat" | "Agent" | "Sense">("Chat");
  const [desktop, setDesktop] = useState<Desktop>(),
    [status, setStatus] = useState<Status>(),
    [history, setHistory] = useState<Task[]>([]);
  const [page, setPage] = useState("Home"),
    [request, setRequest] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [, setOnline] = useState(navigator.onLine);
  const [exit, setExit] = useState(false),
    [tray, setTray] = useState(false),
    [palette, setPalette] = useState(false),
    [selected, setSelected] = useState<Event[] | null>(null);
  const shortcuts = useRef({ paletteShortcut: "Ctrl+K", settingsShortcut: "Ctrl+,", newTaskShortcut: "Ctrl+N" });
  if (desktop) shortcuts.current = desktop.settings;
  modeRef.current = mode;
  const focusRequest = () =>
    setTimeout(() => {
      if (modeRef.current === "Chat") focusComposer();
      else input.current?.focus();
    }, 50);
  const input = useRef<HTMLTextAreaElement>(null);
  const refresh = useCallback(async () => {
    const [d, s, h, a] = await Promise.all([
      native<Desktop>("desktop_state"),
      core<Status>("status"),
      core<Task[]>("history"),
      core<AIState>("ai.state"),
    ]);
    setAI(a);
    setDesktop(d);
    setStatus(s);
    setHistory(h);
  }, []);
  useEffect(() => {
    setPageContext(undefined);
  }, [ai?.selected, status?.workspace, newChatToken]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    for (const key of ["accent", "density", "animations"]) document.documentElement.dataset[key] = readPreference(key);
    const openSense = () => {
      setPage("Home");
      setMode("Sense");
    };
    addEventListener("orbit-open-sense", openSense);
    return () => removeEventListener("orbit-open-sense", openSense);
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(errorText(e)));
    const timer = setInterval(
      () =>
        void Promise.all([core<Status>("status"), core<Task[]>("history"), core<AIState>("ai.state")])
          .then(([s, h, a]) => {
            setAI(a);
            setStatus(s);
            setHistory(h);
          })
          .catch((e) => setError(errorText(e))),
      2000,
    );
    const subscriptions = [
      listen<{ topic: string }>("orbit-core", (e) => {
        if (e.payload.topic === "crash")
          setError("ORBIT core stopped. Restart the app; unfinished tasks are preserved as interrupted.");
        else if (e.payload.topic !== "chat")
          void core<Status>("status")
            .then(setStatus)
            .catch((e) => setError(errorText(e)));
      }),
      listen<string>("orbit-error", (e) => setError(e.payload)),
      listen("orbit-exit-required", () => setExit(true)),
      listen("orbit-tray-explained", () => setTray(true)),
      listen<string>("orbit-sense", (e) => {
        setRequest(e.payload);
        setPage("Home");
        setMode("Sense");
      }),
      listen<string>("orbit-quick", (e) => {
        setRequest(e.payload);
        setPage("Home");
        focusRequest();
      }),
      listen<string>("orbit-navigation", (e) => {
        setPage(e.payload === "settings" ? "Settings" : "Home");
        if (e.payload === "new") {
          setNewChatToken((v) => v + 1);
          setMode("Chat");
          focusRequest();
        }
      }),
    ];
    const net = () => setOnline(navigator.onLine);
    addEventListener("online", net);
    addEventListener("offline", net);
    const keyboard = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      if (matchesShortcut(e, shortcuts.current.paletteShortcut)) {
        e.preventDefault();
        setPalette((v) => !v);
      }
      if (matchesShortcut(e, shortcuts.current.settingsShortcut)) {
        e.preventDefault();
        setPage("Settings");
      }
      if (matchesShortcut(e, shortcuts.current.newTaskShortcut)) {
        e.preventDefault();
        setNewChatToken((v) => v + 1);
        setMode("Chat");
        setPage("Home");
        focusRequest();
      }
    };
    addEventListener("keydown", keyboard);
    return () => {
      clearInterval(timer);
      for (const p of subscriptions) void p.then((f) => f());
      removeEventListener("online", net);
      removeEventListener("offline", net);
      removeEventListener("keydown", keyboard);
    };
  }, [refresh]);
  if (!desktop)
    return (
      <div className="startup">
        <Logo />
        <h1>ORBIT</h1>
        <p>{error || "Starting your workspace…"}</p>
        {error && <Button onClick={() => void refresh().catch((e) => setError(errorText(e)))}>Retry</Button>}
      </div>
    );
  const start = () =>
    void run(async () => {
      await core("start", { request, profileId: ai?.selected });
      setSelected(null);
      setPage("Agents");
    });
  return (
    <div
      data-block-focus={status?.pending.length ? "true" : undefined}
      className={
        "shell chat-first" + (page === "Settings" ? " settings-open" : "") + (collapsed ? " sidebar-collapsed" : "")
      }
    >
      <aside className="rail">
        <div className="brand">
          <Logo />
          <span className="wordmark">ORBIT</span>
        </div>
        <button
          className="sidebar-toggle"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => {
            setCollapsed(!collapsed);
            writePreference("sidebar", collapsed ? "expanded" : "collapsed");
          }}
        >
          ☰
        </button>
        <Button
          disabled={chatBusy}
          onClick={() => {
            setPage("Home");
            setMode("Chat");
            setNewChatToken((v) => v + 1);
          }}
        >
          + <span className="nav-label">New chat</span>
        </Button>
        <nav aria-label="Main navigation">
          {[
            ["Home", "Chats", "chat"],
            ["My AIs", "My AIs", "star"],
            ["Projects", "Projects", "folder"],
            ["Knowledge", "Knowledge", "book"],
            ["Memory", "Memory", "memory"],
            ["Browser", "Browser", "book"],
            ["Agents", "Agent activity", "orbit"],
            ["Files", "Files", "file"],
          ].map(([name, label, icon]) => (
            <button
              key={name}
              title={label}
              aria-label={label}
              className="navitem"
              aria-current={page === name ? "page" : undefined}
              onClick={() => {
                setPage(name);
                setSelected(null);
              }}
            >
              <Icon name={icon} size={18} />
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>
        {!collapsed && (
          <section className="recent-chats" aria-label="Recent chats">
            <input
              aria-label="Search chats"
              placeholder="Search chats"
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
            />
            {["Today", "Yesterday", "Previous 7 days", "Older"].map((group) => {
              const entries = recent.filter(
                (c) => chatGroup(c.updated) === group && c.title.toLowerCase().includes(historyQuery.toLowerCase()),
              );
              return entries.length ? (
                <div key={group}>
                  <h3>{group}</h3>
                  {entries.map((c) => (
                    <div className="recent-row" key={c.id}>
                      <button
                        className="recent-chat"
                        title={c.title}
                        aria-current={activeChat === c.id ? "true" : undefined}
                        disabled={chatBusy}
                        onClick={() => {
                          setPage("Home");
                          setMode("Chat");
                          setOpenChat({ id: c.id, token: Date.now() });
                        }}
                      >
                        {c.title}
                      </button>
                      <details className="recent-menu">
                        <summary aria-label={"Actions for " + c.title}>⋯</summary>
                        <Button
                          disabled={chatBusy}
                          onClick={() => {
                            setRenameTitle(c.title);
                            setDialogError("");
                            setChatDialog({ kind: "rename", chat: c, profileId: ai!.selected });
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          disabled={chatBusy}
                          onClick={() => {
                            setDialogError("");
                            setChatDialog({ kind: "delete", chat: c, profileId: ai!.selected });
                          }}
                        >
                          Delete
                        </Button>
                      </details>
                    </div>
                  ))}
                </div>
              ) : null;
            })}
            {!recent.length && <p className="muted">Your conversations will appear here.</p>}
          </section>
        )}
        <div className="rail-foot">
          <button className="navitem" title="Settings" aria-label="Settings" onClick={() => setPage("Settings")}>
            ⚙ <span className="nav-label">Settings</span>
          </button>
          <button title="Command palette" aria-label="Command palette" onClick={() => setPalette(true)}>
            ⌕ <span className="nav-label">Search / commands</span>
          </button>
          <p className="nav-label">Your AI. Your Rules.</p>
        </div>
      </aside>
      <div className="stage">
        <main className={page === "Home" ? "chat-main" : "page-main"}>
          {(error || desktop.warning) && (
            <ErrorNotice
              details={error || desktop.warning}
              retry={() => void run(refresh)}
              onSettings={() => setPage("Settings")}
            />
          )}
          {
            <div className="home-page" hidden={page !== "Home"}>
              {localSetup && ai && (
                <LocalSetup
                  key={ai.selected}
                  ai={ai}
                  refresh={refresh}
                  onDone={() => {
                    setLocalSetup(false);
                    setMode("Chat");
                    focusRequest();
                  }}
                  onAdvanced={() => {
                    setLocalSetup(false);
                    setPage("Settings");
                  }}
                />
              )}
              {ai && (
                <section className="ai-selector">
                  <div className="header-identity">
                    <label>
                      Current AI
                      <select
                        aria-label="Current AI"
                        value={ai.selected}
                        disabled={busy || status?.busy || chatBusy}
                        onChange={(e) => {
                          setRequest("");
                          void run(() => core("ai.select", { id: e.target.value }));
                        }}
                      >
                        {ai.profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.builtin ? "COSMO 1.0" : p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="header-status">
                      {ai.providers.find((p) => p.id === ai.profiles.find((p) => p.id === ai.selected)?.providerId)
                        ?.type === "local"
                        ? "Local"
                        : "Cloud"}{" "}
                      ·{" "}
                      {ai.profiles.find((p) => p.id === ai.selected)?.intelligence?.auto
                        ? "Brain: Auto"
                        : ai.profiles.find((p) => p.id === ai.selected)?.modelId || "No model"}{" "}
                      · {chatBusy ? "● Thinking" : brainStatus}
                    </p>
                  </div>
                  <div className="header-controls">
                    {mode === "Chat" && <Button onClick={() => setContextToken((v) => v + 1)}>Context</Button>}
                    <div className="segmented" aria-label="Conversation mode">
                      <Button aria-pressed={mode === "Chat"} onClick={() => setMode("Chat")}>
                        Chat
                      </Button>
                      <Button aria-pressed={mode === "Sense"} onClick={() => setMode("Sense")}>
                        Sense
                      </Button>
                      <Button aria-pressed={mode === "Agent"} onClick={() => setMode("Agent")}>
                        Agent
                      </Button>
                    </div>
                  </div>
                </section>
              )}
              {ai && (
                <div hidden={mode !== "Chat"}>
                  <ChatPanel
                    pageContext={pageContext}
                    onPageContext={setPageContext}
                    onClearPage={() => setPageContext(undefined)}
                    key={status?.workspace ?? ""}
                    ai={ai}
                    request={request}
                    setRequest={setRequest}
                    workspace={status?.workspace ?? null}
                    newChatToken={newChatToken}
                    visible={
                      page === "Home" &&
                      mode === "Chat" &&
                      !localSetup &&
                      !palette &&
                      !exit &&
                      !tray &&
                      !status?.pending.length
                    }
                    openChat={openChat}
                    onHistory={setRecent}
                    onActive={setActiveChat}
                    onBusy={setChatBusy}
                    onStatus={setBrainStatus}
                    contextToken={contextToken}
                    onLocalSetup={() => setLocalSetup(true)}
                    onSense={() => setMode("Sense")}
                    onProject={() => setPage("Projects")}
                    onSettings={() => {
                      setSettingsSection("AI & Models");
                      setPage("Settings");
                    }}
                    onManage={() => setPage("Knowledge")}
                  />
                </div>
              )}
              {mode === "Sense" && ai && <SensePanel ai={ai} refresh={refresh} initialQuestion={request} />}
              {mode === "Agent" && (
                <>
                  {!ai?.providers
                    .find((p) => p.id === ai.profiles.find((a) => a.id === ai.selected)?.providerId)
                    ?.models.find((m) => m.model === ai.profiles.find((a) => a.id === ai.selected)?.modelId)
                    ?.supportsTools && (
                    <p role="status">
                      Agent Mode unavailable until the selected model confirms tool support. Chat and Sense Text remain
                      available. Choose another brain in AI settings.
                    </p>
                  )}
                  {!!ai?.profiles.find((p) => p.id === ai.selected)?.workflows.length && (
                    <label>
                      Use a workflow
                      <select
                        aria-label="Use a workflow"
                        defaultValue=""
                        onChange={(e) => {
                          const w = ai?.profiles
                            .find((p) => p.id === ai.selected)
                            ?.workflows.find((w) => w.id === e.target.value);
                          if (w) setRequest(w.name + "\n" + w.steps.map((s, i) => i + 1 + ". " + s).join("\n"));
                        }}
                      >
                        <option value="">Choose a procedure</option>
                        {ai?.profiles
                          .find((p) => p.id === ai.selected)
                          ?.workflows.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {agentHelp && (
                    <div className="agent-explainer">
                      <p>
                        Agent Mode can work on your project. Review its plan and file changes, approve tools, and stop
                        at any time.
                      </p>
                      <Button
                        variant="quiet"
                        onClick={() => {
                          setAgentHelp(false);
                          writePreference("agent-help", "seen");
                        }}
                      >
                        Got it
                      </Button>
                    </div>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      start();
                    }}
                  >
                    <label className="sr-only" htmlFor="request">
                      Ask ORBIT
                    </label>
                    <textarea
                      ref={input}
                      id="request"
                      placeholder="Find and fix the failing test…"
                      value={request}
                      onChange={(e) => setRequest(e.target.value)}
                      maxLength={10000}
                    />
                    <div className="actions">
                      <button
                        type="submit"
                        disabled={
                          busy ||
                          status?.busy ||
                          status?.paused ||
                          !status?.configured ||
                          !ai?.providers
                            .find((p) => p.id === ai.profiles.find((a) => a.id === ai.selected)?.providerId)
                            ?.models.find((m) => m.model === ai.profiles.find((a) => a.id === ai.selected)?.modelId)
                            ?.supportsTools ||
                          !status.workspace ||
                          !request.trim()
                        }
                      >
                        Run agent
                      </button>
                      {!status?.configured && <Button onClick={() => setPage("Settings")}>Connect AI</Button>}
                      {!status?.workspace && <Button onClick={() => setPage("Projects")}>Select Project</Button>}
                    </div>
                  </form>
                </>
              )}
            </div>
          }
          {page === "Projects" && (
            <>
              <h1>Projects</h1>
              <p className="muted">
                Choose a folder using Windows. ORBIT checks access again whenever you open a project.
              </p>
              <Button disabled={busy || status?.busy} onClick={() => void run(() => native("choose_project"))}>
                Add Project
              </Button>
              <div className="project-grid">
                {desktop.projects.map((p) => (
                  <section className="card" key={p.path}>
                    <h3>{p.path.split(/[\\/]/).at(-1)}</h3>
                    <p className="path">{p.path}</p>
                    <p className="muted">{p.available ? "Available" : "Folder missing or access denied"}</p>
                    <Button
                      disabled={!p.available || busy || status?.busy}
                      onClick={() => void run(() => native("select_project", { project: p.path }))}
                    >
                      {status?.workspace === p.path ? "Selected" : "Open project"}
                    </Button>
                  </section>
                ))}
              </div>
            </>
          )}
          {page === "Agents" && (
            <>
              <div className="section-head">
                <h1>Agents</h1>
                <Button onClick={() => void run(() => core(status?.paused ? "resume" : "pause"))}>
                  {status?.paused ? "Resume agents" : "Pause agents"}
                </Button>
                <Button disabled={!status?.busy} onClick={() => void run(() => core("stop"))}>
                  Stop agent
                </Button>
              </div>
              {status?.current?.result && (
                <section className="card">
                  <h3>
                    {status.current.result.reason === "completed" ? "Task completed" : status.current.result.reason}
                  </h3>
                  <p className="muted">
                    {status.current.result.verified
                      ? "Verification passed. Review the activity or undo saved file changes."
                      : "Review the activity below before retrying."}
                  </p>
                </section>
              )}
              {status?.pending.map((p) => (
                <Approval
                  key={p.id}
                  pending={p}
                  answer={(id, answer) => void run(() => core("answer", { id, answer }))}
                />
              ))}
              <EventList events={selected ?? status?.events ?? []} />
              <h2>History</h2>
              {history.map((task) => (
                <section className="card task" key={task.id}>
                  <h3>{task.request}</h3>
                  <span className="pill">{task.status}</span>
                  <p className="path">{task.workspace}</p>
                  {task.status === "INTERRUPTED" && (
                    <p>
                      ORBIT was closed before this task finished. Review the files and saved changes before retrying.
                    </p>
                  )}
                  <div className="actions">
                    <Button
                      onClick={() =>
                        void run(async () => setSelected(await core<Event[]>("historyEvents", { taskId: task.id })))
                      }
                    >
                      View activity
                    </Button>
                    <Button
                      disabled={status?.busy || status?.workspace !== task.workspace || task.status === "UNDONE"}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Restore this task's saved file contents? This can replace later edits to those files.",
                          )
                        )
                          void run(() => core("undo", { taskId: task.id }));
                      }}
                    >
                      Undo Task
                    </Button>
                  </div>
                </section>
              ))}
            </>
          )}
          {page === "Files" && <Files key={status?.workspace} />}
          {(page === "My AIs" || page === "Create AI") && (
            <AIStudio
              onSetup={() => {
                setPage("Home");
                setLocalSetup(true);
              }}
              key={page}
              refresh={refresh}
              create={page === "Create AI"}
              onChat={() => {
                setMode("Chat");
                setPage("Home");
              }}
            />
          )}
          {page === "Knowledge" && ai && (
            <>
              <h1>{ai.profiles.find((p) => p.id === ai.selected)?.name} · Knowledge</h1>
              <KnowledgePanel key={ai.selected} profileId={ai.selected} />
              <KnowledgeSettings />
            </>
          )}
          {page === "Browser" && ai && (
            <BrowserPanel
              key={ai.selected}
              ai={ai}
              initial={browserInitial}
              onAsk={(p) => {
                setPageContext({ id: p.id, title: p.title, profileId: ai.selected });
                setPage("Home");
                setMode("Chat");
                setRequest("Что написано на этой странице?");
              }}
            />
          )}
          {page === "Memory" && <MemoryPanel key={ai?.selected + ":" + (status?.workspace ?? "")} />}
          {page === "Settings" && (
            <SettingsPanel
              desktop={desktop}
              refresh={refresh}
              aiState={ai}
              section={settingsSection}
              setSection={setSettingsSection}
              onNavigate={setPage}
              onLocalSetup={() => {
                setPage("Home");
                setLocalSetup(true);
              }}
            />
          )}
          {["GitHub"].includes(page) && (
            <>
              <h1>{page}</h1>
              <section className="card">
                <h3>Coming later</h3>
                <p className="muted">
                  This integration is not available in ORBIT 0.4. Your projects and agent history remain available
                  locally.
                </p>
              </section>
            </>
          )}
        </main>
      </div>
      {chatDialog && (
        <Modal title={chatDialog.kind === "rename" ? "Rename conversation" : "Delete this conversation?"}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (dialogBusy || chatBusy) return;
              setDialogBusy(true);
              setDialogError("");
              void (async () => {
                await core(chatDialog.kind === "rename" ? "chat.rename" : "chat.delete", {
                  id: chatDialog.chat.id,
                  profileId: chatDialog.profileId,
                  ...(chatDialog.kind === "rename" ? { title: renameTitle.trim() } : {}),
                });
                if (chatDialog.kind === "delete" && activeChat === chatDialog.chat.id) setNewChatToken((v) => v + 1);
                setRecent(await core<RecentChat[]>("chat.history", { profileId: chatDialog.profileId }));
                window.dispatchEvent(new Event("orbit-history-changed"));
                setChatDialog(undefined);
              })()
                .catch((e) => setDialogError(errorText(e)))
                .finally(() => setDialogBusy(false));
            }}
          >
            {chatDialog.kind === "rename" ? (
              <label>
                Conversation name
                <input
                  data-autofocus
                  maxLength={80}
                  value={renameTitle}
                  onChange={(e) => setRenameTitle(e.target.value)}
                />
              </label>
            ) : (
              <>
                <p>“{chatDialog.chat.title}”</p>
                <p>This cannot be undone.</p>
              </>
            )}
            {dialogError && <p role="alert">{dialogError}</p>}
            <div className="actions">
              <Button disabled={dialogBusy} onClick={() => setChatDialog(undefined)}>
                Cancel
              </Button>
              <button
                type="submit"
                className={chatDialog.kind === "delete" ? "destructive" : "primary"}
                disabled={dialogBusy || chatBusy || (chatDialog.kind === "rename" && !renameTitle.trim())}
              >
                {chatDialog.kind === "rename" ? "Rename" : "Delete"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {palette && (
        <Modal title="Command palette">
          <div className="palette">
            <input
              aria-label="Search commands"
              autoFocus
              placeholder="Where would you like to go?"
              value={paletteQuery}
              onChange={(e) => setPaletteQuery(e.target.value)}
            />
            <Button
              disabled={chatBusy}
              onClick={() => {
                setPage("Home");
                setMode("Chat");
                setNewChatToken((v) => v + 1);
                setPalette(false);
              }}
            >
              New chat
            </Button>
            <Button
              onClick={() => {
                setPage("Home");
                setMode("Sense");
                setPalette(false);
              }}
            >
              Use Sense
            </Button>
            {pages
              .filter((name) => name.toLowerCase().includes(paletteQuery.toLowerCase()))
              .map((name) => (
                <Button
                  key={name}
                  onClick={() => {
                    setPage(name);
                    setPalette(false);
                  }}
                >
                  {name}
                </Button>
              ))}
            <Button onClick={() => setPalette(false)}>Close</Button>
          </div>
        </Modal>
      )}
      {exit && (
        <Modal title="ORBIT is currently running 1 task.">
          <p>Keep it running in the tray, or cancel safely before exiting.</p>
          <div className="actions">
            <Button
              onClick={() =>
                void run(async () => {
                  await native("window_action", { action: "keep-running" });
                  setExit(false);
                })
              }
            >
              Keep running
            </Button>
            <Button disabled={busy} onClick={() => void run(() => native("window_action", { action: "stop-exit" }))}>
              Stop and exit
            </Button>
            <Button onClick={() => setExit(false)}>Cancel</Button>
          </div>
        </Modal>
      )}
      {tray && (
        <Modal title="ORBIT will keep running in the tray">
          <p>Your active task can continue. Use the ORBIT tray icon to reopen the window or choose Quit ORBIT.</p>
          <Button
            onClick={() =>
              void run(async () => {
                await native("window_action", { action: "keep-running" });
                setTray(false);
              })
            }
          >
            Got it
          </Button>
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(location.search.includes("quick=1") ? <Quick /> : <App />);
