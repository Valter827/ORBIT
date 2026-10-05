import { MemorySuggestions } from "./memory";
import { readPreference, writePreference, focusComposer, type RecentChat } from "./chat-ui";
import { useState, useEffect, useRef } from "react";
import { core, errorText } from "./api";
import { Button, Modal, EmptyState, ErrorNotice, LoadingState } from "./components";
import { MessageBody } from "./message-body";
import { intelligenceDefaults, type Intelligence } from "./ai-types";
import type { AIState } from "./ai-types";
type Message = { role: string; content?: string; intelligence?: Generation["intelligence"] };
type Generation = {
  id: string;
  conversationId: string;
  running: boolean;
  text: string;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
  model?: string;
  contextTokens?: number;
  phase?: string;
  intelligence?: {
    kind: string;
    mode: string;
    planningMs: number;
    analyzer?: string;
    routingReason?: string;
    webStatus?: string;
    searchMs?: number;
    verificationStage?: string;
    inferenceCalls?: number;
    generationMs?: number;
    verificationMs?: number;
    sources?: Array<{ sourceId: string; name: string; text: string; url?: string; retrievedAt?: string }>;
    memoryCount?: number;
    memoryUsed?: Array<{ id: string; content: string; type: string; scope: string }>;
    brain?: string;
    verification?: {
      status: string;
      note: string;
      sources: Array<{ sourceId: string; name: string; text: string; url?: string; retrievedAt?: string }>;
    };
  };
  knowledge?: {
    strategy: string;
    sources: Array<{
      sourceId: string;
      name: string;
      text: string;
      section?: string;
      symbol?: string;
      lineStart?: number;
      lineEnd?: number;
      page?: number | null;
    }>;
    warning?: string;
  };
  memoryUsed?: Array<{ id: string; category: string }>;
};
export function ChatPanel({
  ai,
  request,
  setRequest,
  workspace,
  newChatToken,
  onSettings,
  onManage,
  visible,
  openChat,
  onHistory,
  onActive,
  onBusy,
  onStatus,
  contextToken,
  onLocalSetup,
  onSense,
  onProject,
}: {
  visible: boolean;
  openChat?: { id: string; token: number };
  onHistory: (items: RecentChat[]) => void;
  onActive: (id: string) => void;
  onBusy: (busy: boolean) => void;
  onStatus: (status: string) => void;
  contextToken: number;
  onLocalSetup: () => void;
  onSense: () => void;
  onProject: () => void;
  ai: AIState;
  request: string;
  setRequest: (v: string) => void;
  workspace: string | null;
  newChatToken: number;
  onSettings: () => void;
  onManage: () => void;
}) {
  const [conversation, setConversation] = useState<string>(),
    [messages, setMessages] = useState<Message[]>([]),
    [generation, setGeneration] = useState<Generation>(),
    [id, setId] = useState(""),
    [error, setError] = useState(""),
    [files, setFiles] = useState(""),
    [last, setLast] = useState("");
  const [memoryNote, setMemoryNote] = useState<string>(),
    [source, setSource] = useState<{
      name: string;
      chunks: Array<{ text: string }>;
      url?: string;
      retrievedAt?: string;
    }>();
  const [starting, setStarting] = useState(false),
    [loadingHistory, setLoadingHistory] = useState(false),
    [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [contextOpen, setContextOpen] = useState(false);
  const [webQuestion, setWebQuestion] = useState<string>();
  const [publicQuery, setPublicQuery] = useState("");
  useEffect(() => {
    const resize = () => {
      if (window.innerWidth < 1200) setContextOpen(false);
    };
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (contextToken) setContextOpen((v) => !v);
  }, [contextToken]);
  const [restored, setRestored] = useState(false);
  const historyEpoch = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [brain, setBrain] = useState("Checking brain…");
  useEffect(() => {
    if (!ai.selected) return;
    let alive = true;
    const check = () => {
      if (active.current) return;
      void core<{ status: string }>("ai.brainHealth", { profileId: ai.selected })
        .then((r) => {
          if (alive) setBrain(r.status);
        })
        .catch(() => {
          if (alive) setBrain("Offline");
        });
    };
    check();
    const timer = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [
    ai.selected,
    ai.profiles.find((p) => p.id === ai.selected)?.modelId,
    ai.profiles.find((p) => p.id === ai.selected)?.providerId,
  ]);
  const active = useRef(false),
    resetSeen = useRef(newChatToken),
    end = useRef<HTMLDivElement>(null);
  const profile = ai.profiles.find((p) => p.id === ai.selected),
    provider = ai.providers.find((p) => p.id === profile?.providerId);
  const selectedFiles = files
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
  const storageKey = "chat:" + ai.selected + ":" + (workspace ?? "");
  const [modeSaving, setModeSaving] = useState(false);
  const [intelligence, setIntelligence] = useState<Intelligence>(intelligenceDefaults);
  useEffect(() => {
    setIntelligence(profile?.intelligence ?? intelligenceDefaults);
  }, [profile?.id, JSON.stringify(profile?.intelligence)]);
  const saveIntelligence = async (changes: Partial<Intelligence>) => {
    if (!profile || active.current) return;
    setModeSaving(true);
    try {
      const next = { ...intelligence, ...changes };
      await core("ai.saveProfile", { ...profile, intelligence: next });
      setIntelligence(next);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setModeSaving(false);
    }
  };
  const needsSetup = !profile || (!intelligence.auto && (!profile.modelId || !provider?.configured));
  const remember = (id: string) => {
    writePreference(storageKey, id);
    onActive(id);
  };
  const loadHistory = () => {
    const ticket = historyEpoch.current;
    return core<RecentChat[]>("chat.history", { profileId: ai.selected }).then((items) => {
      if (ticket === historyEpoch.current) {
        onHistory(items);
      }
      return items;
    });
  };
  useEffect(() => {
    const update = () => {
      void loadHistory().catch((e) => setError(errorText(e)));
    };
    addEventListener("orbit-history-changed", update);
    return () => removeEventListener("orbit-history-changed", update);
  }, [ai.selected, workspace]);
  const openConversation = async (selected: string) => {
    if (active.current) return;
    const ticket = ++historyEpoch.current;
    setLoadingHistory(true);
    try {
      const m = await core<Message[]>("chat.messages", { id: selected, profileId: ai.selected });
      if (ticket !== historyEpoch.current) return;
      setConversation(selected);
      remember(selected);
      setMessages(m);
      setGeneration(undefined);
      setError("");
      setAttachedFiles([]);
      setLast([...m].reverse().find((v) => v.role === "user")?.content ?? "");
    } catch (e) {
      if (ticket === historyEpoch.current) setError(errorText(e));
    } finally {
      if (ticket === historyEpoch.current) {
        setLoadingHistory(false);
        focusComposer(needsSetup);
      }
    }
  };
  useEffect(() => {
    if (openChat) void openConversation(openChat.id);
  }, [openChat]);
  useEffect(() => {
    if (visible && restored && !loadingHistory) focusComposer(needsSetup);
  }, [visible, restored, loadingHistory, needsSetup, newChatToken, ai.selected]);
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(180, Math.max(52, el.scrollHeight)) + "px";
    }
  }, [request]);

  const newChat = () => {
    if (active.current) return;
    historyEpoch.current++;
    setRestored(true);
    setLoadingHistory(false);
    setConversation(undefined);
    setMessages([]);
    setGeneration(undefined);
    setLast("");
    setError("");
    setRequest("");
    setAttachedFiles([]);
    remember("");
    focusComposer(needsSetup);
  };
  useEffect(() => {
    const ticket = ++historyEpoch.current;
    setRestored(false);
    setConversation(undefined);
    setMessages([]);
    setGeneration(undefined);
    setId("");
    setError("");
    setAttachedFiles([]);
    setBrain("Checking brain…");
    onActive("");
    void loadHistory()
      .then(async (items) => {
        if (ticket !== historyEpoch.current) return;
        const stored = readPreference(storageKey, "__unset__");
        const saved = stored === "__unset__" ? items[0]?.id : stored;
        if (saved && items.some((c) => c.id === saved) && readPreference("restore", "true") !== "false") {
          const m = await core<Message[]>("chat.messages", { id: saved, profileId: ai.selected });
          if (ticket !== historyEpoch.current) return;
          setConversation(saved);
          onActive(saved);
          setMessages(m);
          setLast([...m].reverse().find((v) => v.role === "user")?.content ?? "");
        }
      })
      .catch((e) => {
        if (ticket === historyEpoch.current) setError(errorText(e));
      })
      .finally(() => {
        if (ticket === historyEpoch.current) setRestored(true);
      });
    return () => {
      historyEpoch.current++;
    };
  }, [ai.selected, workspace]);
  useEffect(() => {
    if (resetSeen.current !== newChatToken) {
      resetSeen.current = newChatToken;
      newChat();
    }
  }, [newChatToken]);
  useEffect(() => {
    if (!id) return;
    let current = true,
      polling = false,
      finished = false;
    const poll = async () => {
      if (polling || finished) return;
      polling = true;
      try {
        const g = await core<Generation | null>("chat.status");
        if (current && g?.id === id) {
          setGeneration(g);
          setConversation(g.conversationId);
          remember(g.conversationId);
          if (!g.running) {
            finished = true;
            active.current = false;
            setId("");
            focusComposer(needsSetup);
            if (!g.error) setBrain("Ready");
            if (!g.error)
              setMessages((prev) => [...prev, { role: "assistant", content: g.text, intelligence: g.intelligence }]);
            void loadHistory().catch((e) => setError(errorText(e)));
          }
        }
      } catch (e) {
        if (current) setError(errorText(e));
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 200);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [id]);
  const send = async (text: string, regenerate = false, verify = false, webConsent = false) => {
    if (active.current || !text.trim() || needsSetup || loadingHistory || !restored) return;
    active.current = true;
    setStarting(true);
    setError("");
    try {
      const response = await core<{ id: string; conversationId: string }>("chat.start", {
        request: text,
        profileId: ai.selected,
        ...(conversation ? { conversationId: conversation } : {}),
        files: selectedFiles,
        regenerate,
        verify,
        webConsent,
        ...(webConsent ? { publicQuery } : {}),
      });
      setMessages((prev) => (regenerate ? prev.slice(0, -1) : [...prev, { role: "user", content: text }]));
      setAttachedFiles(selectedFiles);
      setLast(text);
      setRequest("");
      setGeneration(undefined);
      setId(response.id);
    } catch (e) {
      active.current = false;
      setError(errorText(e));
    } finally {
      setStarting(false);
    }
  };
  const busy = !!id || starting;
  useEffect(() => {
    onStatus(
      needsSetup
        ? "! Needs setup"
        : brain === "Ready"
          ? "● Ready"
          : brain === "Offline" || brain === "Model unavailable"
            ? "○ Offline"
            : brain === "Connected · not tested"
              ? "○ Not tested"
              : brain,
    );
  }, [needsSetup, brain, onStatus]);
  useEffect(() => {
    onBusy(busy);
  }, [busy]);
  return (
    <section className={"chat-panel" + (contextOpen ? " with-context" : "")} aria-label="Conversation">
      {needsSetup && (
        <div className="brain-setup">
          <h3>{profile?.name ?? "Your AI"} needs a brain</h3>
          <p>Set up a local AI to start chatting. No API key required.</p>
          <div className="actions">
            <Button id="chat-setup" onClick={onLocalSetup}>
              Set Up Local AI
            </Button>
            <Button onClick={onSettings}>Connect Cloud AI</Button>
          </div>
        </div>
      )}
      {loadingHistory && <LoadingState label="Opening conversation…" />}
      {!messages.length && !busy && !loadingHistory && (
        <EmptyState title="What can I help with?">
          <span className="empty-ai">{profile?.builtin ? "COSMO" : profile?.name}</span>
          <div className="actions suggestions">
            <Button
              onClick={() => {
                setRequest("Explain something to me: ");
                focusComposer();
              }}
            >
              Explain something
            </Button>
            <Button
              onClick={() => {
                setRequest("Help me with this code: ");
                focusComposer();
              }}
            >
              Help with code
            </Button>
            <Button onClick={onSense}>Use Sense</Button>
            <Button onClick={onProject}>Work on a project</Button>
          </div>
        </EmptyState>
      )}
      <div className="chat-transcript" aria-live="polite" aria-busy={busy}>
        {messages.map((m, i) => (
          <article className={"chat-message " + m.role} key={i}>
            <strong>{m.role === "user" ? "You" : profile?.name}</strong>
            <MessageBody text={m.content ?? ""} />
            {m.role === "assistant" && !!m.intelligence?.memoryUsed?.length && (
              <details className="response-context">
                <summary>Memory · {m.intelligence.memoryUsed.length}</summary>
                {m.intelligence.memoryUsed.map((item) => (
                  <p key={item.id}>
                    {item.content}{" "}
                    <span className="muted">
                      · {item.type} · {item.scope}
                    </span>
                  </p>
                ))}
              </details>
            )}
            {m.role === "assistant" && m.intelligence && m.intelligence.kind !== "casual" && (
              <details className="response-context">
                <summary>{m.intelligence.verification?.status ?? "Response details"}</summary>
                <p>
                  Brain: {m.intelligence.brain} · Mode: {m.intelligence.mode}
                </p>
                <p>
                  Sources: {m.intelligence.sources?.length ?? 0} · Memory: {m.intelligence.memoryCount ?? 0} · Sense: No
                </p>
                {m.intelligence.verification && <p>{m.intelligence.verification.note}</p>}
                {(m.intelligence.verification?.sources ?? m.intelligence.sources)?.map((s, index) => (
                  <Button
                    key={index}
                    onClick={() =>
                      setSource({
                        name: s.name,
                        chunks: [{ text: s.text }],
                        ...("url" in s && typeof s.url === "string" ? { url: s.url } : {}),
                        ...("retrievedAt" in s && typeof s.retrievedAt === "string"
                          ? { retrievedAt: s.retrievedAt }
                          : {}),
                      })
                    }
                  >
                    {s.name}
                  </Button>
                ))}
                <p>
                  Analyzer: {m.intelligence.analyzer ?? "Deterministic"} · {m.intelligence.routingReason}
                </p>
                {m.intelligence.webStatus && <p>Web: {m.intelligence.webStatus}</p>}
                {m.intelligence.verificationStage && (
                  <p>
                    {m.intelligence.verificationStage} · {m.intelligence.inferenceCalls} inference calls
                  </p>
                )}
                <p className="muted">
                  Planning: {Math.round(m.intelligence.planningMs)} ms · Generation:{" "}
                  {Math.round(m.intelligence.generationMs ?? 0)} ms · Verification:{" "}
                  {Math.round(m.intelligence.verificationMs ?? 0)} ms
                </p>
              </details>
            )}
            {m.role === "assistant" && (
              <div className="actions">
                <Button
                  variant="quiet"
                  onClick={() =>
                    void navigator.clipboard.writeText(m.content ?? "").catch((e) => setError(errorText(e)))
                  }
                >
                  Copy
                </Button>
                {i === messages.length - 1 && m.intelligence?.kind !== "casual" && (
                  <Button
                    variant="quiet"
                    disabled={busy || modeSaving}
                    onClick={() => void send(messages[i - 1]?.content ?? last, true, true)}
                  >
                    Verify answer
                  </Button>
                )}
                {!ai.localOnly &&
                  intelligence.web !== "off" &&
                  i === messages.length - 1 &&
                  m.intelligence?.kind !== "casual" && (
                    <Button
                      variant="quiet"
                      disabled={busy}
                      onClick={() => {
                        const question = messages[i - 1]?.content ?? last;
                        setWebQuestion(question);
                        setPublicQuery(question.slice(0, 240));
                      }}
                    >
                      Search web
                    </Button>
                  )}
                <Button variant="quiet" onClick={() => setMemoryNote((m.content ?? "").slice(0, 8000))}>
                  Review memory note
                </Button>
              </div>
            )}
          </article>
        ))}
        {busy && (
          <article className="chat-message assistant streaming">
            <strong>{profile?.name}</strong>
            {generation?.text ? (
              <MessageBody text={generation.text} />
            ) : (
              <LoadingState label={generation?.phase ?? "Waiting for the selected AI…"} />
            )}
          </article>
        )}
        <div ref={end} />
      </div>
      {(error || generation?.error) && (
        <ErrorNotice details={error || generation?.error || ""} onSettings={onSettings} />
      )}
      {contextOpen && (
        <aside className="context-panel">
          <h3>Context</h3>
          <p>{profile?.name}</p>
          <p>{profile?.modelId || "No brain selected"}</p>
          <p>Project: {workspace || "None"}</p>
          <p>Knowledge: {ai.knowledgeCounts?.[ai.selected] ?? 0} sources</p>
          <p>
            Memory:{" "}
            {Object.entries(profile?.memory ?? {})
              .filter(([, enabled]) => enabled)
              .map(([name]) => name)
              .join(", ") || "Off"}
          </p>
          <p>Sense: sharing starts only after you choose a window.</p>
          <Button onClick={onManage}>Manage knowledge</Button>
        </aside>
      )}
      {contextOpen && generation && (
        <details open className="response-context">
          <summary>
            Context used for this response · {generation.knowledge?.sources.length ?? 0} knowledge passages ·{" "}
            {generation.memoryUsed?.length ?? 0} memories
          </summary>
          <p>
            {attachedFiles.length} selected project files: {attachedFiles.join(", ") || "None"}
          </p>
          {generation.knowledge && (
            <div className="source-list">
              <strong>
                Knowledge used ·{" "}
                {generation.knowledge.strategy === "keyword"
                  ? "Keyword retrieval"
                  : generation.knowledge.strategy === "hybrid"
                    ? "Hybrid retrieval"
                    : "Semantic retrieval"}
              </strong>
              <div className="actions">
                {generation.knowledge.sources.map((s, i) => (
                  <Button
                    key={i}
                    onClick={() =>
                      setSource({
                        name: s.name,
                        chunks: [
                          {
                            text:
                              [
                                s.section,
                                s.symbol,
                                s.page ? "Page " + s.page : "",
                                s.lineStart ? "Lines " + s.lineStart + "–" + s.lineEnd : "",
                              ]
                                .filter(Boolean)
                                .join(" · ") +
                              "\n\n" +
                              s.text,
                          },
                        ],
                      })
                    }
                  >
                    {s.name}
                  </Button>
                ))}
              </div>
              {!generation.knowledge.sources.length && <p>No relevant passages found.</p>}
              {generation.knowledge.warning && <p>{generation.knowledge.warning}</p>}
              <p>Memory used: {generation.memoryUsed?.map((m) => m.category).join(", ") || "None"}</p>
            </div>
          )}
          <details>
            <summary>Advanced response details</summary>
            {generation.usage && (
              <p>
                Tokens · Input {generation.usage.inputTokens.toLocaleString()} · Output{" "}
                {generation.usage.outputTokens.toLocaleString()}
              </p>
            )}
            {generation.contextTokens !== undefined && (
              <p>
                Estimated input context: {generation.contextTokens.toLocaleString()} tokens · {generation.model}
              </p>
            )}
          </details>
        </details>
      )}
      {memoryNote !== undefined && (
        <Modal title="Review before remembering">
          <p>Save only the fact or preference you want this AI to remember.</p>
          <label>
            Memory proposal
            <textarea value={memoryNote} maxLength={8000} onChange={(e) => setMemoryNote(e.target.value)} />
          </label>
          <div className="actions">
            <Button onClick={() => setMemoryNote(undefined)}>Not now</Button>
            <Button
              variant="primary"
              disabled={!memoryNote.trim()}
              onClick={() =>
                void core("ai.memoryAdd", { scope: "user", content: memoryNote, shared: false })
                  .then(() => setMemoryNote(undefined))
                  .catch((e) => setError(errorText(e)))
              }
            >
              Remember
            </Button>
          </div>
        </Modal>
      )}
      {webQuestion !== undefined && (
        <Modal title="Research public sources">
          <p>Only this public query will be sent to the selected search provider. Remove private details.</p>
          <label>
            Public search query
            <input value={publicQuery} maxLength={240} onChange={(e) => setPublicQuery(e.target.value)} />
          </label>
          <div className="actions">
            <Button onClick={() => setWebQuestion(undefined)}>Answer without web</Button>
            <Button
              disabled={!publicQuery.trim()}
              onClick={() => {
                const question = webQuestion;
                setWebQuestion(undefined);
                void send(question, true, true, true);
              }}
            >
              Search web
            </Button>
          </div>
        </Modal>
      )}
      {source && (
        <Modal title={source.name}>
          {source.url?.startsWith("https://") && (
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              Open original source
            </a>
          )}
          {source.retrievedAt && <p>Retrieved: {source.retrievedAt}</p>}
          <div className="wizard-body">
            {source.chunks.map((c, i) => (
              <pre className="source-preview" key={i}>
                {c.text}
              </pre>
            ))}
          </div>
          <Button onClick={() => setSource(undefined)}>Close</Button>
        </Modal>
      )}
      <MemorySuggestions revision={ai.selected + ":" + (generation?.running ? "running" : (generation?.id ?? ""))} />
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(request);
        }}
      >
        <div className="actions intelligence-modes" role="group" aria-label="Intelligence mode">
          {(["fast", "balanced", "deep"] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              aria-pressed={intelligence.mode === mode}
              title={
                { fast: "Quick response", balanced: "Best everyday mode", deep: "More analysis and verification" }[mode]
              }
              disabled={busy || modeSaving}
              onClick={() => void saveIntelligence({ mode })}
            >
              {mode[0].toUpperCase() + mode.slice(1)}
            </button>
          ))}
          <label>
            Brain{" "}
            <select
              aria-label="Brain selection"
              value={intelligence.auto ? "auto" : "manual"}
              disabled={busy || modeSaving}
              onChange={(e) => void saveIntelligence({ auto: e.target.value === "auto" })}
            >
              <option value="auto">Auto</option>
              <option value="manual">{profile?.modelId || "Manual"}</option>
            </select>
          </label>
        </div>
        <label htmlFor="chat-request">
          <span className="sr-only">Ask {profile?.name ?? "ORBIT"}</span>
          <textarea
            id="chat-request"
            ref={inputRef}
            disabled={needsSetup || !restored}
            aria-label={"Ask " + (profile?.name ?? "ORBIT")}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!busy) void send(request);
              }
            }}
            maxLength={20000}
            placeholder={
              profile?.builtin ? "Ask COSMO anything..." : "Ask a question, explore an idea, or explain your project…"
            }
          />
        </label>
        <details className="context-control">
          <summary>+ Add context</summary>
          <p className="path">{workspace ?? "Open a project to attach files."}</p>
          <label>
            Relative file paths, one per line (maximum 5)
            <textarea
              className="small-input"
              value={files}
              disabled={busy}
              onChange={(e) => setFiles(e.target.value)}
              placeholder={"src/index.ts\nREADME.md"}
            />
          </label>
          <p className="muted">
            Only selected files are attached. Relevant knowledge passages and enabled memories are chosen for each
            question.
          </p>
          <p>
            Memory enabled:{" "}
            {Object.entries(profile?.memory ?? {})
              .filter(([, enabled]) => enabled)
              .map(
                ([name]) =>
                  ({ user: "Private AI", project: "Project", shared: "Shared", conversation: "Conversation" })[name] ??
                  name,
              )
              .join(", ") || "None"}
          </p>
          <Button onClick={onManage}>Manage knowledge</Button>
        </details>
        <div className="actions">
          {!busy && (
            <button type="submit" disabled={needsSetup || !restored || !request.trim() || selectedFiles.length > 5}>
              Send message ↑
            </button>
          )}
          {busy && (
            <Button onClick={() => void core("chat.stop").catch((e) => setError(errorText(e)))}>Stop generating</Button>
          )}
          {!busy && last && messages.at(-1)?.role === "assistant" && (
            <Button onClick={() => void send(last, true)}>Regenerate</Button>
          )}
        </div>
        {selectedFiles.length > 5 && <p role="alert">Choose at most five files for this message.</p>}
        {selectedFiles.length > 0 && (
          <div className="context-chips">
            {selectedFiles.map((file) => (
              <button
                key={file}
                type="button"
                title={"Remove " + file}
                onClick={() => setFiles(selectedFiles.filter((f) => f !== file).join("\n"))}
              >
                {file} ×
              </button>
            ))}
          </div>
        )}
      </form>
    </section>
  );
}
