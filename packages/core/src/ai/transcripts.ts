import { parseDocument, DomUtils } from "htmlparser2";
import { publicUrl, type publicGet } from "./web-research.js";

export type TranscriptGet = (url: string, bytes?: number) => ReturnType<typeof publicGet>;
export type TranscriptSegment = { startMs: number; endMs: number; text: string };
export type TranscriptChunk = TranscriptSegment & { videoId: string; title: string; channel: string; language: string };
export type TranscriptAttempt = { provider: string; status: "available" | "unavailable"; reason?: string };
export type TranscriptResult = {
  segments: TranscriptSegment[];
  language: string;
  provider: string;
  sourceUrl: string;
};
export interface TranscriptProvider {
  readonly id: string;
  retrieve(videoId: string, language: string, get: TranscriptGet): Promise<TranscriptResult | undefined>;
}
export interface MediaTranscriptionProvider {
  readonly available: false;
}
export interface VideoVisualProvider {
  readonly available: false;
}
export const localMediaCapabilities = { visual: "unavailable", audioTranscription: "unavailable" } as const;

function plain(value: string) {
  return DomUtils.textContent(parseDocument(value)).replace(/\s+/g, " ").trim();
}
function clockMs(value: string): number {
  if (/^\d+(?:\.\d+)?s$/.test(value)) return Number(value.slice(0, -1)) * 1000;
  const parts = value.replace(",", ".").split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return NaN;
  if (parts.at(-1)! >= 60 || (parts.length === 3 && parts[1]! >= 60)) return NaN;
  return parts.reduce((n, p) => n * 60 + p, 0) * 1000;
}
/** Reject empty/HTML/error bodies; parse timestamps without rewriting spoken meaning. */
export function normalizeTranscript(body: string): TranscriptSegment[] {
  if (!body.trim() || Buffer.byteLength(body) > 600000 || /<(?:html|!doctype|script)\b/i.test(body)) return [];
  const raw: TranscriptSegment[] = [];
  try {
    if (body.trim().startsWith("{")) {
      const data = JSON.parse(body) as {
        events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }>;
      };
      for (const e of (data.events ?? []).slice(0, 5000))
        raw.push({
          startMs: Number(e.tStartMs),
          endMs: Number(e.tStartMs) + Number(e.dDurationMs ?? 0),
          text: (e.segs ?? []).map((s) => s.utf8 ?? "").join(""),
        });
    } else if (/-->/u.test(body)) {
      for (const block of body
        .replace(/\r/g, "")
        .split(/\n\s*\n/)
        .slice(0, 5000)) {
        const lines = block.split("\n"),
          index = lines.findIndex((s) => s.includes("-->"));
        if (index < 0 || /^(NOTE|STYLE|REGION)\b/.test(block)) continue;
        const match = /^\s*([\d:.,]+)\s+-->\s+([\d:.,]+)/.exec(lines[index]!);
        if (match)
          raw.push({ startMs: clockMs(match[1]!), endMs: clockMs(match[2]!), text: lines.slice(index + 1).join(" ") });
      }
    } else {
      const doc = parseDocument(body, { xmlMode: true });
      for (const n of DomUtils.findAll((n) => n.name === "text" || n.name === "p", doc.children).slice(0, 5000)) {
        const a = n.attribs;
        const startMs = a.begin ? clockMs(a.begin) : Number(a.start ?? a.t) * (a.start !== undefined ? 1000 : 1);
        const endMs = a.end
          ? clockMs(a.end)
          : startMs +
            (a.dur?.includes(":") || a.dur?.endsWith("s")
              ? clockMs(a.dur)
              : Number(a.dur ?? a.d ?? 0) * (a.start !== undefined ? 1000 : 1));
        raw.push({ startMs, endMs, text: DomUtils.textContent(n) });
      }
    }
  } catch {
    return [];
  }
  const result: TranscriptSegment[] = [];
  let chars = 0;
  for (const segment of raw) {
    if (
      !Number.isFinite(segment.startMs) ||
      !Number.isFinite(segment.endMs) ||
      segment.startMs < 0 ||
      segment.endMs < segment.startMs ||
      segment.endMs > 86400000
    )
      continue;
    segment.startMs = Math.round(segment.startMs);
    segment.endMs = Math.round(segment.endMs);
    segment.text = plain(segment.text);
    if (!segment.text || segment.text.length > 2000) continue;
    const previous = result.at(-1);
    if (previous && segment.startMs < previous.startMs) continue;
    if (previous && segment.startMs <= previous.endMs && segment.text === previous.text) {
      previous.endMs = Math.max(previous.endMs, segment.endMs);
      continue;
    }
    if (previous && segment.startMs <= previous.endMs && segment.text.startsWith(previous.text + " "))
      segment.text = segment.text.slice(previous.text.length).trim();
    if ((chars += segment.text.length) > 120000) break;
    result.push(segment);
  }
  return result;
}
export function timestampLabel(ms: number) {
  const s = Math.floor(ms / 1000),
    h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60);
  return (h ? `${h}:${String(m).padStart(2, "0")}` : String(m)) + ":" + String(s % 60).padStart(2, "0");
}
export function transcriptChunks(
  segments: TranscriptSegment[],
  meta: Omit<TranscriptChunk, keyof TranscriptSegment>,
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  for (const s of segments) {
    const last = chunks.at(-1);
    if (
      last &&
      s.startMs - last.startMs <= 25000 &&
      s.startMs - last.endMs < 6000 &&
      last.text.length + s.text.length < 700
    ) {
      last.endMs = Math.max(last.endMs, s.endMs);
      last.text += " " + s.text;
    } else chunks.push({ ...meta, ...s });
  }
  return chunks;
}
export function searchTranscript(chunks: TranscriptChunk[], query: string) {
  const explicit = /\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/.exec(query);
  if (explicit) {
    if (Number(explicit[3]) >= 60 || (explicit[1] && Number(explicit[2]) >= 60)) return [];
    const time = (Number(explicit[1] ?? 0) * 3600 + Number(explicit[2]) * 60 + Number(explicit[3])) * 1000;
    return chunks.filter((c) => c.startMs <= time + 5000 && c.endMs >= time - 5000).slice(0, 3);
  }
  const topic = query
    .replace(/https:\/\/\S+/g, " ")
    .replace(
      /\b(?:when|where|does|did|he|she|they|it|the|this|that|video|discuss|talk|about|mention|say|please|at|time|timestamp)\b/gi,
      " ",
    )
    .replace(
      /(?<![\p{L}])(?:в какой момент|где|когда|автор|говорит|рассказывает|видео|про|объясняет|таймкод)(?![\p{L}])/giu,
      " ",
    )
    .trim();
  if (!topic) return [];
  const terms = [...new Set(topic.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
  return chunks
    .map((c) => ({
      c,
      score: terms.filter((term) => new Set(c.text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).has(term)).length,
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.c.startMs - b.c.startMs)
    .slice(0, 3)
    .map((r) => r.c);
}

/** Author-published captions, not a third-party scraping service. Every mapping is checked live. */
export class CreatorCaptionArchive implements TranscriptProvider {
  readonly id = "creator-published-3blue1brown";
  async retrieve(videoId: string, language: string, get: TranscriptGet): Promise<TranscriptResult | undefined> {
    const directories: Record<string, string> = {
      aircAruvnKk: "neural-networks",
      "IHZwWFHWa-w": "gradient-descent",
      Ilg3gGewQ5U: "backpropagation",
      tIeHLnjs5U8: "backpropagation-calculus",
    };
    const directory = directories[videoId];
    if (!directory) return undefined;
    const root = "https://raw.githubusercontent.com/3b1b/captions/main/2017/" + directory;
    const identity = publicUrl((await get(root + "/video_url.txt", 2048)).body.trim());
    const found =
      identity.hostname === "youtu.be"
        ? identity.pathname.slice(1)
        : identity.hostname === "www.youtube.com"
          ? identity.searchParams.get("v")
          : undefined;
    if (found !== videoId) throw new Error("Creator archive video identity mismatch");
    const lang = language.startsWith("ru") ? "russian" : language.startsWith("uk") ? "ukrainian" : "english";
    for (const choice of [...new Set([lang, "english"])]) {
      try {
        const sourceUrl = root + "/" + choice + "/captions.srt";
        const segments = normalizeTranscript((await get(sourceUrl, 600000)).body);
        if (segments.length)
          return {
            segments,
            language: choice === "russian" ? "ru" : choice === "ukrainian" ? "uk" : "en",
            provider: this.id,
            sourceUrl,
          };
      } catch (error) {
        if (/abort|timeout|cancel|budget/i.test(String(error))) throw error;
      }
    }
    return undefined;
  }
}

export type CaptionTrack = { baseUrl: string; languageCode?: string; kind?: string };
export async function retrieveCaptions(videoId: string, tracks: CaptionTrack[], language: string, get: TranscriptGet) {
  const attempts: TranscriptAttempt[] = [];
  const selected = tracks
    .filter((t) => t != null && typeof t.baseUrl === "string")
    .sort(
      (a, b) =>
        Number(b.languageCode === language) - Number(a.languageCode === language) ||
        Number(a.kind === "asr") - Number(b.kind === "asr"),
    )
    .slice(0, 2);
  for (const track of selected) {
    try {
      const url = publicUrl(track.baseUrl);
      if (
        !/(^|\.)youtube\.com$/.test(url.hostname) ||
        url.pathname !== "/api/timedtext" ||
        (url.searchParams.has("v") && url.searchParams.get("v") !== videoId)
      )
        throw new Error("Invalid caption identity or source");
      const segments = normalizeTranscript((await get(url.href, 600000)).body);
      if (segments.length)
        return {
          result: {
            segments,
            language: track.languageCode ?? "und",
            provider: "youtube-advertised-captions",
            sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          },
          attempts: [...attempts, { provider: "youtube-advertised-captions", status: "available" as const }],
        };
      attempts.push({
        provider: "youtube-advertised-captions",
        status: "unavailable",
        reason: "Empty or invalid caption body",
      });
    } catch (error) {
      if (/abort|timeout|cancel|budget/i.test(String(error))) throw error;
      attempts.push({
        provider: "youtube-advertised-captions",
        status: "unavailable",
        reason: "Caption source unavailable or invalid",
      });
    }
  }
  const provider = new CreatorCaptionArchive();
  try {
    const result = await provider.retrieve(videoId, language, get);
    attempts.push({
      provider: provider.id,
      status: result ? "available" : "unavailable",
      ...(!result ? { reason: "No matching publicly published creator captions" } : {}),
    });
    return { result, attempts };
  } catch (error) {
    if (/abort|timeout|cancel|budget/i.test(String(error))) throw error;
    attempts.push({
      provider: provider.id,
      status: "unavailable",
      reason: "Creator archive unavailable or identity mismatch",
    });
    return { result: undefined, attempts };
  }
}
