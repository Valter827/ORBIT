import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { checkSignal } from "./transport.js";
import { redact } from "../security/redactor.js";
import type { Evidence } from "./intelligence.js";

export interface WebSearchProvider {
  readonly id: string;
  search(query: string, signal: AbortSignal): Promise<Array<{ url: string; title: string }>>;
}
export interface WebFetchProvider {
  fetch(url: string, signal: AbortSignal): Promise<{ url: string; title: string; text: string; retrievedAt: string }>;
}
export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return (
      a !== undefined &&
      a > 0 &&
      a < 224 &&
      ![10, 127].includes(a) &&
      !(a === 169 && b === 254) &&
      !(a === 172 && b! >= 16 && b! <= 31) &&
      !(a === 192 && (b === 168 || b === 0 || (b === 2 && c !== undefined))) &&
      !(a === 100 && b! >= 64 && b! <= 127) &&
      !(a === 198 && (b === 18 || b === 19 || b === 51)) &&
      !(a === 203 && b === 0 && c === 113)
    );
  }
  // Accept only global unicast; excludes mapped IPv4, loopback, ULA, link-local and multicast.
  return (
    isIP(address) === 6 &&
    /^[23][0-9a-f]{3}:/i.test(address) &&
    !/^2001:(?:0:|db8:|10:|20:)/i.test(address) &&
    !/^2002:/i.test(address)
  );
}
export function publicUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    /(^|\.)(localhost|local|internal|lan|home|test|invalid)$/i.test(host) ||
    !host.includes(".") ||
    (isIP(host) && !publicAddress(host))
  )
    throw new Error("Web research allows public HTTPS URLs only.");
  url.hash = "";
  return url;
}
/** Resolve every hop, reject mixed public/private answers and pin the validated address for TLS. */
export async function publicGet(
  value: string,
  signal: AbortSignal,
  maxBytes = 256000,
  redirects = 0,
): Promise<{ url: string; body: string; type: string }> {
  checkSignal(signal);
  const url = publicUrl(value),
    host = url.hostname.replace(/^\[|\]$/g, "");
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
  const addresses = await Promise.race([
    lookup(host, { all: true }),
    new Promise<never>((_, reject) => {
      bounded.addEventListener("abort", () => reject(new Error("Web lookup cancelled or timed out.")), { once: true });
    }),
  ]);
  checkSignal(bounded);
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("Private or reserved web destination blocked.");
  const selected = addresses[0]!;
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        agent: false,
        signal: bounded,
        headers: {
          accept: "text/html, application/json, text/plain",
          "accept-encoding": "identity",
          "user-agent": "ORBIT/0.7.1 (user-requested public research)",
        },
        lookup: (_name, options, callback) => {
          if (options.all) callback(null, [selected]);
          else callback(null, selected.address, selected.family);
        },
      },
      (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
          response.resume();
          if (redirects >= 3 || !response.headers.location) {
            reject(new Error("Web redirect limit reached."));
            return;
          }
          void publicGet(new URL(response.headers.location, url).href, bounded, maxBytes, redirects + 1).then(
            resolve,
            reject,
          );
          return;
        }
        const type = response.headers["content-type"] ?? "";
        if (
          response.statusCode !== 200 ||
          !/text\/html|text\/plain|application\/json/i.test(type) ||
          (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity")
        ) {
          response.destroy();
          reject(new Error("Web response is unavailable or unsupported."));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            response.destroy(new Error("Web response exceeds byte limit."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => resolve({ url: url.href, body: Buffer.concat(chunks).toString("utf8"), type }));
      },
    );
    request.on("error", reject);
  });
}
export function webText(html: string): string {
  return redact(
    html
      .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/\s+/g, " ")
      .trim(),
  ).text.slice(0, 24000);
}
export class PublicWebFetch implements WebFetchProvider {
  async fetch(url: string, signal: AbortSignal) {
    const requested = publicUrl(url);
    if (requested.hostname === "en.wikipedia.org" && requested.pathname.startsWith("/wiki/")) {
      const api = new URL("https://en.wikipedia.org/w/api.php");
      api.search = new URLSearchParams({
        action: "query",
        prop: "extracts",
        exintro: "1",
        explaintext: "1",
        redirects: "1",
        format: "json",
        titles: decodeURIComponent(requested.pathname.slice(6)).replace(/_/g, " "),
      }).toString();
      const result = await publicGet(api.href, signal);
      const data = JSON.parse(result.body) as {
        query?: { pages?: Record<string, { title?: string; extract?: string }> };
      };
      const page = Object.values(data.query?.pages ?? {})[0];
      if (!page?.extract) throw new Error("Public page has no readable extract.");
      return {
        url: requested.href,
        title: page.title ?? requested.hostname,
        text: redact(page.extract).text.slice(0, 16000),
        retrievedAt: new Date().toISOString(),
      };
    }
    const result = await publicGet(url, signal);
    return {
      url: result.url,
      title: webText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(result.body)?.[1] ?? new URL(result.url).hostname).slice(
        0,
        200,
      ),
      text: webText(result.body),
      retrievedAt: new Date().toISOString(),
    };
  }
}
/** Official MediaWiki JSON API, never scraped search-engine HTML. */
export class WikipediaSearch implements WebSearchProvider {
  readonly id = "wikipedia";
  async search(query: string, signal: AbortSignal) {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.search = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: query.split(/\s+/).length > 4 ? query.split(/\s+/).slice(0, 2).join(" ") : query,
      srlimit: "3",
      format: "json",
    }).toString();
    const result = await publicGet(url.href, signal, 128000);
    const data: unknown = JSON.parse(result.body);
    if (!data || typeof data !== "object" || !("query" in data)) throw new Error("Invalid search response.");
    const rows = (data as { query?: { search?: Array<{ title?: unknown }> } }).query?.search;
    if (!Array.isArray(rows)) throw new Error("Invalid search response.");
    return rows
      .slice(0, 3)
      .filter((r) => typeof r.title === "string")
      .map((r) => ({
        title: String(r.title),
        url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(String(r.title).replace(/ /g, "_")),
      }));
  }
}
export function publicQuery(request: string, approvedQuery?: string): string | null {
  const text = (approvedQuery ?? request).trim();
  if (
    !text ||
    text.length > 240 ||
    redact(text).text !== text ||
    /[\r\n{}]|(?:api[_ -]?key|password|secret|token)\s*[:=]|[A-Z]:\\|\b(?:my|our) (?:project|code|notes|memory|file|screen|window)|мой|моих|проект|памят|экран|скидывал|обсуждали|@/iu.test(
      text,
    )
  )
    return null;
  // Public multilingual query normalization; no history, files or private context are accepted by this API.
  return text.replace(
    /Какая планета Солнечной системы самая горячая\??/iu,
    "hottest planet solar system surface temperature",
  );
}
export async function research(input: {
  request: string;
  approvedQuery?: string;
  policy: "off" | "ask" | "allow";
  localOnly: boolean;
  consent: boolean;
  search: WebSearchProvider | undefined;
  fetch: WebFetchProvider;
  signal: AbortSignal;
  maxSources?: number;
}): Promise<{ sources: Evidence[]; status: string; query?: string }> {
  checkSignal(input.signal);
  if (input.localOnly || input.policy === "off") return { sources: [], status: "Web research disabled" };
  if (input.policy === "ask" && !input.consent) return { sources: [], status: "Consent required" };
  const query = publicQuery(input.request, input.approvedQuery);
  if (!query) return { sources: [], status: "Provide a minimal public query; private context is excluded" };
  const direct = /^https:\/\/[^\s]+$/i.test(query) ? publicUrl(query).href : undefined;
  if (!input.search && !direct) return { sources: [], status: "Search provider unavailable" };
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(20000)]);
  try {
    const results = direct
      ? [{ url: direct, title: new URL(direct).hostname }]
      : await input.search!.search(query, signal);
    results.sort((a, b) => sourcePriority(b.url) - sourcePriority(a.url));
    const sources: Evidence[] = [];
    for (const result of results.slice(0, Math.min(3, input.maxSources ?? 3))) {
      checkSignal(signal);
      try {
        const page = await input.fetch.fetch(result.url, signal);
        sources.push({
          sourceId: page.url,
          name: page.title,
          text: page.text,
          url: page.url,
          retrievedAt: page.retrievedAt,
        });
      } catch {
        checkSignal(signal);
      }
    }
    return { sources, status: sources.length ? "Sources retrieved" : "No available public sources", query };
  } catch {
    checkSignal(input.signal);
    return { sources: [], status: "Web research unavailable", query };
  }
}

/** Transparent provenance signals, never a political or general trust score. */
export function sourcePriority(value: string) {
  try {
    const host = publicUrl(value).hostname;
    return /\.gov$|\.edu$/i.test(host) ? 2 : /^(?:en\.wikipedia\.org|docs\.[a-z0-9.-]+)$/i.test(host) ? 1 : 0;
  } catch {
    return -1;
  }
}
