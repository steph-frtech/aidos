# Step-Verifier Memory Index

- [S00 root step pattern](project_s00_pattern.md) — S00 has no Postgres/Go; wall check passes vacuously; mirror persistence to `mirrors` schema deferred to S06
- [Verification approach](feedback_verify_approach.md) — always re-run validators and Playwright directly; use tsc --noEmit + biome check as sensors
- [Assert semantics not count](feedback_assert_semantics_not_count.md) — count-only mirror assertions (length===N) pass wrong-but-equinumerous data; pin named ids when criteria name them
- [Godog duplicate step regex](project_godog_duplicate_step_regex.md) — two sc.Step with same regex: last wins, first is dead code; collapse to one handler
