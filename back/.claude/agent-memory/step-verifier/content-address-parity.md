---
name: content-address-parity
description: Go and TS canonical encoders must produce the SAME SHA-256 content-address; verify it, do not assume it
metadata:
  type: project
---

When a step exposes a kernel AST in both Go (`Canonicalize`) and TS (`lib/<x>.ts` `canonicalize`), the content-address id the Workbench renders MUST equal the Go id, byte-for-byte.

**Why:** "one address space across stores" (CLAUDE.md). A drift between the two encoders (key order, number normalization, a `compare` vs `eq` node tag) silently breaks the claim that the panel shows the real kernel id. The encoders are hand-written in two languages, so parity is a real risk, not a given.
**How to apply:** compute both. Go: a tiny `go run` that SHA-256s `Canonicalize(...)`. TS: `node -e` replicating the canonical string + `crypto.createHash("sha256")`. For S09 `canPlaceOrder` both gave `e2fbac3f8a7e58ca3ad82348fd2ca7030026cdc69d0b5d635e598c332de1379e`. Watch the gotchas that were correct in S09: comparison leaves serialize as `{"kind":"compare","left":...,"op":"eq","right":...}` (NOT `{"kind":"eq"}`), keys sorted at every level, int literals normalized to JSON number.
