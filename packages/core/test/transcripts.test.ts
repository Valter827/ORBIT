import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTranscript,
  transcriptChunks,
  searchTranscript,
  retrieveCaptions,
  CreatorCaptionArchive,
} from "../src/ai/transcripts.js";
import { InternetGateway, PublicYouTube } from "../src/ai/internet.js";

test("Transcript validates SRT/VTT/JSON/XML, preserves timing and cleans only duplicate overlap", () => {
  const srt =
    "1\n00:00:10,250 --> 00:00:12,000\nHello &amp; <i>world</i>\n\n2\n00:00:11,000 --> 00:00:13,000\nHello &amp; <i>world</i>\n\n3\n00:00:12,500 --> 00:00:15,000\nHello &amp; <i>world</i> again";
  assert.deepEqual(normalizeTranscript(srt), [
    { startMs: 10250, endMs: 13000, text: "Hello & world" },
    { startMs: 12500, endMs: 15000, text: "again" },
  ]);
  assert.deepEqual(normalizeTranscript("WEBVTT\n\n00:01.200 --> 00:02.500 align:start\nOne"), [
    { startMs: 1200, endMs: 2500, text: "One" },
  ]);
  assert.equal(
    normalizeTranscript('{"events":[{"tStartMs":1000,"dDurationMs":800,"segs":[{"utf8":"word"}]}]}')[0]?.endMs,
    1800,
  );
  assert.equal(
    normalizeTranscript('<timedtext><body><p t="1200" d="500">word</p></body></timedtext>')[0]?.startMs,
    1200,
  );
  assert.equal(normalizeTranscript('<transcript><text start="12" dur="2">word</text></transcript>')[0]?.endMs, 14000);
  for (const body of [
    "",
    "<html>Consent</html>",
    "plain text with no timestamps",
    "1\n00:00:20,000 --> 00:00:10,000\ninvalid",
    '{"events":[{"tStartMs":-1,"segs":[{"utf8":"bad"}]}]}',
  ])
    assert.deepEqual(normalizeTranscript(body), []);
});
test("Timestamp search excludes question words and never invents an unmatched segment", () => {
  const chunks = transcriptChunks(
    [
      { startMs: 0, endMs: 1000, text: "He discusses this video" },
      { startMs: 600000, endMs: 602000, text: "The sigmoid function maps numbers" },
    ],
    { videoId: "aircAruvnKk", title: "Test", channel: "Test", language: "en" },
  );
  assert.equal(searchTranscript(chunks, "When does he discuss sigmoid?")[0]?.startMs, 600000);
  assert.equal(searchTranscript(chunks, "What about nonexistenttopic?").length, 0);
  assert.equal(searchTranscript(chunks, "at 10:01")[0]?.endMs, 602000);
});
test("Creator fallback rejects identity mismatch; no subtitle retrieval from mismatched directory", async () => {
  let calls = 0;
  await assert.rejects(
    new CreatorCaptionArchive().retrieve("aircAruvnKk", "en", async (url) => {
      calls++;
      return { url, type: "text/plain", body: "https://youtu.be/jNQXAC9IVRw" };
    }),
    /identity mismatch/,
  );
  assert.equal(calls, 1);
});
test("Empty direct captions fall back to separately identified live-capable creator provider", async () => {
  const r = await retrieveCaptions(
    "aircAruvnKk",
    [{ baseUrl: "https://www.youtube.com/api/timedtext?v=aircAruvnKk", languageCode: "en" }],
    "en",
    async (url) => ({
      url,
      type: "text/plain",
      body: url.includes("timedtext")
        ? ""
        : url.endsWith("video_url.txt")
          ? "https://youtu.be/aircAruvnKk"
          : "1\n00:00:10,000 --> 00:00:12,000\nControlled caption",
    }),
  );
  assert.equal(r.attempts[0]?.status, "unavailable");
  assert.equal(r.result?.provider, "creator-published-3blue1brown");
  assert.equal(r.result?.segments[0]?.startMs, 10000);
});
test("Caption URL identity, private targets and cancellation cannot trigger fallback transport", async () => {
  let n = 0;
  const r = await retrieveCaptions(
    "jNQXAC9IVRw",
    [
      { baseUrl: "https://127.0.0.1/api/timedtext?v=jNQXAC9IVRw" },
      { baseUrl: "https://www.youtube.com/api/timedtext?v=aircAruvnKk" },
    ],
    "en",
    async () => {
      n++;
      throw Error("unexpected");
    },
  );
  assert.equal(n, 0);
  assert.equal(r.result, undefined);
  await assert.rejects(
    retrieveCaptions(
      "aircAruvnKk",
      [{ baseUrl: "https://www.youtube.com/api/timedtext?v=aircAruvnKk" }],
      "en",
      async () => {
        n++;
        throw Error("aborted");
      },
    ),
    /aborted/,
  );
  assert.equal(n, 1);
});
test("Metadata success never implies transcript or visual capability", async () => {
  const p = await new PublicYouTube().read("https://youtu.be/jNQXAC9IVRw", async (url) => ({
    url,
    type: "text/plain",
    body: url.includes("oembed") ? JSON.stringify({ title: "Controlled", author_name: "Test" }) : "<html></html>",
  }));
  assert.equal(p.video?.capabilities.metadata, "available");
  assert.equal(p.video?.capabilities.transcript, "unavailable");
  assert.equal(p.video?.capabilities.visual, "unavailable");
  assert.equal(p.video?.chunks.length, 0);
});
test("Research counts independent usable sources and excludes unavailable listing evidence", async () => {
  const g = new InternetGateway(
    async (url) => {
      if (url.includes("missing")) throw Error("HTTP 404");
      return { url, type: "text/html", body: "<main><p>Shared source text</p></main>" };
    },
    {
      id: "controlled",
      async search() {
        return [
          {
            title: "A",
            url: "https://example.com/a",
            snippet: "A",
            provider: "test",
            retrievedAt: new Date().toISOString(),
          },
          {
            title: "Mirror",
            url: "https://docs.example.com/b",
            snippet: "B",
            provider: "test",
            retrievedAt: new Date().toISOString(),
          },
          {
            title: "Missing",
            url: "https://missing.example.org/",
            snippet: "C",
            provider: "test",
            retrievedAt: new Date().toISOString(),
          },
        ];
      },
    },
  );
  const r = await g.research(
    "Research 3 sources about a public topic",
    { policy: "allow", localOnly: false },
    new AbortController().signal,
    "deep",
  );
  assert.equal(r.requestedSources, 3);
  assert.equal(r.usableSources, 1);
  assert.match(r.status, /partial/);
});
test("Configured search fallback is bounded and Local Only blocks both providers", async () => {
  let calls = 0;
  const g = new InternetGateway(
    async (url) => {
      calls++;
      return { url, type: "text/xml", body: "<rss><channel></channel></rss>" };
    },
    {
      id: "unavailable",
      async search() {
        throw Error("Provider unavailable");
      },
    },
  );
  await g.research(
    "Find a public website",
    { policy: "allow", localOnly: true },
    new AbortController().signal,
    "fast",
    "duckduckgo",
    "bing",
  );
  assert.equal(calls, 0);
  await g.research(
    "Find a public website",
    { policy: "allow", localOnly: false },
    new AbortController().signal,
    "fast",
    "custom",
    "bing",
  );
  assert.equal(calls, 1);
  assert.equal(g.status().requests, 1);
});
