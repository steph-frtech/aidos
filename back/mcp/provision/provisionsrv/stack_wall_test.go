// stack_wall_test.go — the DP13 WALL + DETERMINISM mirrors. Written FIRST and RED
// (the stack.* handlers do not exist yet), then green — the red IS the /goal.
//
// reflects=mcp.provision-stack-wall · test_kind=property+acceptance ·
// cert_language=rapid+go · authority=below · liveness=live.
//
// It pins the DP13 server-side wall (CLAUDE.md §2) and the "pur routage, zéro LLM"
// determinism done-criterion:
//
//   - A DIRECT TRUTH-WRITE (stack.engrave_manifest) is REFUSED with
//     GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET — never performed, never bypassing the
//     GRANTs the Postgres role enforces independently.
//   - A CROSS-PROJECT / FORGED call is refused with AGENT_CROSS_PROJECT_WRITE BEFORE
//     any emission (the SAME projectwall predicate the RLS enforces, never forked).
//   - BELOW-THE-LINE ACTS DIRECT: a same-project, same-identity projection emits.
//   - PURE ROUTING: same request ⇒ byte-identical response (reproducibility).
package provisionsrv

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"pgregory.net/rapid"
)

// --- THE WALL: a direct truth-write is refused, never performed ---

func TestWall_EngraveManifest_RefusedNotPerformed(t *testing.T) {
	out := callEngrave(t, engraveInput{Scope: okScope(), Target: okTarget(), Manifest: pactManifest()})
	if out.OK {
		t.Fatal("stack.engrave_manifest must NEVER succeed — a manifest is above-the-line truth")
	}
	if out.Block == nil {
		t.Fatal("a refused truth-write MUST carry a BlockReason (KRD §44.5, never a silent 404)")
	}
	if string(out.Block.Code) != string(gateway.CodeTruthWriteNeedsChangeset) {
		t.Fatalf("truth-write refusal code = %q, want GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET", out.Block.Code)
	}
	if len(out.Block.HowToFix) == 0 {
		t.Fatal("a BlockReason with an empty how_to_fix is a prison (KRD §44.5) — name the ChangeSet door")
	}
}

// --- THE WALL: a cross-project / forged call is refused before any emission ---

func TestWall_CrossProject_RefusedBeforeEmission(t *testing.T) {
	out := callEmit(t, emitInput{Scope: okScope(), Target: crossTarget(), Manifest: pactManifest()})
	if out.OK {
		t.Fatal("a cross-project stack.emit must be refused (the cross-tenant leak)")
	}
	if out.Block == nil || string(out.Block.Code) != string(gateway.CodeAgentCrossProjectWrite) {
		t.Fatalf("cross-project refusal without AGENT_CROSS_PROJECT_WRITE: %+v", out.Block)
	}
	if out.Bundle != nil {
		t.Fatal("a refused call emits NO bundle (the wall acts BEFORE the emitter)")
	}
}

func TestWall_ForgedIdentity_Refused(t *testing.T) {
	out := callBootstrap(t, bootstrapInput{
		Scope: okScope(), Target: forgedTarget(),
		Bundle: pactManifest(), Host: pactBootstrapInput().Host, Secrets: pactBootstrapInput().Secrets,
	})
	if out.OK {
		t.Fatal("a forged-identity stack.bootstrap must be refused (S61 defense-in-depth)")
	}
	if out.Block == nil || string(out.Block.Code) != string(gateway.CodeAgentCrossProjectWrite) {
		t.Fatalf("forged-identity refusal without AGENT_CROSS_PROJECT_WRITE: %+v", out.Block)
	}
	if out.Sequence != nil {
		t.Fatal("a refused bootstrap emits NO sequence")
	}
}

// --- BELOW THE LINE ACTS DIRECT: an in-scope projection emits ---

func TestBelowLine_SelectProfile_ActsDirect(t *testing.T) {
	out := callSelectProfile(t, selectProfileInput{
		Scope: okScope(), Target: okTarget(), Manifest: pactManifest(),
		Profile: "core", Environment: "prod",
	})
	if !out.OK {
		t.Fatalf("an in-scope, in-set profile selection must act direct: %+v", out.Block)
	}
	if out.Manifest == nil {
		t.Fatal("stack.select_profile must return the filtered manifest")
	}
}

func TestBelowLine_UnknownProfile_RefusedWithCode(t *testing.T) {
	out := callSelectProfile(t, selectProfileInput{
		Scope: okScope(), Target: okTarget(), Manifest: pactManifest(),
		Profile: "no-such-profile", Environment: "prod",
	})
	if out.OK {
		t.Fatal("an out-of-set profile must be refused (UNKNOWN_PROFILE), never coerced to full")
	}
	if out.Block == nil || string(out.Block.Code) != "UNKNOWN_PROFILE" {
		t.Fatalf("unknown profile refusal without UNKNOWN_PROFILE: %+v", out.Block)
	}
}

