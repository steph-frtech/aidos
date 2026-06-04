---
name: gofmt-fixture-alignment
description: Executor "gofmt clean" claims can miss anonymous-struct field alignment in table-driven Go tests; always re-run gofmt -l on the changed dir
metadata:
  type: feedback
---

When verifying a Go step, do NOT trust the executor's "gofmt clean" line — re-run `gofmt -l <changed-dir>` yourself.

**Why:** On BA01 the executor reported gofmt clean, but `kernel/agentlayer/knobs_fixture_test.go` had a misaligned anonymous struct in a table-driven test (`name string` / `mut func(...)` columns over-indented). go vet and go test passed; only `gofmt -l` caught it.

**How to apply:** For any step touching `back/` Go files, run `gofmt -l <pkg-dir>` as a distinct sensor. If it lists a file, fix with `gofmt -w` (deterministic formatter, not a manual edit) and re-confirm clean. Table-driven test structs are the usual offender.
