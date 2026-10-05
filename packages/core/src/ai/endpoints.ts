import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import { Readable } from "node:stream";
import { isIP } from "node:net";
import type { Fetcher } from "./transport.js";
export function isLoopback(host: string) {
  return host === "127.0.0.1" || host === "[::1]" || host === "::1";
}
export function validateEndpoint(raw: string, local: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a valid provider URL.");
  }
  if (url.username || url.password || url.search || url.hash)
    throw new Error("Provider URL cannot contain credentials, queries or fragments.");
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) providers are supported.");
  if (local && !isLoopback(url.hostname))
    throw new Error("Local AI requires the numeric loopback address 127.0.0.1 or [::1].");
  if (!local && url.protocol !== "https:") throw new Error("Remote compatible providers require HTTPS.");
  if (!local && (isLoopback(url.hostname) || url.hostname === "localhost"))
    throw new Error("Use Local AI for loopback endpoints.");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}
export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const p = address.split(".").map(Number);
    const a = p[0]!,
      b = p[1]!;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0)
    );
  }
  if (isIP(address) === 6) return /^2[0-9a-f]{3}:/i.test(address) && !address.toLowerCase().startsWith("2001:db8:");
  return false;
}
/** DNS resolution is checked and the selected address pinned to this socket; redirects are rejected. */
export function endpointFetch(base: URL, local: boolean): Fetcher {
  return async (raw, init) => {
    const url = new URL(raw);
    if (url.origin !== base.origin) throw new Error("Provider origin changed.");
    let address = url.hostname.replace(/^\[|\]$/g, ""),
      family = isIP(address);
    if (!local) {
      const resolved = family ? [{ address, family }] : await dns.lookup(address, { all: true });
      if (!resolved.length || resolved.some((r) => !publicAddress(r.address)))
        throw new Error("Private or reserved remote destination blocked.");
      address = resolved[0]!.address;
      family = resolved[0]!.family;
    } else if (!isLoopback(url.hostname)) throw new Error("Local origin changed.");
    return new Promise<Response>((resolve, reject) => {
      const transport = url.protocol === "https:" ? https : http;
      const req = transport.request(
        url,
        {
          method: init.method ?? "GET",
          headers: Object.fromEntries(new Headers(init.headers).entries()),
          signal: init.signal ?? undefined,
          family,
          lookup: (_host, _options, callback) => callback(null, address, family),
        },
        (res) => {
          const status = res.statusCode ?? 500;
          if (status >= 300 && status < 400) {
            res.destroy();
            reject(new Error("Redirect blocked"));
            return;
          }
          const headers = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
          }
          resolve(new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, { status, headers }));
        },
      );
      req.on("error", () => reject(new Error("Provider transport failed")));
      if (init.body) {
        if (typeof init.body !== "string") throw new Error("Unsupported request body");
        req.write(init.body);
      }
      req.end();
    });
  };
}
