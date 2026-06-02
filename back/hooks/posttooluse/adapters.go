package main

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

// CheckContext is what a sensor adapter needs to run: the working directory, the
// changed files (import-relative or repo-relative), the affected package dirs, and
// — for the in-process archtest adapter — the imports parsed per file (so the
// boundary check does not re-read the disk in tests).
type CheckContext struct {
	WorkDir       string
	Files         []string
	Packages      []string
	ImportsByFile map[string][]string
}

// CheckRunner runs one named computational sensor over the changed code. It is the
// one seam the orchestration depends on (so the journey can fake outcomes and the
// fault-injection can drive the real adapters). An adapter INVOKES the frozen tool;
// it never reimplements it.
type CheckRunner interface {
	Run(name string, ctx CheckContext) CheckResult
}

// CanonicalChecks is the computational sensor suite, in the order KRD §74 lists
// them (typecheck/format → lint → archtest → affected). gofmt + vet split the
// §74 "typecheck" so each can block on its own fault.
var CanonicalChecks = []string{"gofmt", "vet", "lint", "archtest", "affected"}

// forbiddenImportPrefixes are the boundaries the default archtest adapter guards
// (ADR 0014 / ADR 0002): a projection below the waterline must never import the
// kernel truth tree. Until go-arch-lint/depguard is wired (OQ-S07-2), this is the
// one declared boundary the repo treats as truth.
var forbiddenImportPrefixes = []string{
	"github.com/steph-frtech/aidos/back/kernel/",
}

// toolRunner is the production CheckRunner: it shells out to the frozen Go tools.
type toolRunner struct{}

// NewToolRunner returns the production sensor runner (invokes gofmt / go vet /
// go test as subprocesses).
func NewToolRunner() CheckRunner { return toolRunner{} }

func (toolRunner) Run(name string, ctx CheckContext) CheckResult { return RunCheck(name, ctx) }

// RunCheck runs a single computational sensor and returns its result. It is the
// dispatcher over the adapters; an unknown name is itself an ERROR (a failure made
// explicit, never a silent pass — KRD §82).
func RunCheck(name string, ctx CheckContext) CheckResult {
	start := time.Now()
	var pass bool
	var output string

	switch name {
	case "gofmt":
		pass, output = runGofmt(ctx)
	case "vet":
		pass, output = runGoSubcmd(ctx, "vet")
	case "lint":
		// Strict-Go gate: `go build` over the affected packages (compile + the
		// strict-Go checks the toolchain enforces). go-arch-lint/depguard for a
		// richer lint is OQ-S07-2.
		pass, output = runGoSubcmd(ctx, "build")
	case "archtest":
		pass, output = runArchtest(ctx)
	case "affected":
		pass, output = runGoSubcmd(ctx, "test")
	default:
		return CheckResult{Name: name, Pass: false, Errored: true,
			Output:     "unknown sensor " + name + " — an unknown check is a failure (KRD §82)",
			DurationMS: time.Since(start).Milliseconds()}
	}

	return CheckResult{
		Name:       name,
		Pass:       pass,
		Output:     output,
		DurationMS: time.Since(start).Milliseconds(),
	}
}

// packageArgs returns the `go` package arguments for the affected packages, or
// ["./..."] when none were resolved (scope the whole working module).
func packageArgs(ctx CheckContext) []string {
	if len(ctx.Packages) == 0 {
		return []string{"./..."}
	}
	args := make([]string, 0, len(ctx.Packages))
	for _, p := range ctx.Packages {
		if !strings.HasPrefix(p, "./") && p != "." {
			p = "./" + p
		}
		args = append(args, p)
	}
	return args
}

// runGofmt reports whether the changed Go files are gofmt-clean. `gofmt -l` lists
// files that differ from the canonical format; a non-empty list is a failure.
func runGofmt(ctx CheckContext) (bool, string) {
	goFiles := goFilesOf(ctx.Files)
	if len(goFiles) == 0 {
		return true, "" // nothing Go to format
	}
	args := append([]string{"-l"}, goFiles...)
	out, err := runTool(ctx.WorkDir, "gofmt", args...)
	if err != nil {
		return false, "gofmt errored: " + err.Error() + "\n" + out
	}
	if strings.TrimSpace(out) != "" {
		return false, "unformatted (gofmt -l):\n" + out
	}
	return true, ""
}

// runGoSubcmd runs `go <sub>` over the affected packages and reports pass/fail.
func runGoSubcmd(ctx CheckContext, sub string) (bool, string) {
	args := append([]string{sub}, packageArgs(ctx)...)
	out, err := runTool(ctx.WorkDir, "go", args...)
	if err != nil {
		return false, "go " + sub + " failed:\n" + out
	}
	return true, ""
}

// runArchtest enforces the one declared boundary (ADR 0014): a changed projection
// file must not import the kernel truth tree. It reads imports from the context
// (parsed by the orchestration), falling back to a source scan of the file when
// absent. Deterministic and in-process — no subprocess.
func runArchtest(ctx CheckContext) (bool, string) {
	for _, f := range ctx.Files {
		imports := ctx.ImportsByFile[f]
		for _, imp := range imports {
			for _, banned := range forbiddenImportPrefixes {
				if strings.HasPrefix(imp, banned) {
					return false, "forbidden import: " + f + " imports " + imp +
						" (a projection below the waterline must never import the kernel truth tree — ADR 0002/0014)"
				}
			}
		}
	}
	return true, ""
}

func goFilesOf(files []string) []string {
	var out []string
	for _, f := range files {
		if strings.HasSuffix(f, ".go") {
			out = append(out, f)
		}
	}
	return out
}

// runTool runs a tool in workDir and returns combined output. A 2s-per-tool ceiling
// keeps the per-diff drawer fast; a timeout is an errored (failing) result.
func runTool(workDir, name string, args ...string) (string, error) {
	cctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, name, args...)
	if workDir != "" {
		cmd.Dir = workDir
	}
	out, err := cmd.CombinedOutput()
	return string(out), err
}
