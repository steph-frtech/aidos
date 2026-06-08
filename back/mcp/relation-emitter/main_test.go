package main

import (
	"context"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/kernel/entities/relemit"
	"github.com/steph-frtech/aidos/back/kernel/operation"
)

// The relation-emitter MCP server is PURE projection (the wall): these tests prove each tool
// returns deterministically without I/O, mirroring the S74 done-criteria at the MCP boundary.

func sampleSchema() relemit.Schema {
	mk := func(name string) entities.Entity {
		return entities.Entity{Name: name, Attributes: []entities.Attribute{
			{Name: "id", Type: entities.TypeInt, Required: true, Identifier: true},
			{Name: "name", Type: entities.TypeString, Required: true},
		}}
	}
	return relemit.Schema{
		Project: "lib",
		Entities: []relemit.EntityRelations{
			{Entity: mk("author")},
			{Entity: mk("book"), Relations: []ref.Relation{
				{Name: "author", Target: "author", Cardinality: ref.OneToMany, Semantic: ref.FK, Required: true},
				{Name: "tags", Target: "tag", Cardinality: ref.ManyToMany, Semantic: ref.Association},
			}},
			{Entity: mk("tag")},
		},
		AsyncOps: []relemit.AsyncOp{{
			Name: "remind",
			Async: operation.Async{
				Trigger: operation.AsyncTrigger{Kind: operation.TriggerCron, At: "2026-06-08T09:00:00Z"},
				Effects: []operation.Effect{{Kind: operation.TriggerNotification, Target: "u@x", Payload: map[string]any{"m": 1}}},
			},
		}},
	}
}

func TestEmitDDL_JoinTableAndOutbox(t *testing.T) {
	_, out, err := emitDDL(context.Background(), nil, schemaInput{Schema: sampleSchema()})
	if err != nil || !out.OK || out.Artifact == nil {
		t.Fatalf("emit_ddl must succeed on a valid schema: %+v err=%v", out, err)
	}
	ddl := string(out.Artifact.Bytes)
	if !strings.Contains(ddl, `CREATE TABLE "book_tags"`) {
		t.Errorf("N-N did not emit a join table:\n%s", ddl)
	}
	if !strings.Contains(ddl, `REFERENCES "author"("id")`) {
		t.Errorf("FK does not reference the real author table:\n%s", ddl)
	}
	if !strings.Contains(ddl, `CREATE TABLE "outbox"`) {
		t.Errorf("async schema did not emit an outbox table:\n%s", ddl)
	}
}

func TestEmitWorker_OK(t *testing.T) {
	_, out, _ := emitWorker(context.Background(), nil, schemaInput{Schema: sampleSchema()})
	if !out.OK || out.Artifact == nil {
		t.Fatalf("emit_worker must succeed on an async schema: %+v", out)
	}
	if !strings.Contains(string(out.Artifact.Bytes), "dispatchRemind(") {
		t.Errorf("worker missing dispatch function:\n%s", out.Artifact.Bytes)
	}
}

func TestEmitDDL_UnknownTargetRefused(t *testing.T) {
	s := sampleSchema()
	s.Entities[1].Relations[0].Target = "ghost"
	_, out, _ := emitDDL(context.Background(), nil, schemaInput{Schema: s})
	if out.OK || out.Block == nil {
		t.Fatalf("an unknown relation target must be refused: %+v", out)
	}
	if len(out.Block.HowToFix) == 0 {
		t.Fatalf("refusal has empty how_to_fix (prison)")
	}
}

func TestEmitAll_Deterministic(t *testing.T) {
	_, a, _ := emitAll(context.Background(), nil, schemaInput{Schema: sampleSchema()})
	_, b, _ := emitAll(context.Background(), nil, schemaInput{Schema: sampleSchema()})
	if !a.OK || !b.OK || len(a.Artifacts) != len(b.Artifacts) {
		t.Fatalf("emit_all must be deterministic: %+v vs %+v", a, b)
	}
	for i := range a.Artifacts {
		if a.Artifacts[i].OutputHash != b.Artifacts[i].OutputHash {
			t.Errorf("artifact %d not byte-stable", i)
		}
	}
}

func TestSchemaHash_OK(t *testing.T) {
	_, out, _ := schemaHash(context.Background(), nil, schemaInput{Schema: sampleSchema()})
	if !out.OK || out.Hash == "" {
		t.Fatalf("schema_hash must return a content address: %+v", out)
	}
}

func TestNewServer(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("server nil")
	}
}
