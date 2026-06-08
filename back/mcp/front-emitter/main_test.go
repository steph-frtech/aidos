package main

import (
	"context"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/blob"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/runtime/frontemit"
)

// The front-emitter MCP server is PURE projection (the wall): these tests prove each tool
// returns deterministically without I/O, mirroring the S93 done-criteria at the MCP boundary.

func sampleSpec() frontemit.FrontSpec {
	return frontemit.FrontSpec{
		Project: "shop",
		Entities: []frontemit.EntityModel{
			{
				Entity: entities.Entity{
					Name: "order",
					Attributes: []entities.Attribute{
						{Name: "id", Type: entities.TypeInt, Identifier: true},
						{Name: "total", Type: entities.TypeDecimal, Required: true},
					},
				},
				Blobs: []blob.BlobAttribute{{Name: "receipt", AllowedMIME: []string{"image/png"}, MaxBytes: 1024}},
				Refs:  []ref.Relation{{Name: "customer", Target: "Customer", Cardinality: ref.OneToMany, Semantic: ref.FK, Required: true}},
			},
		},
		Controls: []frontemit.ControlModel{
			{
				Name:      "create-order",
				View:      "order",
				Label:     "order.create",
				Operation: "CreateOrder",
				Fixtures: []frontemit.FixtureRow{
					{Given: "cart-non-empty", Visible: true, Enabled: true},
				},
			},
		},
	}
}

func TestEmitFrontTool(t *testing.T) {
	_, out, err := emitFront(context.Background(), nil, frontInput{Spec: sampleSpec()})
	if err != nil || !out.OK || len(out.Files) == 0 {
		t.Fatalf("emit_front failed: ok=%v err=%v", out.OK, err)
	}
	var controls, form string
	for _, a := range out.Files {
		if a.Target == frontemit.TargetControls {
			controls = string(a.Bytes)
		}
		if a.Target == frontemit.TargetEntityForm {
			form = string(a.Bytes)
		}
	}
	if !strings.Contains(controls, `data-aidos-invoke="CreateOrder"`) {
		t.Fatalf("emitted controls do not bind CreateOrder")
	}
	if !strings.Contains(form, `type="file"`) {
		t.Fatalf("emitted form has no blob file input")
	}
	if !strings.Contains(form, `<select`) {
		t.Fatalf("emitted form has no relation select")
	}
}

func TestEmitBundleTool_Deterministic(t *testing.T) {
	_, a, _ := emitBundle(context.Background(), nil, frontInput{Spec: sampleSpec()})
	_, b, _ := emitBundle(context.Background(), nil, frontInput{Spec: sampleSpec()})
	if !a.OK || a.Artifact == nil || a.Artifact.OutputHash != b.Artifact.OutputHash {
		t.Fatalf("emit_bundle not deterministic")
	}
}

func TestFrontHashTool(t *testing.T) {
	_, h1, _ := frontHash(context.Background(), nil, frontInput{Spec: sampleSpec()})
	_, h2, _ := frontHash(context.Background(), nil, frontInput{Spec: sampleSpec()})
	if !h1.OK || h1.Hash != h2.Hash {
		t.Fatalf("front_hash not deterministic: %q vs %q", h1.Hash, h2.Hash)
	}
}

func TestServerRegistersTools(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("newMCPServer returned nil")
	}
}

func TestMalformedRefused(t *testing.T) {
	_, out, _ := emitFront(context.Background(), nil, frontInput{Spec: frontemit.FrontSpec{}})
	if out.OK || out.Block == nil {
		t.Fatalf("malformed spec was not refused")
	}
}
