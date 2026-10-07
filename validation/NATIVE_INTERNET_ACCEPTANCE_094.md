# ORBIT 0.9.4 Manual Native Internet Acceptance

Status: NOT PERFORMED. Browser/core evidence is supporting evidence only. Use the exact installed 0.9.4 executable and hashes from release-status.json / final artifact table. Do not disable Windows security if execution is blocked. Screenshots must contain only controlled test content. Counter observations alone do not prove system-browser traffic; record the visible external window separately.

## Ready

- Exact action: Open installed ORBIT from Start Menu; select COSMO local gemma3:4b.
- Exact prompt: Привет.
- Expected: Chat loads, model Ready, version 0.9.4, production process without Vite/npm.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-ready.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

## Ask cancel

- Exact action: Settings: Internet Ask. Send prompt; note request counter, Cancel.
- Exact prompt: Найди официальный сайт Ollama.
- Expected: Permission before public request; Cancel gives zero new public requests.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-ask-cancel.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

## Ask allow

- Exact action: Retry same prompt; Allow once.
- Exact prompt: Найди официальный сайт Ollama.
- Expected: Real official ollama.com result with citation.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-ask-allow.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

## Allow Steam

- Exact action: Set Allow; send prompt.
- Exact prompt: Скинь ссылку на Rust в Steam.
- Expected: No repeated permission; official store.steampowered.com/app/252490 link.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-allow-steam.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

## System opener

- Exact action: Choose System Browser and click the Steam citation.
- Exact prompt: (click result)
- Expected: Actual default browser opens validated public Steam URL; no shell error.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-system-opener.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

## Off

- Exact action: Set Internet Off; note counters; send prompt.
- Exact prompt: Найди Rust в Steam.
- Expected: Clear blocked state and zero public requests.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-off.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

## Local Only

- Exact action: Set Internet Allow, then Local Only ON; try chat, Browser and YouTube.
- Exact prompt: Найди видео YouTube про Ollama.
- Expected: All public operations blocked; zero public requests.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-local-only.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

## Browser

- Exact action: Disable Local Only, Internet Ask. Browser: open URL and Allow once.
- Exact prompt: https://v2.tauri.app/plugin/updater/
- Expected: Readable public page, title, URL, retrieval time. Back/Forward/Refresh and Find security work.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-browser.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

## Ask page

- Exact action: Click Ask about this page, then submit.
- Exact prompt: Explain the updater requirements on this page.
- Expected: Visible page chip, grounded excerpts/answer with citation; no unrelated private context. Remove chip clears context.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-ask-page.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

## Transcript

- Exact action: In chat, submit public captioned video URL and approve.
- Exact prompt: Summarize this video: https://www.youtube.com/watch?v=aircAruvnKk
- Expected: Real nonempty transcript; source/provider/language visible; selected excerpts honestly labelled if summary unverified.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-transcript.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

## Timestamp

- Exact action: Keep video page context; submit follow-up.
- Exact prompt: When does he discuss the sigmoid function?
- Expected: Source-based timestamp around 10:14, clickable same-video seek link.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-timestamp.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

## No transcript

- Exact action: Remove context; open another video.
- Exact prompt: Summarize this video: https://www.youtube.com/watch?v=z7fhyKBAfzE
- Expected: If captions unavailable: Transcript unavailable, metadata only, no invented summary/timestamp. If provider now supplies captions, record actual changed availability.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-no-transcript.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

## Visual unavailable

- Exact action: Ask about a frame.
- Exact prompt: What is visible in the frame at 10:14?
- Expected: Visual analysis unavailable; no claim to have inspected frames.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-visual-unavailable.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

## Stop

- Exact action: Start Internet research then immediately press Stop; observe status and counters.
- Exact prompt: Research and compare 3 local AI runtimes for Windows using official sources.
- Expected: Active request/model cancellation; no continued background reads or late final response. Record counter values.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-stop.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

## Persistence

- Exact action: Close and reopen ORBIT normally; reopen prior chat and settings.
- Exact prompt: (restart)
- Expected: History/model/Internet preferences remain, transient page context does not silently persist.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-persistence.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

## Privacy

- Exact action: Use controlled Memory/Knowledge/Sense markers, then unrelated Internet/YouTube/Places queries; inspect instrumented evidence.
- Exact prompt: Найди компьютерные магазины в Харькове.
- Expected: PRIVATE_MEMORY_094_ALPHA, PRIVATE_KNOWLEDGE_094_BETA and PRIVATE_SENSE_094_GAMMA absent from public queries. Do not store personal content.
- Actual result: [tester fills]
- Result: [PASS / FAIL / NOT PERFORMED]
- Screenshot (optional): native-094-privacy.png
- Tested EXE SHA-256: [tester fills from installed ORBIT.exe]
- Version: [verify 0.9.4]
- Timestamp/timezone: [tester fills]

