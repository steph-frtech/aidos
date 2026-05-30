---
name: godog-duplicate-step-regex
description: Two Godog sc.Step calls with the identical regex — the last registration silently wins and the first handler is dead code; check when a BDD scenario has near-identical Given/When lines.
metadata:
  type: project
---

In Godog, registering two `sc.Step` handlers with the **same regex** does not error — the **last registration wins** and serves every matching Gherkin line; the earlier handler is unreachable dead code.

**Why:** Found in S01 `back/archive/contentstore/content_store_bdd_test.go`: the Gherkin had `Given I put "v1" under head "doc"` and `When I put "v2" under head "doc"`, both matching `^I put the bytes "([^"]*)" under head "([^"]*)"$`, registered twice. The first handler (recording `hashOfV1`) never ran. It was harmless only because the recorded fields were never read in assertions (assertions recomputed `contentstore.Hash(...)` directly). Had an assertion depended on `hashOfV1`, the scenario would have asserted against a zero value.

**How to apply:** When verifying a Godog BDD test whose scenario has two near-identical step lines, grep for duplicate `sc.Step(` regexes. If found, collapse to one handler (it serves both lines) and delete any state fields the dead handler populated, so the mirror stays honest. Relates to [[assert-semantics-not-count]] — both are "the mirror looks green but proves less / differently than it appears" smells.
