// stack_roundtrip_bdd_test.go — the DP13 ROUND-TRIP mirror (Godog N0). reflects=
// mcp.provision-stack-bootstrap · test_kind=acceptance · cert_language=godog ·
// authority=below · liveness=live. Written FIRST and RED, then green.
//
// It drives stack.bootstrap END TO END through the MCP transport (the SDK's
// in-memory client↔server, the SAME server the gateway fronts over HTTP) and proves
// the round-trip ALL THE WAY to the DP12 event sequence — up to and including the
// urls-printed rung (the "round-trip jusqu'à une stack qui tourne", as a deterministic
// plan-as-data: DP13 routes/projects, the REAL docker run stays gated like DP10/DP12).
//
// THE WALL (CLAUDE.md §2): the call is in-scope, below-the-line; it writes no truth.
package provisionsrv

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/cucumber/godog"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/bootstrap"
)

type rtState struct {
	cs       *mcp.ClientSession
	out      bootstrapOutput
	kinds    []string
	lastErr  error
	hasURLs  bool
	urlsRung string
}

func connectStackServer(t *testing.T) (*mcp.ClientSession, func()) {
	t.Helper()
	c := context.Background()
	clientT, serverT := mcp.NewInMemoryTransports()
	srv := NewServer()
	ss, err := srv.Connect(c, serverT, nil)
	if err != nil {
		t.Fatalf("server connect: %v", err)
	}
	cli := mcp.NewClient(&mcp.Implementation{Name: "rt-client", Version: "v0"}, nil)
	cs, err := cli.Connect(c, clientT, nil)
	if err != nil {
		t.Fatalf("client connect: %v", err)
	}
	return cs, func() { _ = cs.Close(); _ = ss.Close() }
}

func TestStackBootstrapRoundTripBDD(t *testing.T) {
	cs, closeFn := connectStackServer(t)
	defer closeFn()
	st := &rtState{cs: cs}

	suite := godog.TestSuite{
		Name: "stack-bootstrap-roundtrip",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			sc.Step(`^the provision MCP server fronts the DP12 bootstrap emitter$`, func() error {
				return nil
			})
			sc.Step(`^stack\.bootstrap is called for the active project with a clean host and present secrets$`, func() error {
				in := bootstrapInput{
					Scope:  scopeIn{Identity: "alice", ActiveProject: "proj-a"},
					Target: targetIn{ProjectID: "proj-a"},
					Bundle: pactManifest(),
					Host: hostStateIn{
						SSOutput:       "LISTEN 0 128 0.0.0.0:22 \n",
						DockerPSOutput: "0.0.0.0:5433->5432/tcp\n",
					},
					Secrets: secretsStateIn{Present: bootstrap.RequiredSecrets(pactManifest())},
				}
				res, err := st.cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "stack.bootstrap", Arguments: in})
				if err != nil {
					st.lastErr = err
					return err
				}
				if res.IsError {
					return fmt.Errorf("stack.bootstrap returned a protocol error: %+v", res.Content)
				}
				raw, err := json.Marshal(res.StructuredContent)
				if err != nil {
					return err
				}
				if err := json.Unmarshal(raw, &st.out); err != nil {
					return err
				}
				return nil
			})
			sc.Step(`^the routed call yields the full ordered bootstrap sequence$`, func() error {
				if !st.out.OK {
					return fmt.Errorf("bootstrap did not succeed: %+v", st.out.Block)
				}
				if st.out.Sequence == nil {
					return fmt.Errorf("no sequence returned")
				}
				want := bootstrap.OrderedKinds()
				if len(st.out.Sequence.Events) != len(want) {
					return fmt.Errorf("got %d events, want %d", len(st.out.Sequence.Events), len(want))
				}
				for i, k := range want {
					st.kinds = append(st.kinds, string(st.out.Sequence.Events[i].Kind))
					if st.out.Sequence.Events[i].Kind != k {
						return fmt.Errorf("event %d = %q, want %q (the ORDER is the contract)", i, st.out.Sequence.Events[i].Kind, k)
					}
				}
				return nil
			})
			sc.Step(`^the sequence runs through to the urls-printed rung$`, func() error {
				for _, e := range st.out.Sequence.Events {
					if e.Kind == bootstrap.EventURLsPrinted {
						st.hasURLs = true
						st.urlsRung = e.Detail
					}
				}
				if !st.hasURLs {
					return fmt.Errorf("the sequence never reached urls-printed (the stack-runs rung)")
				}
				if st.urlsRung == "" {
					return fmt.Errorf("urls-printed rung carries no URL detail")
				}
				if len(st.out.URLs) == 0 {
					return fmt.Errorf("stack.bootstrap must surface the printed URLs")
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"testdata/stack-bootstrap-roundtrip.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("stack-bootstrap-roundtrip Godog suite failed")
	}
}
