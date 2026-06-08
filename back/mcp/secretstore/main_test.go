package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// set then inject returns the value as an env var (the boot door).
func TestSetThenInject(t *testing.T) {
	ctx := context.Background()
	if _, out, _ := setTool(ctx, nil, setInput{Project: "p1", Name: "db_url", Value: "postgres://u:x@h/db"}); !out.OK {
		t.Fatalf("set failed: %v", out)
	}
	_, out, err := injectTool(ctx, nil, injectInput{Project: "p1", Declared: []string{"db_url"}})
	if err != nil {
		t.Fatalf("inject: %v", err)
	}
	if !out.OK || len(out.Env) != 1 || out.Env[0].Name != "APP_SECRET_DB_URL" {
		t.Fatalf("inject wrong: %+v", out)
	}
}

// a missing declared secret blocks the boot with the actionable BlockReason.
func TestInjectMissingBlocks(t *testing.T) {
	ctx := context.Background()
	setTool(ctx, nil, setInput{Project: "p2", Name: "a", Value: "v-longenough"})
	_, out, _ := injectTool(ctx, nil, injectInput{Project: "p2", Declared: []string{"a", "missing_one"}})
	if out.OK || out.Block == nil {
		t.Fatalf("missing secret must block: %+v", out)
	}
	if out.Block.Code != blockreason.CodeSecretMissingAtBoot {
		t.Fatalf("wrong code: %s", out.Block.Code)
	}
}

// rotate invalidates the old value (the next inject carries the new one).
func TestRotateThenInject(t *testing.T) {
	ctx := context.Background()
	setTool(ctx, nil, setInput{Project: "p3", Name: "k", Value: "old-value-aaa"})
	if _, out, _ := rotateTool(ctx, nil, setInput{Project: "p3", Name: "k", Value: "new-value-bbb"}); !out.OK {
		t.Fatalf("rotate failed: %v", out)
	}
	_, out, _ := injectTool(ctx, nil, injectInput{Project: "p3", Declared: []string{"k"}})
	if !out.OK || out.Env[0].Value != "new-value-bbb" {
		t.Fatalf("rotation not reflected at boot: %+v", out)
	}
}

// the leak scan finds a leaked value (scan = code).
func TestScanFindsLeak(t *testing.T) {
	ctx := context.Background()
	src := "const x = \"AKIAIOSFODNN7EXAMPLE\";\n"
	_, out, _ := scanTool(ctx, nil, scanInput{Source: src})
	if out.Clean || len(out.Findings) == 0 {
		t.Fatalf("leak scan missed an AWS key: %+v", out)
	}
}

// isolation: p4's secret never reaches p5.
func TestIsolationAcrossProjects(t *testing.T) {
	ctx := context.Background()
	setTool(ctx, nil, setInput{Project: "p4", Name: "secret", Value: "only-p4-value-9"})
	_, out, _ := injectTool(ctx, nil, injectInput{Project: "p5", Declared: []string{"secret"}})
	if out.OK || out.Block == nil {
		t.Fatalf("project p5 must not boot with p4's secret: %+v", out)
	}
}
