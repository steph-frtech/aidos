package main

import "time"

// nowRFC3339 reads the wall clock ONCE at the binary edge (never inside Run), so the
// self-test instant `at` is passed in and Run itself stays a pure function of
// (harness, at) — the determinism mandate (CLAUDE.md §6/§8). The runner is free to
// override it via SELF_TEST_AT for a reproducible run.
func nowRFC3339() string { return time.Now().UTC().Format(time.RFC3339) }
