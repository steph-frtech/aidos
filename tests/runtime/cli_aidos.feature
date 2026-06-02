Feature: aidos CLI prints each command's contract deterministically
  As an operator of the AIDOS Runtime, I run `aidos <cmd>` and read the
  command's declared contract — its name, purpose and the inputs/outputs it
  will eventually own — so the tracer-bullet entrypoint is wired, testable and
  visualizable before any truth is written.

  # mirror record: reflects=runtime.cli, test_kind=acceptance, cert_language=gherkin, liveness=live, authority=below
  # The CLI writes no truth (no Postgres, no kernel/mirrors); a print-only stub.

  Scenario Outline: a core command prints its contract heading and exits 0
    Given the aidos CLI is built
    When I run "aidos <command>"
    Then it prints the "<command>" contract heading
    And it exits with code 0

    Examples:
      | command |
      | check   |
      | impact  |
      | stable  |
      | diff    |
      | explain |
