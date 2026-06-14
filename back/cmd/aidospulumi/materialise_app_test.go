package main

// materialise_app_test.go — le MIROIR de l'exécuteur PAR PROJET (déterministe ; pulumi non lancé).
//
// MaterialiseApp émet les DONNÉES du projet (schema.sql + entities.json [+ seed.sql]) dans le dir du
// stack PUIS le programme Pulumi AVEC les montages — le geste side-effectant (pulumi up) reste hors
// test. On prouve le demi DÉTERMINISTE : les fichiers de données + le programme à montages sont sur
// disque, byte-stable, sans jamais exécuter pulumi.

import (
	"os"
	"path/filepath"
	"testing"
)

// writeEntitiesFile lands a tiny project catalogue JSON in a temp dir and returns its path.
func writeEntitiesFile(t *testing.T, dir string) string {
	t.Helper()
	p := filepath.Join(dir, "entities.json")
	body := `[
		{"id":"e_Book","name":"Book","fields":[{"name":"isbn","type":"text"},{"name":"title","type":"text"}]},
		{"id":"e_Loan","name":"Loan","fields":[{"name":"id","type":"text"},{"name":"due","type":"timestamptz"}]}
	]`
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatalf("write entities file: %v", err)
	}
	return p
}

// TestMaterialiseApp_WritesProjectDataAndMountedProgram — MaterialiseApp lands the project's OWN
// data (schema.sql + entities.json) AND a Pulumi program that mounts them — the per-project deploy.
func TestMaterialiseApp_WritesProjectDataAndMountedProgram(t *testing.T) {
	root := t.TempDir()
	entFile := writeEntitiesFile(t, t.TempDir())

	mat, err := MaterialiseApp(root, "library", "dev", entFile, "", "Library")
	if err != nil {
		t.Fatalf("MaterialiseApp: %v", err)
	}
	dir := filepath.Join(root, ".deploy-pulumi", "library-dev")
	if mat.Dir != dir {
		t.Fatalf("dir = %q, want %q", mat.Dir, dir)
	}

	// The DATA files are on disk, carrying THIS project's entities (not Alpha Shop).
	schema, err := os.ReadFile(filepath.Join(dir, "schema.sql"))
	if err != nil {
		t.Fatalf("read schema.sql: %v", err)
	}
	if !contains(string(schema), "book") || !contains(string(schema), "loan") {
		t.Fatalf("schema.sql missing the project's tables:\n%s", string(schema))
	}
	if contains(string(schema), "product") {
		t.Fatalf("Alpha Shop leaked into the library project schema")
	}
	ents, err := os.ReadFile(filepath.Join(dir, "entities.json"))
	if err != nil {
		t.Fatalf("read entities.json: %v", err)
	}
	if !contains(string(ents), `"name": "Book"`) {
		t.Fatalf("entities.json missing the Book entity:\n%s", string(ents))
	}

	// The Pulumi program MOUNTS the data + carries APP_NAME (the gold form).
	idx, err := os.ReadFile(filepath.Join(dir, "index.ts"))
	if err != nil {
		t.Fatalf("read index.ts: %v", err)
	}
	for _, want := range []string{
		"/docker-entrypoint-initdb.d/01-schema.sql",
		"/app/entities.json",
		"APP_NAME=Library",
		"aidos-app:latest",
	} {
		if !contains(string(idx), want) {
			t.Fatalf("index.ts missing %q:\n%s", want, string(idx))
		}
	}
	// No seed was passed → no 02-seed mount.
	if contains(string(idx), "02-seed.sql") {
		t.Fatalf("a seed mount appeared though no --seed was passed")
	}
}

// TestMaterialiseApp_WithSeed — a seed file is copied as seed.sql and mounted as 02-seed.sql.
func TestMaterialiseApp_WithSeed(t *testing.T) {
	root := t.TempDir()
	src := t.TempDir()
	entFile := writeEntitiesFile(t, src)
	seedFile := filepath.Join(src, "seed.sql")
	if err := os.WriteFile(seedFile, []byte("INSERT INTO book VALUES ('x','y');\n"), 0o644); err != nil {
		t.Fatalf("write seed: %v", err)
	}

	mat, err := MaterialiseApp(root, "library", "prod", entFile, seedFile, "")
	if err != nil {
		t.Fatalf("MaterialiseApp(seed): %v", err)
	}
	if _, err := os.Stat(filepath.Join(mat.Dir, "seed.sql")); err != nil {
		t.Fatalf("seed.sql not landed: %v", err)
	}
	idx, _ := os.ReadFile(filepath.Join(mat.Dir, "index.ts"))
	if !contains(string(idx), "02-seed.sql") {
		t.Fatalf("seed mount missing though --seed was passed:\n%s", string(idx))
	}
}

// TestMaterialiseApp_Idempotent — same inputs → byte-identical Pulumi file hashes across runs.
func TestMaterialiseApp_Idempotent(t *testing.T) {
	root := t.TempDir()
	entFile := writeEntitiesFile(t, t.TempDir())
	a, err := MaterialiseApp(root, "shop", "dev", entFile, "", "Shop")
	if err != nil {
		t.Fatalf("MaterialiseApp #1: %v", err)
	}
	b, err := MaterialiseApp(root, "shop", "dev", entFile, "", "Shop")
	if err != nil {
		t.Fatalf("MaterialiseApp #2: %v", err)
	}
	for name, h1 := range a.Files {
		if h2, ok := b.Files[name]; !ok || h1 != h2 {
			t.Fatalf("file %s hash drifted between runs (%q vs %q)", name, h1, h2)
		}
	}
}

// TestMaterialiseApp_MissingEntities — without --entities MaterialiseApp refuses (callers use the
// gold-default Materialise instead). The honesty rule.
func TestMaterialiseApp_MissingEntities(t *testing.T) {
	root := t.TempDir()
	if _, err := MaterialiseApp(root, "p", "dev", "", "", ""); err == nil {
		t.Fatalf("missing --entities was NOT refused")
	}
}
