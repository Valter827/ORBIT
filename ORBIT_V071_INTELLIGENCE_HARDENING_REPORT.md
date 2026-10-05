# ORBIT 0.7.1 INTELLIGENCE HARDENING REPORT

Version: 0.7.1
COSMO: 1.0
Validation date: 2026-10-04
Release status: core/browser acceptance passed; native Windows release BLOCKED; real multi-model acceptance NOT VERIFIED.

| Check | Result | Evidence / scope |
|---|---|---|
| Semantic Request Understanding | PASS | Real gemma3:4b architecture question selects scoped memory. |
| Deterministic Fast Path | PASS | Obvious requests bypass classifier; real Fast chat and unit tests. |
| Semantic Classifier | PASS | Strict JSON schema; invalid output falls back safely. |
| Real Deep Pipeline | PASS | Actual draft + evidence critic, bounded to three total inference stages. |
| Claim Extraction | PASS | Fixed sentence claims; critic cannot introduce claims or silently verify omitted claims. |
| Semantic Verification | PASS | Real paraphrase comparison; source text is evidence, model agreement alone is not. |
| Semantic Contradiction | PASS | Real Mercury/Venus contradiction corrected from bound evidence. |
| Evidence Binding | PASS | Claim/source/excerpt identifiers, exact quotes, numerical consistency checks. |
| Citation Accuracy | PASS | Controlled mismatch tests and real public citation preview. Limited tested cases, not a universal factual guarantee. |
| Web Research | PASS | Official MediaWiki JSON search API and real HTTPS fetch; no search-engine HTML scraping. |
| Web Source Attribution | PASS | Actual used source title, URL, retrieval timestamp and excerpt in UI. |
| Web Privacy | PASS | Ask/Allow/Off, current public query only, no history/files/memory/screen assembled into queries; Local Only blocks research. |
| SSRF Protection | PASS | HTTPS-only, DNS address validation and pinning, private IP rejection, redirect revalidation, bounded bytes/time. Unit coverage is not an exhaustive penetration test. |
| Prompt Injection Protection | PASS | Retrieved text treated as untrusted; analysis cannot execute tools or grant permissions. Existing permission and PathGuard tests pass. |
| Capability Probing | PARTIAL | Real chat, streaming, vision, JSON, Russian and tool probes; maximum context not tested. |
| Real Vision Probe | PASS | Actual red-square PNG passed to gemma3:4b and colour checked. |
| Real Structured Output Probe | PASS | Real strict JSON response; schema-bearing Ollama request covered by regression test. |
| Real Tool Probe | UNSUPPORTED | gemma3:4b does not confirm tool calling; no OS tool executed. |
| Smart Brain | PASS | Capability constraints and measured probe latency routing covered by tests; not a model intelligence ranking. |
| Real Multi-Model Auto | NOT VERIFIED | Only gemma3:4b installed. Explicit consent to download qwen3:0.6b remains pending. |
| Fast | PASS | Real chat without unnecessary retrieval. |
| Balanced | PASS | Real Knowledge and scoped Memory routing. |
| Deep | PASS | Real bounded draft, comparison, correction/finalization. |
| Knowledge Routing | PASS | Unique public Nereon fact, source preview, irrelevant recipe excluded. |
| Memory Routing | PASS | Architecture decision recall; current user correction wins. |
| Sense Routing | PASS | Native Windows helper extracts public test-window text; actual local model answers Paris. Native Rust broker not verified in this build. |
| Local Only | PASS | Real regression network trace: loopback inference only, no cloud fallback. |
| Cancellation | PASS | Actual Ollama streaming abort and UI Stop; unit checks for research/critic cancellation. |
| Real gemma3:4b | PASS | Official Ollama runtime, actual installed digest and responses recorded. |
| Real Verified Web Fact | PASS | No prepared Knowledge: hottest Solar System planet question -> real search -> fetched evidence -> Verified Venus answer; UI consent/citation also passed. |
| Windows Build | BLOCKED | Windows Application Control blocked tauri-plugin-dialog build-script-build, OS error 4551. No policy change or workaround performed. |
| Installer | NOT PRODUCED | No 0.7.1 installer claimed or supplied. |

Tests: **256 PASS, 0 FAIL, 11 SKIP** (267 core tests).
The skipped tests are environment-dependent existing tests, not counted as successful real AI acceptance.

Required checks:
- npm ci: PASS; audit reported zero vulnerabilities. npm reports three dependency lifecycle scripts awaiting its allow-scripts policy; dependency installation and the checks below succeeded.
- npm test: PASS.
- npm run typecheck: PASS.
- npm run lint: PASS.
- npm run format:check: PASS.
- npm run frontend:build: PASS; Vite reports a bundle slightly above its 500 kB advisory threshold.
- npm run build:desktop: BLOCKED by OS Application Control, as above.
- Browser UI regression: PASS, including 11 Settings sections and four viewport sizes.
- Real regression: PASS for Fast, Knowledge, Memory, Deep evidence, Verify UX, restart/history, cancellation, Sense and Local Only. Local Agent remains UNSUPPORTED for this model.

## What changed

Added a deterministic-first semantic request analyzer with strict structured output, a bounded semantic critic, per-claim evidence binding, real optional public research, and cached technical model probes. Settings expose public research policy and capability tests; the existing chat surface gains public-query consent and source previews. Local Only and manual model selection remain authoritative.

Real testing uncovered and fixed malformed critic JSON, invented claims, omitted claims, incorrect numbers in quote bindings, and citation formatting being mistaken for factual assertions. Ollama now receives a native JSON schema; generated source quotes must be selected from the supplied evidence. Exact full-claim source matches remain independently checkable if the critic omits them. Secrets are redacted in both prompts and schema values.

Verification is relative to the retrieved evidence, not a guarantee that the source itself is correct. Unsupported or failed optional checks retain an honest unverified/fallback status. Claim extraction is bounded sentence segmentation, not an unlimited semantic decomposition of arbitrary prose. The only implemented search backend is Wikipedia's official API; the interfaces also support an unavailable-provider state and public URL fetching. Latency observations are compatibility/routing data, not benchmark claims.

## Evidence

- [Real hardening acceptance](validation/hardening-real-acceptance.json): runtime/model list, classifier, paraphrase, contradiction, real cancellation, probes, public search, Deep, memory and integrated web fact.
- [UI acceptance](validation/hardening-ui-acceptance.json): actual production frontend/core + real Ollama; Tauri transport bridge only, no model fixture.
- [Real regression](validation/hardening-regression-acceptance.json): history, modes, scoped context, Sense, Stop and Local Only.
- [Web citation screenshot](validation/hardening-ui-web-citation.png).
- validation/hardening-regression-network-*.jsonl: actual network observer trace.
- validation/hardening-tests.log and hardening-{typecheck,lint,format-check,frontend-build,npm-ci}.log.
- [Windows build log](validation/hardening-windows-build.log).

Controlled astronomy/Nereon facts and a dedicated public test window were used. Evidence does not contain private user documents or screenshots of unrelated windows. Unit fixtures are kept distinct from the real acceptance scripts.

## Remaining release limitations

1. Real Auto routing across two installed models and second-model offline recovery are NOT VERIFIED. No second model was downloaded without the separately requested consent.
2. Maximum-context probing remains NOT TESTED. The runtime allocation used for bounded analysis is 4096 tokens, not the model's advertised maximum context.
3. The native Windows executable/installer cannot be validated for 0.7.1 while the build is blocked. Browser/core and native-helper results do not claim native-shell acceptance.
4. No trusted code-signing certificate/service is available.
