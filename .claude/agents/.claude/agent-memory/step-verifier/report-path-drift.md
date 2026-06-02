---
name: report-path-drift
description: step-executor reports sometimes list frontend file paths that look plausible but are wrong (e.g. app/<route>/firewall.ts when the file is at lib/firewall.ts)
metadata:
  type: feedback
---

The step-executor JSON `files_changed` list cannot be trusted for exact paths.

**Why:** On S30 the report listed `app/memory-firewall/firewall.ts`, `firewall.test.ts`, `firewall-data.ts`, and `components/MemoryFirewallPanel.tsx`. The route dir actually held only `page.tsx`; the pure twin + its vitest lived at `front/web/lib/firewall.ts` / `lib/firewall.test.ts` / `lib/firewall-data.ts`. The files were all real and green — only the reported locations were wrong. Running the test at the reported path gave a false "No test files found".

**How to apply:** When verifying frontend artifacts, ls/glob the real tree (find ... -name '<name>*') before concluding a file is missing or a test fails. A "no test file found" at the reported path is a path-drift signal, not a gap — re-locate and re-run. Do not flag a residual issue until you have searched the actual tree.
