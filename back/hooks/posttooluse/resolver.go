package main

import (
	"path/filepath"
	"sort"
	"strings"
)

// Event is the decoded PostToolUse tool-call the hook evaluates. The harness feeds
// it on stdin as JSON. We accept both the flat shape (path at top level) and the
// Claude Code shape (tool_name + tool_input.file_path / file_paths), so the same
// hook serves the build harness and a raw probe (the S04 precedent). Decode is
// pure (determinism-first).
type Event struct {
	// Tool is the tool that produced the diff (Edit / Write / MultiEdit).
	Tool string `json:"tool_name"`
	// Path is the flat on-disk write target, when the tool wrote one file.
	Path string `json:"path"`
	// Ref is the commit/changeset reference this diff was taken against (audit).
	Ref string `json:"ref"`
	// ToolInput is the Claude Code nested payload; file_path(s) live under it.
	ToolInput struct {
		FilePath  string   `json:"file_path"`
		FilePaths []string `json:"file_paths"`
	} `json:"tool_input"`
}

// ChangedFiles resolves the changed-code file set from the event. It is the source
// of the affected set (ADR 0014, CONTEXT.md "affected set"): the file(s) the event
// names, never the whole repo. Pure and total — same event ⇒ same set.
func ChangedFiles(ev Event) []string {
	var files []string
	if ev.Path != "" {
		files = append(files, ev.Path)
	}
	if ev.ToolInput.FilePath != "" {
		files = append(files, ev.ToolInput.FilePath)
	}
	files = append(files, ev.ToolInput.FilePaths...)
	return dedupe(files)
}

// HasGoChanges reports whether the changed set contains any Go source file — the
// gate for running the Go-toolchain sensors (gofmt / vet / lint / affected).
func HasGoChanges(files []string) bool {
	for _, f := range files {
		if strings.HasSuffix(f, ".go") {
			return true
		}
	}
	return false
}

// AffectedGoPackages maps changed Go files to their package directories (deduped,
// sorted). Non-Go files are excluded. This is the affected package set the Go
// sensors scope over (the reverse-dependency closure is a later precision,
// OQ-S07-1).
func AffectedGoPackages(files []string) []string {
	seen := map[string]struct{}{}
	for _, f := range files {
		if !strings.HasSuffix(f, ".go") {
			continue
		}
		dir := filepath.Dir(f)
		seen[dir] = struct{}{}
	}
	out := make([]string, 0, len(seen))
	for d := range seen {
		out = append(out, d)
	}
	sort.Strings(out)
	return out
}

func dedupe(in []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}
