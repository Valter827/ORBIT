import test from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import https from "node:https";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { publicGet } from "../src/ai/web-research.js";

test("Guarded transport rejects mixed DNS and validates a redirect before a second socket", async (t) => {
  let sockets = 0;
  const lookup = t.mock.method(dns, "lookup", async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ]);
  t.mock.method(https, "get", (_url: unknown, _options: unknown, callback: (response: unknown) => void) => {
    sockets++;
    queueMicrotask(() =>
      callback({ statusCode: 302, headers: { location: "https://127.0.0.1/private" }, destroy() {} }),
    );
    return new EventEmitter();
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(publicGet("https://example.com/", new AbortController().signal), /Private or reserved/);
    assert.equal(sockets, 0);
    lookup.mock.mockImplementation(async () => [{ address: "8.8.8.8", family: 4 }]);
    await assert.rejects(publicGet("https://example.com/", new AbortController().signal), /public HTTPS/);
    assert.equal(sockets, 1);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});
