# mirror · reflects: kernel.expr.Eval · test_kind: fixture · cert_language: operation-dsl/go · authority: above
#
# The N2 fixture mirror for the Expr DSL (KRD §24.5). One fixture = state (an
# Env) → command (an Expr AST) → events (the resolved Value, or a Parse
# rejection). Conceptually stored in the `mirrors` schema; materialized here for
# the Go interpreter (the bootstrap exception, CLAUDE.md §6: the mirrors schema
# persists this at S06, this file IS the executable red→green proof now). The
# executable form is back/kernel/expr/expr_fixture_test.go (TestExprFixtures),
# which reads these exact cases. This is a MEANS-test toward the human red
# ("visible_when must evaluate"), never a new truth the agent grades itself on.

fixture "visible_when evaluates true when cart has items"
  state   (Env): { "$": { "cart": { "items": [ {"id":"a"}, {"id":"b"} ] } } }
  command (Expr AST): call ">" [ ref "$.cart.items.length", lit 0 ]    # $.cart.items.length > 0
  events:  [ result == true ]

fixture "visible_when evaluates false when cart is empty"
  state   (Env): { "$": { "cart": { "items": [] } } }
  command (Expr AST): call ">" [ ref "$.cart.items.length", lit 0 ]
  events:  [ result == false ]

fixture "function call composes"
  state   (Env): { "$": { "auth": { "user": { "name": "ADA" } } } }
  command (Expr AST): call "lowercase" [ ref "$.auth.user.name" ]
  events:  [ result == "ada" ]

fixture "enabled_when composes logical and negation"
  state   (Env): { "$": { "form": { "valid": true }, "submitting": false } }
  command (Expr AST): call "&&" [ ref "$.form.valid", call "!" [ ref "$.submitting" ] ]
  events:  [ result == true ]    # $.form.valid && !$.submitting

fixture "unknown function is rejected, not evaluated"
  command (Expr AST): call "exec" [ lit "rm -rf /" ]
  events:  [ Parse rejects: unknown function "exec" (closed allow-list) ]
