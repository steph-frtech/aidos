---
name: project-s00-pattern
description: S00 is the root step — no Postgres, no Go, no MCP/hook/migration. Wall check at S00 means: no DB schema code written (expected). Mirror persistence to the mirrors schema is deferred to S06.
metadata:
  type: project
---

S00 is the root "contract" step with no Postgres backend yet. The wall check passes vacuously (no DB write code). Mirror record fields (reflects, test_kind, cert_language, liveness) appear only as comments in the .feature and .mjs files — actual persistence to the `mirrors` schema is an open item for S06.

**Why:** Postgres schemas don't exist at S00; wiring them in would violate the "autonomous" granularity property (mocks what doesn't exist, not the reverse).

**How to apply:** When verifying early steps (S00–S05), do not fail the wall check because there is no DB write code — there is also no DB yet. Look instead for any attempted DB writes to non-existent schemas, which would be a forward-dependency violation.
