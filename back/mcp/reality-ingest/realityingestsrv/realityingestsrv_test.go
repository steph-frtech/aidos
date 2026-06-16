package realityingestsrv

import (
	"context"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/realityingest"
)

// The reality-ingest MCP server is the S106 capability door (the wall: read-only on the
// kernel). These tests prove the tools return the §S106 loop deterministically at the MCP
// boundary — the done-criterion: a telemetry divergence → a RealityMirror with provenance=
// incident → a DRAFT idea whose text is the template projection; reality never writes truth.

func outOfStockInput() detectInput {
	return detectInput{
		ProjectID: "shop-42",
		Report: realityingest.TelemetryReport{
			Operation: "createOrder", Calls: 1000, Errors: 300, P99Ms: 220,
		},
		Expectation: realityingest.MirrorExpectation{
			MirrorRef: "createOrder-succeeds", Operation: "createOrder", MaxErrorRate: 0, MaxP99Ms: 500,
		},
	}
}

func TestDetectDivergenceTool(t *testing.T) {
	_, out, err := detectDivergence(context.Background(), nil, outOfStockInput())
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !out.Diverged || out.Divergence == nil {
		t.Fatalf("a 30-percent-error report must diverge; got %+v", out)
	}
	if out.Divergence.ProjectID != "shop-42" {
		t.Errorf("divergence must be project-scoped: %q", out.Divergence.ProjectID)
	}
}

func TestIngestDivergenceTool_ProvenanceIncidentNoKernelWrite(t *testing.T) {
	_, out, err := ingestDivergence(context.Background(), nil, outOfStockInput())
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !out.Diverged || out.Draft == nil {
		t.Fatalf("the loop must produce a draft; got %+v", out)
	}
	if out.Draft.Idea.Provenance.Source != ideas.ProvenanceIncident {
		t.Errorf("provenance must be incident: %q", out.Draft.Idea.Provenance.Source)
	}
	if out.Draft.WroteKernel {
		t.Error("the ingestion must NOT write the kernel")
	}
	if out.Draft.ToKernelRefusal == nil || string(out.Draft.ToKernelRefusal.Code) != "REALITY_CANNOT_DECLARE_TRUTH" {
		t.Errorf("the direct Reality→Kernel edge must be refused; got %+v", out.Draft.ToKernelRefusal)
	}
}

func TestRenderIdeaTextTool_IsTemplate(t *testing.T) {
	_, det, err := detectDivergence(context.Background(), nil, outOfStockInput())
	if err != nil || det.Divergence == nil {
		t.Fatalf("detect: %v", err)
	}
	_, out, err := renderIdeaText(context.Background(), nil, renderInput{Divergence: *det.Divergence})
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	for _, want := range []string{"createOrder-succeeds", "shop-42", "30.0%", "1000 calls"} {
		if !strings.Contains(out.Text, want) {
			t.Errorf("template text must name %q; got: %s", want, out.Text)
		}
	}
}

func TestHealthyReportTool_NoIdea(t *testing.T) {
	in := outOfStockInput()
	in.Report.Errors = 0
	_, out, err := ingestDivergence(context.Background(), nil, in)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if out.Diverged || out.Draft != nil {
		t.Errorf("a healthy report must produce no draft; got %+v", out)
	}
}

func TestNewServer(t *testing.T) {
	if NewServer() == nil {
		t.Fatal("server must build")
	}
}
