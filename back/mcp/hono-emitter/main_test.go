package main

import (
	"context"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// The hono-emitter MCP server is PURE projection (the wall): these tests prove each tool
// returns deterministically without I/O, mirroring the S87 done-criteria at the MCP boundary.

func sampleSpec() honoemit.ServerSpec {
	return honoemit.ServerSpec{
		Project: "shop",
		Ops: []honoemit.Op{
			{Name: "createOrder"},
			{Name: "sendReceipt", Async: true, Trigger: operation.AsyncTrigger{Kind: operation.TriggerNotification}},
		},
	}
}

func sampleManifest() honoemit.StackManifest {
	return honoemit.StackManifest{
		App: "shop",
		Services: []honoemit.Service{
			{Name: "server", Role: honoemit.RoleServer, Image: "shop:latest", InternalPort: 3000},
			{Name: "postgres", Role: honoemit.RoleDatastore, Image: "postgres:16", InternalPort: 5432},
		},
		Network: honoemit.Network{Name: "traefik_default", External: true},
	}
}

func TestEmitServerTool(t *testing.T) {
	_, out, err := emitServer(context.Background(), nil, serverInput{Spec: sampleSpec()})
	if err != nil || !out.OK || out.Artifact == nil {
		t.Fatalf("emit_server failed: ok=%v err=%v", out.OK, err)
	}
	if !strings.Contains(string(out.Artifact.Bytes), `app.get("/healthz"`) {
		t.Fatalf("emitted server has no /healthz")
	}
	if !strings.Contains(string(out.Artifact.Bytes), `app.post("/createorder"`) {
		t.Fatalf("emitted server has no createOrder route")
	}
}

func TestEmitWorkerTool(t *testing.T) {
	_, out, err := emitWorker(context.Background(), nil, serverInput{Spec: sampleSpec()})
	if err != nil || !out.OK || out.Artifact == nil {
		t.Fatalf("emit_worker failed: ok=%v err=%v", out.OK, err)
	}
	if !strings.Contains(string(out.Artifact.Bytes), "dispatchSendReceipt") {
		t.Fatalf("emitted worker has no async dispatcher")
	}
}

func TestEmitPulumiTool(t *testing.T) {
	_, out, err := emitPulumi(context.Background(), nil, manifestInput{Manifest: sampleManifest()})
	if err != nil || !out.OK || out.Artifact == nil {
		t.Fatalf("emit_pulumi failed: ok=%v err=%v", out.OK, err)
	}
	if !strings.Contains(string(out.Artifact.Bytes), "export function program()") {
		t.Fatalf("emitted pulumi program has no program() factory")
	}
}

func TestHashTools_Deterministic(t *testing.T) {
	_, h1, _ := serverHash(context.Background(), nil, serverInput{Spec: sampleSpec()})
	_, h2, _ := serverHash(context.Background(), nil, serverInput{Spec: sampleSpec()})
	if !h1.OK || h1.Hash != h2.Hash {
		t.Fatalf("server_hash not deterministic: %q vs %q", h1.Hash, h2.Hash)
	}
	_, m1, _ := manifestHash(context.Background(), nil, manifestInput{Manifest: sampleManifest()})
	if !m1.OK || m1.Hash == "" {
		t.Fatalf("manifest_hash failed")
	}
}

func TestServerRegistersTools(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("newMCPServer returned nil")
	}
}

func TestMalformedRefused(t *testing.T) {
	_, out, _ := emitServer(context.Background(), nil, serverInput{Spec: honoemit.ServerSpec{}})
	if out.OK || out.Block == nil {
		t.Fatalf("malformed spec was not refused")
	}
}
