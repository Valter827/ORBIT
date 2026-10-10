import { createHash, randomUUID } from "node:crypto";
import { parseDocument, DomUtils } from "htmlparser2";
import { publicGet, publicUrl, publicQuery } from "./web-research.js";
import { checkSignal } from "./transport.js";
import { relevance, type Evidence } from "./intelligence.js";
import {
  normalizeTranscript,
  retrieveCaptions,
  transcriptChunks,
  searchTranscript,
  timestampLabel,
  localMediaCapabilities,
  type CaptionTrack,
  type TranscriptChunk,
  type TranscriptAttempt,
} from "./transcripts.js";

export type InternetPolicy = { policy: "off" | "ask" | "allow"; localOnly: boolean; consent?: boolean };
export type SearchInput = { query: string; limit?: number; language?: string; region?: string; freshness?: string };
export type SearchResult = { title: string; url: string; snippet: string; provider: string; retrievedAt: string };
export type WebPage = {
  id: string;
  url: string;
  title: string;
  text: string;
  retrievedAt: string;
  hash: string;
  links: Array<{ title: string; url: string }>;
  depth: number;
  mode: "Page" | "Transcript" | "Metadata only";
  channel?: string;
  duration?: string;
  transcript?: "available" | "unavailable";
  video?: {
    id: string;
    capabilities: {
      metadata: "available" | "unavailable";
      transcript: "available" | "unavailable";
      visual: "unavailable";
      audioTranscription: "unavailable";
    };
    language?: string;
    provider?: string;
    sourceUrl?: string;
    attempts: TranscriptAttempt[];
    chunks: TranscriptChunk[];
  };
  segments?: Array<{ seconds: number; text: string; url: string }>;
};
export type InternetResult = {
  sources: Evidence[];
  status: string;
  query?: string;
  results?: SearchResult[];
  pageId?: string;
  requestedSources?: number;
  usableSources?: number;
};
type Get = (url: string, bytes?: number) => ReturnType<typeof publicGet>;
export interface InternetSearchProvider {
  readonly id: string;
  search(input: SearchInput, get: Get): Promise<SearchResult[]>;
}
export interface YouTubeProvider {
  read(url: string, get: Get, language?: string): Promise<WebPage>;
  search(query: string, get: Get): Promise<SearchResult[]>;
  metadata(id: string, get: Get): Promise<{ title: string; channel: string }>;
  discover(id: string, get: Get): Promise<CaptionTrack[]>;
}
export interface PlacesProvider {
  find(query: string, get: Get): Promise<SearchResult[]>;
}
export interface PublicMetadataProvider {
  steam(query: string, get: Get): Promise<SearchResult[]>;
}
export function normalizeWebUrl(value: string) {
  const url = publicUrl(value);
  for (const k of [...url.searchParams.keys()])
    if (/^(utm_|fbclid$|gclid$|msclkid$)/i.test(k)) url.searchParams.delete(k);
  return url.href;
}
export function internetIntent(text: string) {
  const url = text.match(/https:\/\/[^\s<>"\]]+/i)?.[0]?.replace(/[).,!?]+$/, "");
  const fresh =
    /latest|current|today|price|news|schedule|сейчас|сегодня|последн|новый|актуальн|текущ.{0,8}верси|цен[аыу]|новост|расписан|открыто ли/iu.test(
      text,
    );
  const near = /near me|nearby|рядом со мной|поблизости|рядом купить/iu.test(text);
  const places = near || /магазин|кафе|ресторан|shops?|restaurants?|caf[eé]s?/iu.test(text);
  const youtube = /youtube|ютуб|видео|video/iu.test(text);
  const steam = /steam|стим/iu.test(text);
  const research = /research|compare|investigate|исследуй|сравни/iu.test(text);
  const privateIntent = /наши|нашем|мы решили|мы обсуждали|our |my notes|memory|памят|экран|screen|README/iu.test(text);
  const requested =
    !!url ||
    (!privateIntent &&
      (fresh ||
        places ||
        youtube ||
        steam ||
        research ||
        /search|browse|find.*(?:site|link)|найди|ссылк|официальн|посмотри.{0,12}сайт/iu.test(text)));
  return { url, fresh, near, places, youtube, steam, research, requested };
}
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
function content(node: ReturnType<typeof parseDocument>["children"][number]): string {
  if ("data" in node && !("name" in node)) return node.data;
  if ("name" in node && "attribs" in node && /^(svg|img)$/i.test(node.name))
    return clean(node.attribs["aria-label"] ?? node.attribs.alt ?? "").slice(0, 240);
  if ("name" in node && /^(script|style|noscript|nav|footer|header|form|button|iframe)$/i.test(node.name)) return "";
  return "children" in node ? node.children.map(content).join(" ") : "";
}
export function extractPage(html: string, url: string, depth = 0): WebPage {
  const doc = parseDocument(html),
    tags = DomUtils.findAll(() => true, doc.children);
  const title = clean(content(tags.find((n) => n.name === "title") ?? doc)).slice(0, 240) || new URL(url).hostname;
  const main =
    tags.find((n) => n.name === "main" || n.name === "article") ?? tags.find((n) => n.name === "body") ?? doc;
  const blocks = DomUtils.findAll(
    (n) => /^(h[1-6]|p|li|tr|pre)$/.test(n.name),
    "children" in main ? main.children : [],
  );
  const text = [...new Set(blocks.map((n) => clean(content(n))).filter(Boolean))].join("\n") || clean(content(main));
  const links: WebPage["links"] = [];
  for (const node of tags.filter((n) => n.name === "a" && n.attribs.href)) {
    try {
      const target = normalizeWebUrl(new URL(node.attribs.href!, url).href);
      if (!links.some((l) => l.url === target))
        links.push({ url: target, title: clean(content(node)).slice(0, 160) || target });
    } catch {
      /* Unsafe links are not navigable. */
    }
    if (links.length >= 80) break;
  }
  return {
    id: randomUUID(),
    url: normalizeWebUrl(url),
    title,
    text: text.slice(0, 32000),
    retrievedAt: new Date().toISOString(),
    hash: createHash("sha256").update(text).digest("hex"),
    links,
    depth,
    mode: "Page",
  };
}
export class BingPublicSearch implements InternetSearchProvider {
  readonly id = "bing-public-rss";
  async search(input: SearchInput, get: Get) {
    const url = new URL("https://www.bing.com/search");
    url.searchParams.set("format", "rss");
    url.searchParams.set("q", input.query);
    if (input.language) url.searchParams.set("setlang", input.language);
    const response = await get(url.href, 180000),
      doc = parseDocument(response.body, { xmlMode: true });
    const items = DomUtils.findAll((n) => n.name === "item", doc.children);
    if (!items.length && !response.body.includes("<rss"))
      throw new Error("Search provider unavailable; access may require interaction.");
    const results: SearchResult[] = [];
    for (const item of items) {
      const field = (name: string) =>
        clean(DomUtils.textContent(DomUtils.findAll((n) => n.name === name, item.children)[0] ?? item));
      try {
        results.push({
          title: field("title").slice(0, 240),
          url: normalizeWebUrl(field("link")),
          snippet: field("description").slice(0, 800),
          provider: this.id,
          retrievedAt: new Date().toISOString(),
        });
      } catch {
        /* Skip unsafe provider results. */
      }
    }
    return results.slice(0, Math.min(8, input.limit ?? 5));
  }
}
export class DuckPublicSearch implements InternetSearchProvider {
  readonly id = "duckduckgo-public";
  async search(input: SearchInput, get: Get) {
    const url = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(input.query);
    const html = (await get(url, 350000)).body,
      doc = parseDocument(html);
    if (/anomaly.js|challenge-form|bots use DuckDuckGo/.test(html))
      throw new Error("Search provider unavailable: requires user interaction.");
    const anchors = DomUtils.findAll(
      (n) => n.name === "a" && (n.attribs.class ?? "").split(" ").includes("result__a"),
      doc.children,
    );
    const rows: SearchResult[] = [];
    for (const a of anchors) {
      try {
        const raw = new URL(a.attribs.href ?? "", url);
        const target = normalizeWebUrl(raw.searchParams.get("uddg") ?? raw.href);
        let parent = a.parent;
        for (let depth = 0; parent && depth < 4; depth++, parent = parent.parent) {
          if ("attribs" in parent && (parent.attribs.class ?? "").split(" ").includes("result")) break;
        }
        const snippet =
          parent && "children" in parent
            ? DomUtils.findAll((n) => (n.attribs.class ?? "").includes("result__snippet"), parent.children)[0]
            : undefined;
        rows.push({
          title: clean(content(a)).slice(0, 240),
          url: target,
          snippet: snippet ? clean(content(snippet)).slice(0, 800) : "",
          provider: this.id,
          retrievedAt: new Date().toISOString(),
        });
      } catch {
        /* Untrusted result links are individually validated. */
      }
    }
    return rows.slice(0, Math.min(8, input.limit ?? 5));
  }
}
/** Parse a public JSON object embedded in a page, without evaluating JavaScript. */
export function embeddedJson(html: string, marker: string): unknown {
  const at = html.indexOf(marker);
  if (at < 0) return undefined;
  const start = html.indexOf("{", at + marker.length);
  if (start < 0) return undefined;
  let depth = 0,
    quoted = false,
    escape = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (quoted) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  return undefined;
}
function videoRows(data: unknown): SearchResult[] {
  const rows: SearchResult[] = [],
    stack: unknown[] = [data];
  let visited = 0;
  while (stack.length && visited++ < 50000 && rows.length < 8) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    const obj = node as Record<string, unknown>;
    const v = obj.videoRenderer as
      | {
          videoId?: string;
          title?: { runs?: Array<{ text: string }> };
          ownerText?: { runs?: Array<{ text: string }> };
          lengthText?: { simpleText?: string };
          publishedTimeText?: { simpleText?: string };
        }
      | undefined;
    if (v?.videoId && /^[\w-]{11}$/.test(v.videoId)) {
      const title = v.title?.runs?.map((r) => r.text).join("") ?? "YouTube video";
      rows.push({
        title,
        url: "https://www.youtube.com/watch?v=" + v.videoId,
        snippet: [
          v.ownerText?.runs?.map((r) => r.text).join(""),
          v.lengthText?.simpleText,
          v.publishedTimeText?.simpleText,
        ]
          .filter(Boolean)
          .join(" · "),
        provider: "youtube-public",
        retrievedAt: new Date().toISOString(),
      });
    }
    for (const value of Object.values(obj).reverse()) if (value && typeof value === "object") stack.push(value);
  }
  return rows;
}
export class PublicPlaces implements PlacesProvider {
  private static last = 0;
  private static cache = new Map<string, { at: number; rows: SearchResult[] }>();
  async find(query: string, get: Get) {
    const city = /харьков|харків|kharkiv|kharkov/iu.test(query)
      ? "Kharkiv"
      : /киев|київ|kyiv|kiev/iu.test(query)
        ? "Kyiv"
        : query.match(/(?: in | в | у )([\p{L} -]{2,50})[.!?]?$/u)?.[1];
    if (!city) throw new Error("Location required: specify a city or area. No location is inferred.");
    const category = /компьютер|computer/iu.test(query)
      ? "computer shop"
      : /кафе|cafe/iu.test(query)
        ? "cafe"
        : /ресторан|restaurant/iu.test(query)
          ? "restaurant"
          : "shop";
    const q = category + " " + city,
      key = q.toLowerCase(),
      cached = PublicPlaces.cache.get(key);
    if (cached && Date.now() - cached.at < 600000) return cached.rows;
    if (Date.now() - PublicPlaces.last < 1100)
      throw new Error("Places temporarily unavailable: wait one second before another lookup.");
    PublicPlaces.last = Date.now();
    const u = new URL("https://nominatim.openstreetmap.org/search");
    u.search = new URLSearchParams({ q, format: "jsonv2", limit: "5", addressdetails: "1", extratags: "1" }).toString();
    const data = JSON.parse((await get(u.href, 150000)).body) as Array<{
      osm_type: string;
      osm_id: number;
      name: string;
      display_name: string;
      extratags?: Record<string, string>;
    }>;
    if (!Array.isArray(data)) throw new Error("Places provider unavailable.");
    const rows = data
      .filter((r) => /^(node|way|relation)$/.test(r.osm_type) && Number.isSafeInteger(r.osm_id) && r.name)
      .map((r) => ({
        title: r.name,
        url: "https://www.openstreetmap.org/" + r.osm_type + "/" + r.osm_id,
        snippet:
          r.display_name +
          (r.extratags?.opening_hours ? " · Hours (source data): " + r.extratags.opening_hours : "") +
          (r.extratags?.website ? " · Website (source data): " + r.extratags.website : ""),
        provider: "OpenStreetMap / Nominatim · © OpenStreetMap contributors, ODbL",
        retrievedAt: new Date().toISOString(),
      }));
    while (PublicPlaces.cache.size >= 20) PublicPlaces.cache.delete(PublicPlaces.cache.keys().next().value!);
    PublicPlaces.cache.set(key, { at: Date.now(), rows });
    return rows;
  }
}
export class SteamMetadata implements PublicMetadataProvider {
  async steam(query: string, get: Get) {
    const term = query
      .replace(
        /(?<![\p{L}\p{N}])(?:скинь|ссылку|ссылка|найди|на|в|и|с|игру|игра|игры|steam|стим|find|link|game|store|on|the|send|me|for)(?![\p{L}\p{N}])/giu,
        " ",
      )
      .replace(/[^\p{L}\p{N} :'-]/gu, " ")
      .trim();
    const url = new URL("https://store.steampowered.com/api/storesearch/");
    url.search = new URLSearchParams({
      term: /\brust\b/i.test(query) ? "Rust" : clean(term),
      l: "english",
      cc: "US",
    }).toString();
    const data = JSON.parse((await get(url.href, 150000)).body) as {
      items?: Array<{ id: number; name: string; type: string; price?: { currency?: string; final?: number } }>;
    };
    return (data.items ?? [])
      .filter((x) => x.type === "app" && Number.isSafeInteger(x.id) && typeof x.name === "string")
      .sort(
        (a, b) =>
          Number(b.name.toLowerCase() === clean(term).toLowerCase()) -
          Number(a.name.toLowerCase() === clean(term).toLowerCase()),
      )
      .slice(0, 5)
      .map((x) => ({
        title: x.name,
        url: `https://store.steampowered.com/app/${x.id}/`,
        snippet:
          x.price?.currency === "USD" && Number.isSafeInteger(x.price.final) && x.price.final! >= 0
            ? "Official Steam Store search metadata: " +
              x.name +
              " costs USD " +
              (x.price.final! / 100).toFixed(2) +
              " in the US store region at retrieval time. Price can change; other regions and stock are not verified."
            : "Official Steam Store search result. Price/stock not verified.",
        provider: "steam-store",
        retrievedAt: new Date().toISOString(),
      }));
  }
}
export function youtubeId(value: string): string | undefined {
  const u = publicUrl(value),
    host = u.hostname.replace(/^www\./, "");
  const id =
    host === "youtu.be"
      ? u.pathname.slice(1)
      : host === "youtube.com"
        ? (u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1])
        : undefined;
  return id && /^[\w-]{11}$/.test(id) ? id : undefined;
}
export function timestampUrl(id: string, seconds: number) {
  return `https://www.youtube.com/watch?v=${id}&t=${Math.max(0, Math.floor(seconds))}s`;
}
export function parseTranscript(body: string, id: string) {
  return normalizeTranscript(body).map((s) => ({
    ...s,
    seconds: s.startMs / 1000,
    url: timestampUrl(id, s.startMs / 1000),
  }));
}
export class PublicYouTube implements YouTubeProvider {
  async search(query: string, get: Get) {
    const html = (await get("https://www.youtube.com/results?search_query=" + encodeURIComponent(query), 3000000)).body;
    if (!html.trim() || /challenge-form|unusual traffic|consent.youtube.com\/m/i.test(html))
      throw new Error("YouTube search provider unavailable or requires interaction.");
    const rows = videoRows(embeddedJson(html, "var ytInitialData ="));
    if (!rows.length) throw new Error("YouTube search unavailable: no public video results.");
    return rows;
  }
  async metadata(id: string, get: Get) {
    const url = "https://www.youtube.com/watch?v=" + id;
    const meta = JSON.parse(
      (await get("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(url), 64000)).body,
    ) as { title?: string; author_name?: string };
    if (typeof meta.title !== "string" || !meta.title.trim()) throw new Error("YouTube metadata unavailable.");
    return { title: meta.title.slice(0, 240), channel: String(meta.author_name ?? "Unknown channel").slice(0, 160) };
  }
  async discover(id: string, get: Get): Promise<CaptionTrack[]> {
    const html = (await get("https://www.youtube.com/watch?v=" + id, 2000000)).body;
    const player = embeddedJson(html, "ytInitialPlayerResponse =") as
      | {
          videoDetails?: { videoId?: string };
          captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
        }
      | undefined;
    if (player?.videoDetails?.videoId && player.videoDetails.videoId !== id) throw new Error("Video identity mismatch");
    if (player) return player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const match = /"captionTracks"\s*:\s*(\[.*?\])/.exec(html);
    return match ? (JSON.parse(match[1]!) as CaptionTrack[]) : [];
  }
  async read(value: string, get: Get, language = "en"): Promise<WebPage> {
    const id = youtubeId(value);
    if (!id) throw new Error("Unsupported YouTube URL.");
    let meta = { title: "YouTube video", channel: "Unknown channel" },
      metadata: "available" | "unavailable" = "unavailable";
    try {
      meta = await this.metadata(id, get);
      metadata = "available";
    } catch (error) {
      if (/abort|cancel|timeout|budget/i.test(String(error))) throw error;
    }
    let tracks: CaptionTrack[] = [];
    const attempts: TranscriptAttempt[] = [];
    try {
      tracks = await this.discover(id, get);
    } catch (error) {
      if (/abort|cancel|timeout|budget/i.test(String(error))) throw error;
      attempts.push({
        provider: "youtube-track-discovery",
        status: "unavailable",
        reason: "Public caption discovery unavailable",
      });
    }
    const captions = await retrieveCaptions(id, tracks, language, get);
    attempts.push(...captions.attempts);
    const result = captions.result,
      chunks = result
        ? transcriptChunks(result.segments, {
            videoId: id,
            title: meta.title,
            channel: meta.channel,
            language: result.language,
          })
        : [];
    const text = result
      ? result.segments
          .map((s) => "[" + timestampLabel(s.startMs) + "–" + timestampLabel(s.endMs) + "] " + s.text)
          .join("\n")
      : "Transcript unavailable. Only title/channel metadata was accessed; the video has not been watched. Visual analysis and local audio transcription are unavailable in this build.";
    return {
      id: randomUUID(),
      url: "https://www.youtube.com/watch?v=" + id,
      title: meta.title,
      channel: meta.channel,
      text,
      retrievedAt: new Date().toISOString(),
      hash: createHash("sha256").update(text).digest("hex"),
      links: result ? [{ title: "Published transcript source", url: result.sourceUrl }] : [],
      depth: 0,
      mode: result ? "Transcript" : "Metadata only",
      transcript: result ? "available" : "unavailable",
      ...(result
        ? {
            segments: result.segments.map((s) => ({
              ...s,
              seconds: s.startMs / 1000,
              url: timestampUrl(id, s.startMs / 1000),
            })),
          }
        : {}),
      video: {
        id,
        capabilities: { metadata, transcript: result ? "available" : "unavailable", ...localMediaCapabilities },
        ...(result ? { language: result.language, provider: result.provider, sourceUrl: result.sourceUrl } : {}),
        attempts,
        chunks,
      },
    };
  }
}
export function assertInternet(policy: InternetPolicy) {
  if (policy.localOnly) throw new Error("Local Only: public Internet is blocked.");
  if (policy.policy === "off") throw new Error("Internet Off.");
  if (policy.policy === "ask" && !policy.consent) throw new Error("Permission required for public Internet access.");
}
/** Per-AI ephemeral reader. Providers only receive this guarded, bounded GET capability. */
export class InternetGateway {
  private pages = new Map<string, WebPage>();
  private cooling = new Map<string, number>();
  private active = new Set<AbortController>();
  private requests = 0;
  private health = new Map<string, { status: "Healthy" | "Rate limited" | "Temporarily unavailable"; at: string }>();
  status() {
    return { requests: this.requests, providers: Object.fromEntries(this.health), renderedPages: "NOT IMPLEMENTED" };
  }
  constructor(
    private transport = publicGet,
    readonly searchProvider: InternetSearchProvider = new BingPublicSearch(),
  ) {}
  cancel() {
    for (const c of this.active) c.abort();
    this.active.clear();
  }
  clear() {
    this.cancel();
    this.pages.clear();
  }
  page(id: string) {
    const p = this.pages.get(id);
    if (!p || Date.now() - Date.parse(p.retrievedAt) > 600000) {
      this.pages.delete(id);
      throw new Error("Page context expired. Open the page again.");
    }
    return p;
  }
  remember(p: WebPage) {
    while (this.pages.size >= 12) this.pages.delete(this.pages.keys().next().value!);
    this.pages.set(p.id, p);
    return p;
  }
  async session<T>(policy: InternetPolicy, signal: AbortSignal, work: (get: Get) => Promise<T>) {
    assertInternet(policy);
    checkSignal(signal);
    const controller = new AbortController();
    this.active.add(controller);
    const bounded = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(45000)]);
    let count = 0,
      bytes = 0;
    const get: Get = async (url, limit = 700000) => {
      assertInternet(policy);
      checkSignal(bounded);
      const host = publicUrl(url).hostname;
      if (++count > 12 || bytes >= 4000000) throw new Error("Internet request budget reached.");
      if ((this.cooling.get(host) ?? 0) > Date.now())
        throw new Error("Search temporarily unavailable: provider cooling down.");
      try {
        this.requests++;
        const r = await this.transport(url, bounded, Math.min(limit, 4000000 - bytes));
        this.health.set(host, { status: "Healthy", at: new Date().toISOString() });
        while (this.health.size > 32) this.health.delete(this.health.keys().next().value!);
        bytes += Buffer.byteLength(r.body);
        checkSignal(bounded);
        return r;
      } catch (e) {
        const limited = /429|503|rate limit/i.test(String(e));
        if (limited) this.cooling.set(host, Date.now() + 60000);
        this.health.set(host, {
          status: limited ? "Rate limited" : "Temporarily unavailable",
          at: new Date().toISOString(),
        });
        while (this.health.size > 32) this.health.delete(this.health.keys().next().value!);
        while (this.cooling.size > 32) this.cooling.delete(this.cooling.keys().next().value!);
        throw e;
      }
    };
    try {
      const result = await work(get);
      checkSignal(bounded);
      return result;
    } finally {
      this.active.delete(controller);
    }
  }
  async open(url: string, policy: InternetPolicy, signal: AbortSignal, refresh = false, depth = 0) {
    return this.session(policy, signal, async (get) => {
      const normalized = normalizeWebUrl(url);
      const cached = [...this.pages.values()].find(
        (p) => p.url === normalized && Date.now() - Date.parse(p.retrievedAt) < 600000,
      );
      if (cached && !refresh) return depth ? this.remember({ ...cached, id: randomUUID(), depth }) : cached;
      const page = youtubeId(normalized)
        ? await new PublicYouTube().read(normalized, get)
        : await this.read(normalized, get, depth);
      return this.remember(page);
    });
  }
  private async read(url: string, get: Get, depth = 0) {
    const response = await get(url);
    const page = extractPage(response.body, response.url, depth);
    if (!page.text.trim()) throw new Error("Page has no readable public content; rendering or login may be required.");
    return page;
  }
  async follow(id: string, url: string, policy: InternetPolicy, signal: AbortSignal) {
    const page = this.page(id);
    if (page.depth >= 2) throw new Error("Link depth limit reached.");
    const target = normalizeWebUrl(url);
    if (!page.links.some((l) => l.url === target)) throw new Error("Link does not belong to the selected public page.");
    return this.open(target, policy, signal, false, page.depth + 1);
  }
  find(id: string, query: string) {
    const page = this.page(id);
    return page.text
      .split("\n")
      .map((text, line) => ({ text, line: line + 1, score: relevance(query, text) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
  async research(
    query: string,
    policy: InternetPolicy,
    signal: AbortSignal,
    mode: string,
    provider = "bing",
    fallback = "none",
  ): Promise<InternetResult> {
    if (policy.localOnly || policy.policy === "off")
      return { sources: [], status: policy.localOnly ? "Local Only: Internet blocked" : "Internet Off" };
    const minimized = publicQuery(query);
    if (!minimized) return { sources: [], status: "Provide a minimal public query; private context is excluded" };
    if (policy.policy === "ask" && !policy.consent)
      return { sources: [], status: "Consent required", query: minimized };
    const intent = internetIntent(minimized);
    if (intent.near)
      return {
        sources: [],
        status: "Location permission required: specify a city or area; no location is inferred.",
        query: minimized,
      };
    return this.session(policy, signal, async (get) => {
      const search = async (input: SearchInput) => {
        const primary = provider === "duckduckgo" ? new DuckPublicSearch() : this.searchProvider;
        try {
          const rows = await primary.search(input, get);
          if (rows.length || fallback === "none" || fallback === provider) return rows;
        } catch (error) {
          checkSignal(signal);
          if (fallback === "none" || fallback === provider || /abort|cancel|budget/i.test(String(error))) throw error;
        }
        return (fallback === "bing" ? new BingPublicSearch() : new DuckPublicSearch()).search(input, get);
      };
      if (intent.url) {
        const page = this.remember(
          youtubeId(intent.url)
            ? await new PublicYouTube().read(intent.url, get, /[а-яё]/iu.test(query) ? "ru" : "en")
            : await this.read(intent.url, get),
        );
        return {
          sources: this.evidence(page, minimized),
          pageId: page.id,
          status: page.mode === "Metadata only" ? "Transcript unavailable — metadata only" : "Public page retrieved",
          query: minimized,
        };
      }
      if (provider === "none") return { sources: [], status: "Search provider unavailable", query: minimized };
      const officialProduct = /official|официальн/iu.test(minimized)
        ? /ollama/i.test(minimized)
          ? "ollama.com"
          : /tauri/i.test(minimized)
            ? "tauri.app"
            : /nvidia/i.test(minimized)
              ? "nvidia.com"
              : /logitech/i.test(minimized)
                ? "logitechg.com"
                : undefined
        : undefined;
      const searchQuery =
        officialProduct &&
        /website|сайт|link|ссылк/iu.test(minimized) &&
        !/updater|объясни|расскажи|how|explain/iu.test(minimized)
          ? "site:" + officialProduct + " " + officialProduct.split(".")[0] + " official website"
          : minimized;
      let results: SearchResult[];
      const runtimeResearch =
        intent.research && /runtime|рантайм/iu.test(minimized) && /local|локальн/iu.test(minimized);
      if (runtimeResearch) {
        results = [];
        for (const [query, domain] of [
          ["Ollama official documentation", "ollama.com"],
          ["LM Studio official documentation", "lmstudio.ai"],
          ["llama.cpp official GitHub", "github.com"],
        ]) {
          const rows = await search({ query: query!, limit: 5 });
          const match = rows.find((r) => {
            const u = new URL(r.url);
            return (
              (u.hostname === domain || u.hostname.endsWith("." + domain)) &&
              (domain !== "github.com" || u.pathname.includes("llama.cpp"))
            );
          });
          if (match) results.push(match);
        }
      } else if (intent.youtube) {
        const query = minimized.replace(/найди|видео|youtube|ютуб/giu, " ").trim();
        results = await new PublicYouTube().search(query, get);
      } else if (intent.places) {
        results = await new PublicPlaces().find(minimized, get);
        return {
          sources: results.map((r) => ({
            sourceId: r.url,
            name: r.title,
            url: r.url,
            text: r.snippet + " · " + r.provider,
            retrievedAt: r.retrievedAt,
          })),
          results,
          status: results.length ? "Public places retrieved (OpenStreetMap)" : "No places found in public provider",
          query: minimized,
        };
      } else if (intent.steam) results = await new SteamMetadata().steam(minimized, get);
      else if (provider === "wikipedia") {
        const u = new URL("https://en.wikipedia.org/w/api.php");
        u.search = new URLSearchParams({
          action: "query",
          list: "search",
          srsearch: minimized,
          srlimit: "5",
          format: "json",
        }).toString();
        const data = JSON.parse((await get(u.href, 180000)).body) as {
          query?: { search?: Array<{ title: string; snippet: string }> };
        };
        results = (data.query?.search ?? [])
          .filter((r) => typeof r.title === "string")
          .map((r) => ({
            title: r.title,
            snippet: clean(content(parseDocument(r.snippet ?? ""))),
            url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(r.title.replace(/ /g, "_")),
            provider: "wikipedia",
            retrievedAt: new Date().toISOString(),
          }));
      } else results = await search({ query: searchQuery, limit: 8 });
      if (
        intent.research &&
        !runtimeResearch &&
        !intent.youtube &&
        !intent.places &&
        !intent.steam &&
        provider !== "wikipedia"
      ) {
        const extra = await search({ query: minimized + " official documentation", limit: 5 });
        results.push(...extra);
      }
      if (officialProduct)
        results = results.filter((r) => {
          const host = new URL(r.url).hostname;
          return host === officialProduct || host.endsWith("." + officialProduct);
        });
      // A curated official domain is only a fetch candidate, never evidence until retrieved.
      if (officialProduct && !results.length && provider !== "wikipedia")
        results.push({
          title: officialProduct,
          url: "https://" + officialProduct + "/",
          snippet: "Official directory candidate; retrieval required",
          provider: "official-domain-directory",
          retrievedAt: new Date().toISOString(),
        });
      const seen = new Set<string>();
      results = results.filter((r) => !seen.has(r.url) && !!seen.add(r.url));
      results.sort((a, b) => officialScore(b, minimized) - officialScore(a, minimized));
      const sources: Evidence[] = [];
      const contentHashes = new Set<string>();
      const organizations = new Set<string>();
      for (const r of results.slice(
        0,
        intent.youtube ? 1 : mode === "fast" ? 1 : mode === "deep" || intent.research ? 5 : 3,
      )) {
        checkSignal(signal);
        try {
          const p = this.remember(
            youtubeId(r.url) ? await new PublicYouTube().read(r.url, get) : await this.read(r.url, get),
          );
          if (officialProduct) {
            const host = new URL(p.url).hostname;
            if (host !== officialProduct && !host.endsWith("." + officialProduct)) continue;
          }
          if (intent.steam) p.text = r.snippet + "\n" + p.text;
          const organization = new URL(p.url).hostname.replace(/^(?:www|docs|blog)\./, "");
          if (!contentHashes.has(p.hash) && (!intent.research || !organizations.has(organization))) {
            organizations.add(organization);
            contentHashes.add(p.hash);
            sources.push(...this.evidence(p, minimized));
          }
        } catch {
          checkSignal(signal);
          if (officialProduct) continue;
          sources.push({
            sourceId: r.url,
            name: r.title,
            text: "Search listing only; destination not verified. " + r.snippet,
            url: r.url,
            retrievedAt: r.retrievedAt,
          });
        }
      }
      const requestedSources = intent.research
        ? Number(/\b([2-5])\b/.exec(query)?.[1] ?? (/три|three/iu.test(query) ? 3 : mode === "deep" ? 5 : 3))
        : undefined;
      const usableSources = new Set(
        sources
          .filter((s) => !s.text.startsWith("Search listing only"))
          .map((s) => new URL(s.url!).hostname.replace(/^(?:www|docs|blog)\./, "")),
      ).size;
      return {
        sources,
        results,
        ...(requestedSources ? { requestedSources, usableSources } : {}),
        status:
          (sources.length ? "Public sources retrieved" : "No public results available") +
          (requestedSources
            ? ` · Requested sources: ${requestedSources}; usable sources: ${usableSources}${usableSources < requestedSources ? " — insufficient independent sources; comparison is partial" : ""}`
            : ""),
        query: minimized,
      };
    });
  }
  evidence(page: WebPage, query: string): Evidence[] {
    if (page.video && /what.*(?:shown|visible|see)|что.*(?:видно|показано|изображено)|кадр/iu.test(query))
      return [
        {
          sourceId: page.id,
          name: page.title,
          text: "Video visual analysis unavailable. No frames were accessed. Transcript text cannot establish what is visible in a frame.",
          url: page.url,
          retrievedAt: page.retrievedAt,
        },
      ];
    if (page.video?.chunks.length) {
      const matches = searchTranscript(page.video.chunks, query);
      const seeks = /when|timestamp|where.*(?:say|talk|mention)|в какой момент|где|когда|таймкод|\d+:\d{2}/iu.test(
        query,
      );
      if (seeks && !matches.length)
        return [
          {
            sourceId: page.id,
            name: page.title,
            text: "Transcript available, but no matching timestamp was found for this query. Do not invent a timestamp.",
            url: page.url,
            retrievedAt: page.retrievedAt,
          },
        ];
      const selected = matches.length
        ? matches
        : [
            page.video.chunks[0]!,
            page.video.chunks[Math.floor(page.video.chunks.length / 2)]!,
            page.video.chunks.at(-1)!,
          ];
      return selected.map((c) => ({
        sourceId: page.id + ":" + c.startMs,
        name: page.title + " · " + page.channel + " · " + timestampLabel(c.startMs),
        text:
          "Transcript (" +
          c.language +
          ", " +
          page.video!.provider +
          ") [" +
          timestampLabel(c.startMs) +
          "–" +
          timestampLabel(c.endMs) +
          "]: " +
          c.text +
          "\nSelected transcript excerpt; this is not full-video coverage. Transcript source: " +
          page.video!.sourceUrl,
        url: timestampUrl(c.videoId, c.startMs / 1000),
        retrievedAt: page.retrievedAt,
      }));
    }

    const excerpts = this.find(page.id, query);
    const text = (excerpts.length ? excerpts.map((x) => x.text).join("\n") : page.text).slice(0, 1800);
    return [
      {
        sourceId: page.id,
        name: page.title,
        text: `${page.mode}${page.channel ? " · " + page.channel : ""}: ${text}`,
        url: page.url,
        retrievedAt: page.retrievedAt,
      },
    ];
  }
}
function officialScore(r: SearchResult, query: string) {
  const host = new URL(r.url).hostname;
  const product = /tauri/i.test(query)
    ? "tauri.app"
    : /ollama/i.test(query)
      ? "ollama.com"
      : /nvidia/i.test(query)
        ? "nvidia.com"
        : /logitech/i.test(query)
          ? "logitechg.com"
          : undefined;
  return (
    (product && host === product && new URL(r.url).pathname === "/" && /website|сайт|link|ссылк/iu.test(query)
      ? 8
      : 0) +
    (product && (host === product || host.endsWith("." + product)) ? 10 : 0) +
    (/^(store\.steampowered\.com|github\.com|docs\.)/.test(host) ? 3 : 0) +
    relevance(query, r.title + " " + r.snippet)
  );
}
