# ORBIT 0.9.2 native acceptance

COSMO remains 1.0. Baseline: delivered 0.9.1 commit f3fcf2ffa015d3bbcb9856a7230f1d4a6ad75204. The user's successful native 0.9.1 chat is baseline evidence only.

This release changes version metadata and acceptance preparation. Product fixes require a reproduced native defect, a minimal fix, a regression test and a fresh build.

Release Candidate remains NO until the exact new 0.9.2 binary passes native Chat, real Ollama gemma3:4b, progressive streaming, cancellation, graceful restart persistence, Memory recall/forget, Knowledge citation/preview and actual Windows file/folder dialogs. Browser and core tests do not establish native PASS. The portable package additionally requires functional acceptance after relocation.

Use controlled test data only. Preserve private user databases. Record executable hash, source commit, timestamps, scenario, expected/actual results and precise PASS/FAIL/BLOCKED/NOT VERIFIED statuses. Do not change Windows Application Control or claim trusted signing without a production identity.

Native automation currently fails during helper initialization with `windows sandbox failed: helper_unknown_error: setup refresh had errors`. Until access is restored, all unexecuted native scenarios remain NOT VERIFIED. Successful builds and process startup cannot remove this gate.
