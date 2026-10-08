import { Icon } from "./components";
export type SourceCardData = { name: string; text: string; url?: string; retrievedAt?: string };
export function SourceCards({
  sources,
  onPreview,
  onAsk,
}: {
  sources: SourceCardData[];
  onPreview: (source: SourceCardData) => void;
  onAsk?: (url: string) => void;
}) {
  const unique = [
    ...new Map(sources.filter((s) => s.url?.startsWith("https://")).map((s) => [s.url, s])).values(),
  ].slice(0, 6);
  if (!unique.length) return null;
  return (
    <section className="source-cards" aria-label="Sources">
      {unique.map((s, i) => {
        let u: URL;
        try {
          u = new URL(s.url!);
        } catch {
          return null;
        }
        const host = u.hostname;
        const kind =
          host === "store.steampowered.com"
            ? "steam"
            : /(^|\.)youtube\.com$/.test(host) || host === "youtu.be"
              ? "video"
              : /(^|\.)openstreetmap\.org$/.test(host)
                ? "place"
                : "browser";
        const seconds = /^\d+s?$/.test(u.searchParams.get("t") ?? "")
          ? parseInt(u.searchParams.get("t")!, 10)
          : undefined;
        const time =
          seconds === undefined ? undefined : Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
        const mode =
          kind === "video"
            ? s.text.startsWith("Transcript (")
              ? "Transcript"
              : s.text.startsWith("Metadata only")
                ? "Metadata only"
                : "Public source"
            : kind === "steam"
              ? "Steam"
              : kind === "place"
                ? "Places"
                : "Web";
        return (
          <article className={"source-card source-" + kind} key={s.url}>
            <div className="source-card-heading">
              <span className="source-glyph">
                <Icon name={kind} size={20} />
              </span>
              <span className="source-kind">
                {mode}
                <small>{host.replace(/^www\./, "")}</small>
              </span>
              <span className="source-number">{i + 1}</span>
            </div>
            <button type="button" className="source-title" onClick={() => onPreview(s)} title="Preview source">
              {s.name}
            </button>
            <p>
              {s.text.slice(0, 180)}
              {s.text.length > 180 ? "…" : ""}
            </p>
            <div className="source-card-actions">
              <a href={s.url} title={s.url}>
                <Icon name="external" size={14} />
                {time
                  ? time
                  : kind === "video"
                    ? "Open YouTube"
                    : kind === "steam"
                      ? "Open in Steam"
                      : kind === "place"
                        ? "Open map"
                        : "Open source"}
              </a>
              {kind === "video" && onAsk && (
                <button type="button" onClick={() => onAsk(s.url!)}>
                  <Icon name="chat" size={14} />
                  Ask about video
                </button>
              )}
            </div>
            {s.retrievedAt && (
              <time className="source-retrieved">Retrieved {new Date(s.retrievedAt).toLocaleString()}</time>
            )}
          </article>
        );
      })}
    </section>
  );
}
