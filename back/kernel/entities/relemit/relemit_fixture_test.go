// relemit_fixture_test.go — the S74 ACCEPTANCE mirror (the journey fixtures), written
// RED before the emitters and now green. Each fixture is a Given/When/Then over a
// multi-entity Schema: GIVEN a schema cut, WHEN we emit DDL/TS/Worker, THEN the output
// carries the relation-aware artifacts the done-criterion pins:
//
//   - a N-N relation emits a JOIN TABLE;
//   - the FKs of the DDL reference REAL declared tables;
//   - an async node emits a WORKER + an OUTBOX table;
//   - typed associations + a navigation SDK in the TS.
//
// These are the human's red set for S74. The emitter is the projection that turns them
// green; the property mirror (relemit_property_test.go) pins byte-stability.
package relemit

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/kernel/operation"
)

// authorBook is the canonical multi-entity fixture: an Author (1) writes many Books (N),
// and a Book relates N-N to Tags. It exercises a 1-N FK, an N-N join table, and a typed
// navigation SDK. Both entities carry an identifier (the FK target).
func authorBook() Schema {
	author := entities.Entity{
		Name: "author",
		Attributes: []entities.Attribute{
			{Name: "id", Type: entities.TypeInt, Required: true, Identifier: true},
			{Name: "name", Type: entities.TypeString, Required: true},
		},
	}
	book := entities.Entity{
		Name: "book",
		Attributes: []entities.Attribute{
			{Name: "id", Type: entities.TypeInt, Required: true, Identifier: true},
			{Name: "title", Type: entities.TypeString, Required: true},
		},
	}
	tag := entities.Entity{
		Name: "tag",
		Attributes: []entities.Attribute{
			{Name: "id", Type: entities.TypeInt, Required: true, Identifier: true},
			{Name: "label", Type: entities.TypeString, Required: true},
		},
	}
	return Schema{
		Project: "library",
		Entities: []EntityRelations{
			{Entity: author},
			{Entity: book, Relations: []ref.Relation{
				{Name: "author", Target: "author", Cardinality: ref.OneToMany, Semantic: ref.FK, Required: true},
				{Name: "tags", Target: "tag", Cardinality: ref.ManyToMany, Semantic: ref.Association},
			}},
			{Entity: tag},
		},
	}
}

// withAsync adds a cron-triggered async op (a reminder) to a schema (S73), so the worker +
// outbox table are emitted.
func withAsync(s Schema) Schema {
	s.AsyncOps = []AsyncOp{
		{
			Name: "sendReminder",
			Async: operation.Async{
				Trigger: operation.AsyncTrigger{Kind: operation.TriggerCron, At: "2026-06-08T09:00:00Z"},
				Effects: []operation.Effect{
					{Kind: operation.TriggerNotification, Target: "user@example.com", Payload: map[string]any{"msg": "due"}},
				},
			},
		},
	}
	return s
}

// Scenario: a N-N relation emits a join table; the FKs reference real tables.
func TestFixture_NNEmitsJoinTable_FKReferenceRealTables(t *testing.T) {
	art, br := EmitDDL(authorBook())
	if br != nil {
		t.Fatalf("EmitDDL refused a valid schema: %s", br.Explanation)
	}
	ddl := string(art.Bytes)

	// THEN — the base tables exist (the FK targets are real, declared tables).
	for _, table := range []string{`CREATE TABLE "author"`, `CREATE TABLE "book"`, `CREATE TABLE "tag"`} {
		if !strings.Contains(ddl, table) {
			t.Errorf("DDL missing base table %q:\n%s", table, ddl)
		}
	}
	// THEN — the 1-N FK column references the REAL author table's PK.
	if !strings.Contains(ddl, `"author_id" BIGINT NOT NULL REFERENCES "author"("id")`) {
		t.Errorf("DDL missing 1-N FK referencing real author(id):\n%s", ddl)
	}
	// THEN — the N-N emits a JOIN TABLE referencing BOTH ends' real PKs.
	if !strings.Contains(ddl, `CREATE TABLE "book_tags"`) {
		t.Errorf("N-N did not emit a join table book_tags:\n%s", ddl)
	}
	if !strings.Contains(ddl, `"book_id" BIGINT NOT NULL REFERENCES "book"("id")`) ||
		!strings.Contains(ddl, `"tag_id" BIGINT NOT NULL REFERENCES "tag"("id")`) {
		t.Errorf("join table FKs do not reference real tables:\n%s", ddl)
	}
	if !strings.Contains(ddl, `PRIMARY KEY ("book_id", "tag_id")`) {
		t.Errorf("join table missing composite PK:\n%s", ddl)
	}
}

