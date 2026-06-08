package relemit

import (
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// EmitDDL renders the WHOLE schema's Postgres DDL (ADR 0040: TargetPgDDL dialect unchanged):
//
//   - one CREATE TABLE per entity, IN CANONICAL (name) ORDER, with one column per attribute
//     in source order, the closed scalar→DDL mapping (reused from S35), NOT NULL on required,
//     PRIMARY KEY on the identifier;
//   - for every 1-1 / 1-N relation, a FOREIGN KEY column "<relname>_id" on the owning table,
//     REFERENCES the target table's primary-key column (a REAL table — the resolve gate),
//     NOT NULL iff the relation is required, plus a UNIQUE on a 1-1 FK;
//   - for every N-N relation, a JOIN TABLE "<owner>_<relname>" with two FK columns referencing
//     each end's primary key, and a composite PRIMARY KEY over the pair;
//   - when any operation is async (S73), an "outbox" table (the at-least-once delivery log the
//     worker drains).
//
// It is a PURE function of the schema: same schema → byte-identical DDL. A malformed schema
// (unknown relation target, an FK target with no identifier) is a BlockReason, never a
// partial render. Every FK REFERENCES a real, declared table — never a guessed one.
func EmitDDL(s Schema) (Artifact, *blockreason.BlockReason) {
	if err := Validate(s); err != nil {
		return Artifact{}, block(err)
	}
	sourceHash, err := SchemaHash(s)
	if err != nil {
		return Artifact{}, block(err)
	}

	ents := canonicalEntities(s)
	// idColOf maps a lowercased table name to its primary-key column name (the FK target).
	idColOf := map[string]string{}
	for _, er := range ents {
		if id, ok := entities.Identifier(er.Entity); ok {
			idColOf[strings.ToLower(er.Entity.Name)] = id.Name
		}
	}

	var b strings.Builder
	b.WriteString(header("--", sourceHash))
	b.WriteString("-- S74 relation-aware multi-entity DDL: FK columns, N-N join tables, async outbox.\n\n")

	for _, er := range ents {
		table := strings.ToLower(er.Entity.Name)
		fmt.Fprintf(&b, "CREATE TABLE %q (\n", table)
		var lines []string
		id, hasID := entities.Identifier(er.Entity)
		for _, a := range er.Entity.Attributes {
			col := scalarDDL[a.Type]
			line := fmt.Sprintf("    %q %s", a.Name, col)
			if hasID && a.Name == id.Name {
				line += " PRIMARY KEY"
			}
			if a.Required {
				line += " NOT NULL"
			}
			lines = append(lines, line)
		}
		// FK columns for 1-1 / 1-N relations owned by THIS entity (source order).
		for _, r := range er.Relations {
			if r.Cardinality == ref.ManyToMany {
				continue
			}
			fkCol := strings.ToLower(r.Name) + "_id"
			targetTable := strings.ToLower(r.Target)
			targetID := idColOf[targetTable]
			line := fmt.Sprintf("    %q BIGINT", fkCol)
			if r.Required {
				line += " NOT NULL"
			}
			if r.Cardinality == ref.OneToOne {
				line += " UNIQUE"
			}
			line += fmt.Sprintf(" REFERENCES %q(%q)", targetTable, targetID)
			lines = append(lines, line)
		}
		b.WriteString(strings.Join(lines, ",\n"))
		b.WriteString("\n);\n\n")
	}

	// N-N join tables — emitted AFTER all base tables so the FKs reference existing tables.
	// One join table per N-N relation, in (entity name, source order) order.
	for _, er := range ents {
		owner := strings.ToLower(er.Entity.Name)
		ownerID := idColOf[owner]
		for _, r := range er.Relations {
			if r.Cardinality != ref.ManyToMany {
				continue
			}
			target := strings.ToLower(r.Target)
			targetID := idColOf[target]
			join := owner + "_" + strings.ToLower(r.Name)
			ownerCol := owner + "_id"
			targetCol := target + "_id"
			fmt.Fprintf(&b, "CREATE TABLE %q (\n", join)
			fmt.Fprintf(&b, "    %q BIGINT NOT NULL REFERENCES %q(%q),\n", ownerCol, owner, ownerID)
			fmt.Fprintf(&b, "    %q BIGINT NOT NULL REFERENCES %q(%q),\n", targetCol, target, targetID)
			fmt.Fprintf(&b, "    PRIMARY KEY (%q, %q)\n", ownerCol, targetCol)
			b.WriteString(");\n\n")
		}
	}

	// Outbox table — emitted iff the schema carries any async operation (S73). The worker
	// drains it; the idempotency key is the effect's content address (S73 EffectID).
	if len(s.AsyncOps) > 0 {
		b.WriteString("-- async outbox (S73): the at-least-once delivery log the worker drains.\n")
		b.WriteString("CREATE TABLE \"outbox\" (\n")
		b.WriteString("    \"effect_id\" TEXT PRIMARY KEY,\n")
		b.WriteString("    \"operation\" TEXT NOT NULL,\n")
		b.WriteString("    \"kind\" TEXT NOT NULL,\n")
		b.WriteString("    \"target\" TEXT NOT NULL,\n")
		b.WriteString("    \"payload\" JSONB NOT NULL,\n")
		b.WriteString("    \"dispatched\" BOOLEAN NOT NULL DEFAULT FALSE,\n")
		b.WriteString("    \"created_at\" TIMESTAMPTZ NOT NULL DEFAULT now()\n")
		b.WriteString(");\n\n")
	}

	out := []byte(strings.TrimRight(b.String(), "\n") + "\n")
	return artifact("gen/"+s.Project+"/schema.sql", TargetDDL, out, sourceHash), nil
}
