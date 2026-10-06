import { useEffect, useState } from "react";
import { core, errorText, native } from "./api";
import { Button, Modal } from "./components";
import type { AIState } from "./ai-types";
export type BrowserPage = {
  id: string;
  url: string;
  title: string;
  text: string;
  retrievedAt: string;
  mode: string;
  channel?: string;
  transcript?: string;
  links: Array<{ title: string; url: string }>;
};
export type PageContext = { id: string; title: string; profileId: string };
export async function openPublicLink(url: string) {
  const settings = await core<{ openLinks: string }>("ai.internetSettings");
  if (settings.openLinks === "orbit") window.dispatchEvent(new CustomEvent("orbit-browser-open", { detail: url }));
  else await native("open_public_url", { url });
}
export function BrowserPanel({
  ai,
  initial,
  onAsk,
}: {
  ai: AIState;
  initial?: { url: string; token: number };
  onAsk: (page: BrowserPage) => void;
}) {
  const [address, setAddress] = useState(""),
    [page, setPage] = useState<BrowserPage>(),
    [history, setHistory] = useState<string[]>([]),
    [index, setIndex] = useState(-1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [pending, setPending] = useState<Record<string, unknown>>(),
    [results, setResults] = useState<Array<{ title: string; url: string; snippet: string }>>([]),
    [find, setFind] = useState(""),
    [matches, setMatches] = useState<Array<{ text: string; line: number }>>([]);
  const profile = ai.profiles.find((p) => p.id === ai.selected),
    policy = profile?.intelligence?.web ?? "ask";
  const run = async (params: Record<string, unknown>, consent = false) => {
    if (ai.localOnly) {
      setError("Local Only: Internet is blocked.");
      return;
    }
    if (policy === "off") {
      setError("Internet Off. Change Internet Access in Settings → Privacy.");
      return;
    }
    if (policy === "ask" && !consent) {
      setPending(params);
      return;
    }
    const { historyIndex, ...request } = params;
    setBusy(true);
    setError("");
    setPending(undefined);
    try {
      if (params.action === "search") {
        const r = await core<{ results?: typeof results; status: string }>("ai.internet", { ...request, consent });
        setResults(r.results ?? []);
        setError(r.status);
      } else {
        const p = await core<BrowserPage>("ai.internet", { ...request, consent });
        setPage(p);
        setAddress(p.url);
        setMatches([]);
        setResults([]);
        if (typeof historyIndex === "number") setIndex(historyIndex);
        else if (!params.refresh) {
          const h = [...history.slice(0, index + 1), p.url].slice(-20);
          setHistory(h);
          setIndex(h.length - 1);
        }
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (initial) {
      setAddress(initial.url);
      setPending({ action: "open", url: initial.url });
    }
  }, [initial]);
  useEffect(
    () => () => {
      void core("ai.internet", { action: "cancel" }).catch(() => {});
    },
    [],
  );
  return (
    <section className="browser-panel">
      <h1>Browser</h1>
      <p>Public reader · no scripts, cookies, login or form submission</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            address.startsWith("https://") ? { action: "open", url: address } : { action: "search", query: address },
          );
        }}
      >
        <label>
          Public URL or search
          <input
            aria-label="Public URL or search"
            value={address}
            maxLength={2048}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <button disabled={busy || !address.trim()} type="submit">
          Open / Search
        </button>
      </form>
      <div className="actions">
        <Button
          disabled={busy || index <= 0}
          onClick={() => {
            const target = history[index - 1];
            void run({ action: "open", url: target, historyIndex: index - 1 });
          }}
        >
          Back
        </Button>
        <Button
          disabled={busy || index >= history.length - 1}
          onClick={() => {
            const target = history[index + 1];
            void run({ action: "open", url: target, historyIndex: index + 1 });
          }}
        >
          Forward
        </Button>
        <Button disabled={busy || !page} onClick={() => void run({ action: "open", url: page?.url, refresh: true })}>
          Refresh
        </Button>
        {busy && <Button onClick={() => void core("ai.internet", { action: "cancel" })}>Stop</Button>}
      </div>
      {busy && <p role="status">Reading public sources…</p>}
      {error && <p role="status">{error}</p>}
      {results.map((r) => (
        <article className="internet-card" key={r.url}>
          <h3>{r.title}</h3>
          <p>{r.snippet}</p>
          <p>{r.url}</p>
          <Button disabled={busy} onClick={() => void run({ action: "open", url: r.url })}>
            Read source
          </Button>
        </article>
      ))}
      {page && (
        <article>
          <h2>{page.title}</h2>
          <p>{page.url}</p>
          <p>
            {page.mode}
            {page.channel ? ` · ${page.channel}` : ""} · Retrieved {new Date(page.retrievedAt).toLocaleString()}
          </p>
          {page.transcript && <p>Transcript: {page.transcript}. Visual video analysis is not available.</p>}
          <div className="actions">
            <Button onClick={() => onAsk(page)}>Ask about this page</Button>
            <Button
              onClick={() => void native("open_public_url", { url: page.url }).catch((e) => setError(errorText(e)))}
            >
              Open in system browser
            </Button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void core<Array<{ text: string; line: number }>>("ai.internet", {
                action: "find",
                pageId: page.id,
                query: find,
              })
                .then(setMatches)
                .catch((e) => setError(errorText(e)));
            }}
          >
            <label>
              Find on page
              <input value={find} onChange={(e) => setFind(e.target.value)} />
            </label>
            <button type="submit">Find</button>
          </form>
          {matches.map((m) => (
            <blockquote key={m.line}>
              Line {m.line}: {m.text}
            </blockquote>
          ))}
          <pre className="source-preview browser-text">{page.text}</pre>
          <details>
            <summary>Public links ({page.links.length})</summary>
            {page.links.map((l) => (
              <div key={l.url}>
                <Button disabled={busy} onClick={() => void run({ action: "follow", pageId: page.id, url: l.url })}>
                  {l.title}
                </Button>
              </div>
            ))}
          </details>
        </article>
      )}
      {pending && (
        <Modal title="Allow public Internet access?">
          <p>Only this URL/query is sent. Private Memory, Knowledge and Sense are excluded.</p>
          <p className="source-preview">{String(pending.url ?? pending.query)}</p>
          <Button onClick={() => setPending(undefined)}>Cancel</Button>
          <Button onClick={() => void run(pending, true)}>Allow once</Button>
        </Modal>
      )}
    </section>
  );
}
export function InternetPreferences() {
  const [settings, setSettings] = useState({ openLinks: "system", location: "ask" }),
    [error, setError] = useState("");
  useEffect(() => {
    void core<typeof settings>("ai.internetSettings")
      .then(setSettings)
      .catch((e) => setError(errorText(e)));
  }, []);
  const save = (patch: Record<string, string>) =>
    void core<typeof settings>("ai.internetSettings", patch)
      .then(setSettings)
      .catch((e) => setError(errorText(e)));
  return (
    <>
      <label>
        Open links in
        <select value={settings.openLinks} onChange={(e) => save({ openLinks: e.target.value })}>
          <option value="system">System Browser</option>
          <option value="orbit">ORBIT Browser</option>
        </select>
      </label>
      <label>
        Location policy
        <select value={settings.location} onChange={(e) => save({ location: e.target.value })}>
          <option value="off">Off</option>
          <option value="ask">Ask for city / area</option>
          <option value="approximate">Allow approximate location</option>
        </select>
      </label>
      <p>
        This release never reads GPS or infers your location. Supply a city or area for place searches. Browser pages
        are temporary and never automatically saved to Memory or Knowledge.
      </p>
      {error && <p>{error}</p>}
    </>
  );
}
