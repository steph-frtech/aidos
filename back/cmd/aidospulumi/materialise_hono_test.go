package main

// materialise_hono_test.go — le MIROIR de l'exécuteur de la voie HONO/TS PROPRE (déterministe ;
// pulumi non lancé). MaterialiseHono matérialise les TROIS conteneurs câblés (Hono émis + sidecar Go
// + postgres) ; avec --entities il émet AUSSI le schema du projet. On prouve le demi DÉTERMINISTE :
// les fichiers Pulumi câblés (+ schema) sont sur disque, byte-stable, sans jamais exécuter pulumi.

import (
	"os"
	"path/filepath"
	"testing"
)

// TestMaterialiseHono_WiresThreeContainers — MaterialiseHono lands a Pulumi program that wires the
// three containers: the server points the sidecar by name (INTERPRETER_URL), the sidecar points the
// DB (DATABASE_URL), postgres carries POSTGRES_* + healthcheck. No --entities → no schema mount.
func TestMaterialiseHono_WiresThreeContainers(t *testing.T) {
	root := t.TempDir()

	mat, err := MaterialiseHono(root, "shop", "dev", "", "")
	if err != nil {
		t.Fatalf("MaterialiseHono: %v", err)
	}
	dir := filepath.Join(root, ".deploy-pulumi", "shop-dev")
	if mat.Dir != dir {
		t.Fatalf("dir = %q, want %q", mat.Dir, dir)
	}
	idx, err := os.ReadFile(filepath.Join(dir, "index.ts"))
	if err != nil {
		t.Fatalf("read index.ts: %v", err)
	}
	for _, want := range []string{
		`name: "shop-dev-server"`,
		`name: "shop-dev-interpreter"`,
		`name: "shop-dev-db"`,
		"INTERPRETER_URL=http://shop-dev-interpreter:8080",
		"DATABASE_URL=postgres://app:shop@shop-dev-db:5432/shop?sslmode=disable",
		"aidos-hono:latest",
		"aidos-interpreter:latest",
		"pg_isready",
	} {
		if !contains(string(idx), want) {
			t.Fatalf("index.ts missing %q:\n%s", want, string(idx))
		}
	}
	// No --entities → no schema mount, no schema.sql file on disk.
	if contains(string(idx), "01-schema.sql") {
		t.Fatalf("a schema mount appeared though no --entities was passed")
	}
	if _, err := os.Stat(filepath.Join(dir, "schema.sql")); err == nil {
		t.Fatalf("schema.sql landed though no --entities was passed")
	}
	if mat.URL != "https://shop-dev.sagedesk.fr" {
		t.Fatalf("url = %q, want the gold domain", mat.URL)
	}
}

// TestMaterialiseHono_WithEntities — with --entities MaterialiseHono emits the project's schema and the
// Pulumi program mounts it (01-schema.sql), still wiring the three containers.
func TestMaterialiseHono_WithEntities(t *testing.T) {
	root := t.TempDir()
	entFile := writeEntitiesFile(t, t.TempDir())

	mat, err := MaterialiseHono(root, "library", "dev", entFile, "")
	if err != nil {
		t.Fatalf("MaterialiseHono(entities): %v", err)
	}
	schema, err := os.ReadFile(filepath.Join(mat.Dir, "schema.sql"))
	if err != nil {
		t.Fatalf("read schema.sql: %v", err)
	}
	if !contains(string(schema), "book") || !contains(string(schema), "loan") {
		t.Fatalf("schema.sql missing the project's tables:\n%s", string(schema))
	}
	idx, _ := os.ReadFile(filepath.Join(mat.Dir, "index.ts"))
	for _, want := range []string{
		"/docker-entrypoint-initdb.d/01-schema.sql",
		"INTERPRETER_URL=http://library-dev-interpreter:8080",
	} {
		if !contains(string(idx), want) {
			t.Fatalf("index.ts missing %q:\n%s", want, string(idx))
		}
	}
	if contains(string(idx), "02-seed.sql") {
		t.Fatalf("a seed mount appeared though no --seed was passed")
	}
}

// TestMaterialiseHono_WithSeed — a seed file mounts as 02-seed.sql alongside the schema.
func TestMaterialiseHono_WithSeed(t *testing.T) {
	root := t.TempDir()
	src := t.TempDir()
	entFile := writeEntitiesFile(t, src)
	seedFile := filepath.Join(src, "seed.sql")
	if err := os.WriteFile(seedFile, []byte("INSERT INTO book VALUES ('x','y');\n"), 0o644); err != nil {
		t.Fatalf("write seed: %v", err)
	}

	mat, err := MaterialiseHono(root, "library", "prod", entFile, seedFile)
	if err != nil {
		t.Fatalf("MaterialiseHono(seed): %v", err)
	}
	if _, err := os.Stat(filepath.Join(mat.Dir, "seed.sql")); err != nil {
		t.Fatalf("seed.sql not landed: %v", err)
	}
	idx, _ := os.ReadFile(filepath.Join(mat.Dir, "index.ts"))
	if !contains(string(idx), "02-seed.sql") {
		t.Fatalf("seed mount missing though --seed was passed:\n%s", string(idx))
	}
}

// TestMaterialiseHono_Idempotent — same inputs → byte-identical Pulumi file hashes across runs.
func TestMaterialiseHono_Idempotent(t *testing.T) {
	root := t.TempDir()
	a, err := MaterialiseHono(root, "shop", "dev", "", "")
	if err != nil {
		t.Fatalf("MaterialiseHono #1: %v", err)
	}
	b, err := MaterialiseHono(root, "shop", "dev", "", "")
	if err != nil {
		t.Fatalf("MaterialiseHono #2: %v", err)
	}
	for name, h1 := range a.Files {
		if h2, ok := b.Files[name]; !ok || h1 != h2 {
			t.Fatalf("file %s hash drifted between runs (%q vs %q)", name, h1, h2)
		}
	}
}

// TestMaterialiseHono_MissingArgs — an empty project/env is refused (the honesty rule).
func TestMaterialiseHono_MissingArgs(t *testing.T) {
	root := t.TempDir()
	if _, err := MaterialiseHono(root, "", "dev", "", ""); err == nil {
		t.Fatalf("missing --project was NOT refused")
	}
	if _, err := MaterialiseHono(root, "p", "", "", ""); err == nil {
		t.Fatalf("missing --env was NOT refused")
	}
}
