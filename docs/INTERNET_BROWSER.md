# Internet & Browser — ORBIT 0.9.4

COSMO remains 1.0. Source baseline: the exact ORBIT-0.9.3-internet-source-20261006.zip, SHA-256 5D9C0AF8A30DFEF7F425DA124A8A67A53ADFF58019D9E68928C2263E4F491BA5. Older native acceptance does not establish acceptance of 0.9.4.

## Privacy and settings

Settings → Privacy → Internet Access retains each existing AI's Off / Ask / Allow preference. Off blocks public network requests. Ask previews the public query or URL and offers Allow once / Cancel. Allow permits bounded public reads. Local Only overrides all three and blocks Browser, search, Places, YouTube and system-browser links through the Internet integration. Existing Memory, Knowledge and local inference continue to work.

Search provider choices are preserved. For general web search choose Public web · Bing RSS; Wikipedia remains available for existing profiles. DuckDuckGo public HTML search is an optional alternative and reports unavailable when its normal endpoint requires interaction. Search results are parsed into records, not treated as trusted raw HTML. Explicit official-site requests for supported products may use a curated official-domain candidate if search has no matching result; the candidate becomes evidence only after a successful public fetch and final-domain validation. Bing public RSS usage is intended for personal noncommercial search; provider availability and conditions may change. No provider key is required by these adapters.

Internet queries come only from the current explicit public query. History, Memory, Knowledge, files and Sense are never appended. Oversized/multiline/private-looking requests require the user to supply a short public query. This conservatively refuses some legitimate requests. No LLM-generated tool call or webpage text can authorize network access.

Location is never read from GPS, IP geolocation, Memory or Sense. Near-me requests ask for a city/area. The location preference is stored, but automatic approximate-location collection is not implemented; supply the city even when approximate location is allowed.

## Browser

The Browser navigation item opens a static public reader with URL/search input, Back, Forward, Refresh, title, retrieval time, Find on page and validated public links. It never renders remote HTML, executes JavaScript, accepts page IPC, shares cookies, logs in, posts forms or downloads executable files. JavaScript-only pages may be unavailable. Rendered pages: NOT IMPLEMENTED.

Ask about this page activates explicit context for the selected AI. The composer displays Page context active and Remove page context. Only that selected page is used for page-context questions, without Memory/Knowledge/history. Context clears on AI/project/new-chat scope changes and app restart. Cached pages expire after ten minutes, with at most twelve pages per scope. A selected context may expire after settings changes; reopen the page when requested. Web pages are never automatically added to Memory or Knowledge. Explicit Add to Knowledge from Browser is not implemented.

Open links in offers System Browser or ORBIT Browser. System navigation uses the Tauri opener API, never a constructed shell command. Only public HTTPS destinations pass validation; Local Only and Off also block explicit Internet links. A user click is explicit consent for that one external navigation. The system browser itself has its own permissions and cookies; ORBIT does not read them.

## Search, places and video

Examples:
- «Найди Rust в Steam и скинь ссылку.» — queries Steam's public store metadata and reads the actual result page, avoiding invented application IDs. Current Steam prices, when returned by the official search API, include USD and the explicit US store region plus retrieval time; other regions, future prices and stock are not verified.
- «Посмотри этот сайт и объясни его: https://v2.tauri.app/plugin/updater/» — extracts the public page and cites the retrieved URL.
- «Найди компьютерный магазин в Харькове.» — queries Nominatim with the explicitly specified city, returning provider-supplied name/address/map link. Data © OpenStreetMap contributors, ODbL. Results are not a complete business directory, and no stock, rating or current opening status is fabricated.
- «Найди видео на YouTube про Ollama.» — parses public YouTube video result metadata into title, channel, duration/date where supplied and clickable video URLs.
- «О чём это видео? https://www.youtube.com/watch?v=…» — metadata plus openly advertised captions when accessible.
- «В какой момент автор говорит про установку?» — select the opened video's page context; available caption segments include timestamps and seek URLs.

YouTube captions first use up to two validated tracks advertised by the public watch page. Empty/invalid tracks may fall back to the public, author-published 3b1b/captions GitHub archive for four supported 2017 neural-network videos. Every fallback validates the live video_url.txt identity before reading captions.srt. This archive is no longer the creator’s current contribution workflow and is not a universal YouTube transcript service. The Browser shows provider, language, source and failure information. No authentication, signature bypass, CAPTCHA bypass or paywall bypass exists. Missing/restricted captions produce Transcript unavailable and Metadata only, never a fabricated video summary. Video frame analysis and audio transcription: NOT IMPLEMENTED. Transcript parser tests alone do not establish live transcript acceptance.

Research requests may inspect multiple public sources and one additional public query. Fast reads at most one result; Balanced three; Deep/research five. Video search reads metadata/captions for a bounded selected result. Identical URLs and page hashes are deduplicated. Sources retain titles, URLs, excerpts and timestamps and feed the existing evidence verifier. A search listing whose page cannot be read is labelled destination not verified.

## Security and limits

All provider reads use the Internet Gateway's guarded GET transport: HTTPS, no credentials/cookies, validated and pinned DNS, private/reserved IP rejection, validation at each of at most three redirects, response type/size limits and cancellation. Sessions have a 45-second timeout, twelve top-level request calls (redirects separately bounded), four megabytes total decoded response data, and bounded page excerpts. HTTP 429/503 imposes a cooldown; there is no automatic retry loop. Nominatim is limited to at most one request per 1.1 seconds with a bounded temporary result cache.

Page and transcript text is untrusted evidence. It cannot alter policies, call tools, retrieve additional private context or perform purchases, uploads, form submission or account operations. Chat rejects tool calls. Stop aborts search/fetch/research/model work. Public reader content cannot execute code in the Tauri window.

Relevant provider documentation: [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/), [YouTube captions API authorization](https://developers.google.com/youtube/v3/docs/captions/list), [Tauri opener](https://v2.tauri.app/plugin/opener/). This release does not use the authenticated YouTube captions API.

## Evidence

Dedicated Internet tests cover policy, SSRF, unsafe links, prompt text isolation, bounded following/cache, cancellation, provider cooldown, structured search, transcript timestamps and privacy minimization. Real Internet and UI acceptance scripts produce controlled evidence under validation. Browser/core passes never imply native passes. Fresh Windows EXE, installer and portable are built from the recorded commit; no older executable is relabelled. Signing remains UNSIGNED without a trusted identity.

## 0.9.4 boundaries

SRT, WebVTT, JSON3 and XML captions retain source times; duplicate overlaps are normalized. Retrieval uses bounded timestamped chunks. A selected excerpt is not full-video coverage. Unsupported model summaries fall back to clearly labelled source quotations. Topic matching is lexical in the available transcript language; cross-language semantic timestamp search is not claimed. Opening a video URL from chat activates its visible page-context chip for follow-up questions; Remove page context, a new chat or scope changes clear it.

Settings supports an optional Bing/DuckDuckGo search fallback, disabled by default; only one configured fallback attempt is allowed. Browser Connection details exposes bounded host health and request counters, without stored query strings. Research reports requested versus usable independent sources and labels insufficient comparisons partial; unread search listings do not count as usable sources. General cross-store pricing remains partial.

Rendered-page fallback is NOT IMPLEMENTED: the static reader cannot safely execute arbitrary remote JavaScript with the current isolated transport. Local audio transcription and video frames are NOT IMPLEMENTED: this release has no permitted media acquisition/decoder pipeline. No media is downloaded, no anti-bot/auth controls are bypassed, and no visual claim is inferred from captions. These optional features are not prerequisites for the specified release gate.