func TestBelowLine_NonProdInProd_DelegatesDP06Gate(t *testing.T) {
	out := callSelectProfile(t, selectProfileInput{
		Scope: okScope(), Target: okTarget(), Manifest: pactManifest(),
		Profile: "non-prod", Environment: "prod",
	})
	if out.OK {
		t.Fatal("non-prod × prod must be refused (DOLTGRES_NOT_ALLOWED_IN_PROD — the DP06 gate)")
	}
	if out.Block == nil || string(out.Block.Code) != "DOLTGRES_NOT_ALLOWED_IN_PROD" {
		t.Fatalf("non-prod×prod refusal without DOLTGRES_NOT_ALLOWED_IN_PROD: %+v", out.Block)
	}
}

func TestBelowLine_PrintURLs_ActsDirect(t *testing.T) {
	out := callPrintURLs(t, printURLsInput{
		Scope: okScope(), Target: okTarget(), Bundle: pactManifest(),
		Host: pactBootstrapInput().Host, Secrets: pactBootstrapInput().Secrets,
	})
	if !out.OK {
		t.Fatalf("an in-scope stack.print_urls must act direct: %+v", out.Block)
	}
	if len(out.URLs) == 0 {
		t.Fatal("stack.print_urls must surface the printed URLs (the urls-printed rung)")
	}
}

func TestBelowLine_Bootstrap_MissingSecretBlocks(t *testing.T) {
	out := callBootstrap(t, bootstrapInput{
		Scope: okScope(), Target: okTarget(), Bundle: pactManifest(),
		Host:    pactBootstrapInput().Host,
		Secrets: secretsStateIn{}, // none present → the declared secret is missing
	})
	if out.OK {
		t.Fatal("a missing required secret must block the bootstrap (MISSING_SECRET_AT_BOOT)")
	}
	if out.Block == nil || string(out.Block.Code) != "MISSING_SECRET_AT_BOOT" {
		t.Fatalf("missing-secret refusal without MISSING_SECRET_AT_BOOT: %+v", out.Block)
	}
}

// --- PURE ROUTING: same request ⇒ byte-identical response (zero LLM, reproducible) ---

func TestPureRouting_BootstrapDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		ss := rapid.SampledFrom([]string{
			"LISTEN 0 128 0.0.0.0:22 \n",
			"LISTEN 0 128 0.0.0.0:80 \nLISTEN 0 128 0.0.0.0:81 \n",
			"",
		}).Draw(rt, "ss")
		in := bootstrapInput{
			Scope: okScope(), Target: okTarget(), Bundle: pactManifest(),
			Host:    hostStateIn{SSOutput: ss, DockerPSOutput: "0.0.0.0:5433->5432/tcp\n"},
			Secrets: pactBootstrapInput().Secrets,
		}
		a := callBootstrap(t, in)
		b := callBootstrap(t, in)
		if a.OK != b.OK {
			rt.Fatalf("non-deterministic OK: %v != %v", a.OK, b.OK)
		}
		if a.OK {
			if a.Sequence == nil || b.Sequence == nil {
				rt.Fatal("a successful bootstrap must carry a sequence")
			}
			if a.Sequence.Hash() != b.Sequence.Hash() {
				rt.Fatalf("non-deterministic sequence: %s != %s", a.Sequence.Hash(), b.Sequence.Hash())
			}
			if a.SequenceHash != b.SequenceHash {
				rt.Fatalf("non-deterministic sequence hash: %s != %s", a.SequenceHash, b.SequenceHash)
			}
		}
	})
}

func TestPureRouting_ResolvePortsDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		ss := rapid.SampledFrom([]string{
			"LISTEN 0 128 0.0.0.0:80 \nLISTEN 0 128 0.0.0.0:81 \n",
			"LISTEN 0 128 0.0.0.0:22 \n",
		}).Draw(rt, "ss")
		in := resolvePortsInput{Scope: okScope(), Target: okTarget(), Host: hostStateIn{SSOutput: ss}}
		a := callResolvePorts(t, in)
		b := callResolvePorts(t, in)
		if a.OK != b.OK || a.ResolvedPort != b.ResolvedPort {
			rt.Fatalf("non-deterministic resolve_ports: (%v,%d) != (%v,%d)", a.OK, a.ResolvedPort, b.OK, b.ResolvedPort)
		}
	})
}