// FK-target honesty: every REFERENCES in the DDL names a table that is actually CREATEd.
func TestFixture_EveryFKReferencesADeclaredTable(t *testing.T) {
	art, br := EmitDDL(authorBook())
	if br != nil {
		t.Fatalf("EmitDDL refused: %s", br.Explanation)
	}
	ddl := string(art.Bytes)
	declared := map[string]bool{}
	for _, line := range strings.Split(ddl, "\n") {
		if strings.HasPrefix(line, "CREATE TABLE ") {
			name := strings.TrimSpace(strings.TrimPrefix(line, "CREATE TABLE"))
			name = strings.TrimSuffix(name, " (")
			declared[strings.Trim(name, `"`)] = true
		}
	}
	for _, line := range strings.Split(ddl, "\n") {
		idx := strings.Index(line, "REFERENCES ")
		if idx < 0 {
			continue
		}
		rest := line[idx+len("REFERENCES "):]
		tbl := rest
		if p := strings.Index(rest, "("); p >= 0 {
			tbl = rest[:p]
		}
		tbl = strings.Trim(strings.TrimSpace(tbl), `"`)
		if !declared[tbl] {
			t.Errorf("FK references a table that is NOT declared: %q\nline: %s", tbl, line)
		}
	}
}

// Scenario: an async node emits a worker + an outbox table.
func TestFixture_AsyncNodeEmitsWorkerAndOutbox(t *testing.T) {
	s := withAsync(authorBook())

	ddl, br := EmitDDL(s)
	if br != nil {
		t.Fatalf("EmitDDL refused: %s", br.Explanation)
	}
	if !strings.Contains(string(ddl.Bytes), `CREATE TABLE "outbox"`) {
		t.Errorf("async schema did not emit an outbox table:\n%s", ddl.Bytes)
	}
	if !strings.Contains(string(ddl.Bytes), `"effect_id" TEXT PRIMARY KEY`) {
		t.Errorf("outbox table missing the idempotency key column:\n%s", ddl.Bytes)
	}

	w, br := EmitWorker(s)
	if br != nil {
		t.Fatalf("EmitWorker refused an async schema: %s", br.Explanation)
	}
	worker := string(w.Bytes)
	if !strings.Contains(worker, "export async function dispatchSendReminder(") {
		t.Errorf("worker missing the dispatch function for the async op:\n%s", worker)
	}
	if !strings.Contains(worker, `SENDREMINDER_SCHEDULED_AT = "2026-06-08T09:00:00Z"`) {
		t.Errorf("cron worker missing the scheduled echeance:\n%s", worker)
	}
	if !strings.Contains(worker, "outbox.markDispatched(row.effect_id)") {
		t.Errorf("worker does not drain the outbox by idempotency key:\n%s", worker)
	}
}

// A sync-only schema emits NO outbox and NO worker (the extension is additive).
func TestFixture_SyncSchemaEmitsNoWorker(t *testing.T) {
	ddl, br := EmitDDL(authorBook())
	if br != nil {
		t.Fatalf("EmitDDL refused: %s", br.Explanation)
	}
	if strings.Contains(string(ddl.Bytes), `CREATE TABLE "outbox"`) {
		t.Errorf("a sync schema must not emit an outbox table:\n%s", ddl.Bytes)
	}
	if _, br := EmitWorker(authorBook()); br == nil {
		t.Errorf("EmitWorker must refuse a schema with no async op")
	}
}

// Scenario: the TS carries typed associations + a navigation SDK.
func TestFixture_TSTypedAssociationsAndNavSDK(t *testing.T) {
	art, br := EmitTS(authorBook())
	if br != nil {
		t.Fatalf("EmitTS refused: %s", br.Explanation)
	}
	ts := string(art.Bytes)
	// Typed association: the Book type carries the author FK id, the typed author ref, and
	// the typed tags collection.
	for _, want := range []string{
		"export type Book = {",
		"author_id: number;",
		"author?: Author;",
		"tags?: Tag[];",
	} {
		if !strings.Contains(ts, want) {
			t.Errorf("TS missing typed association %q:\n%s", want, ts)
		}
	}
	// Navigation SDK: a typed loader per relation, returning the target type.
	for _, want := range []string{
		"export async function loadBookAuthor(reader: Reader, owner: Book): Promise<Author | undefined>",
		"export async function loadBookTags(reader: Reader, owner: Book): Promise<Tag[]>",
	} {
		if !strings.Contains(ts, want) {
			t.Errorf("TS navigation SDK missing loader %q:\n%s", want, ts)
		}
	}
}

// Honesty: an unknown relation target is REFUSED (never a guessed FK).
func TestFixture_UnknownTargetRefused(t *testing.T) {
	s := authorBook()
	s.Entities[1].Relations[0].Target = "ghost" // book.author → a non-declared entity
	if _, br := EmitDDL(s); br == nil {
		t.Fatalf("EmitDDL must refuse a relation targeting a non-declared entity")
	} else if br.Code != "UNKNOWN_RELATION_TARGET" && !strings.Contains(br.Explanation, "ghost") {
		t.Errorf("refusal does not name the unknown target: %+v", br)
	}
}

// Honesty: an FK whose target has no identifier is REFUSED (no column to reference).
func TestFixture_FKTargetWithoutIdentifierRefused(t *testing.T) {
	s := authorBook()
	// Strip author's identifier — book.author FK has nothing to reference.
	s.Entities[0].Entity.Attributes[0].Identifier = false
	if _, br := EmitDDL(s); br == nil {
		t.Fatalf("EmitDDL must refuse an FK whose target has no identifier")
	}
}
