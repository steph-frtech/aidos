package relemit

import (
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// EmitWorker renders the schema's ASYNC WORKER (ADR 0040: TS, roadmap S74 supersedes S73's
// Go). For each async operation (S73, in canonical name order) it renders:
//
//   - a `dispatch<Op>` function that drains the operation's effects from the outbox and
//     dispatches each through the typed channel (cron/queue/webhook_out/notification),
//     keyed by the effect's idempotency id (the at-least-once → exactly-once-relative key);
//   - for a CRON-triggered op, the SCHEDULED echeance baked in as a constant (the `at`), so
//     the emitted scheduler fires the op at the declared wall-clock time;
//   - a `Dispatcher` port (the runtime supplies the channels) — the emitter renders the
//     deterministic SHAPE, never the transport.
//
// A worker is emitted iff the schema carries ≥ 1 async op; an empty AsyncOps yields a
// BlockReason (there is nothing to emit — the caller must not ask for a worker without an
// async node). It is a PURE function of the schema: same schema → byte-identical worker.
func EmitWorker(s Schema) (Artifact, *blockreason.BlockReason) {
	if err := Validate(s); err != nil {
		return Artifact{}, block(err)
	}
	if len(s.AsyncOps) == 0 {
		return Artifact{}, block(ErrAsyncNoName)
	}
	sourceHash, err := SchemaHash(s)
	if err != nil {
		return Artifact{}, block(err)
	}

	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// S74 async worker: drains the outbox, dispatches typed effects (Hono/TS, ADR 0040).\n\n")

	b.WriteString("export type OutboxRow = { effect_id: string; operation: string; kind: string; target: string; payload: unknown; dispatched: boolean };\n")
	b.WriteString("export type Outbox = {\n")
	b.WriteString("\tpending(operation: string): Promise<OutboxRow[]>;\n")
	b.WriteString("\tmarkDispatched(effectId: string): Promise<void>;\n")
	b.WriteString("};\n")
	b.WriteString("export type Dispatcher = {\n")
	b.WriteString("\tcron(target: string, payload: unknown): Promise<void>;\n")
	b.WriteString("\tqueue(target: string, payload: unknown): Promise<void>;\n")
	b.WriteString("\twebhook_out(target: string, payload: unknown): Promise<void>;\n")
	b.WriteString("\tnotification(target: string, payload: unknown): Promise<void>;\n")
	b.WriteString("};\n\n")

	for _, ao := range canonicalAsync(s) {
		opConst := strings.ToUpper(ao.Name[:1]) + ao.Name[1:]
		if ao.Async.Trigger.Kind == operation.TriggerCron {
			fmt.Fprintf(&b, "export const %s_SCHEDULED_AT = %s;\n", strings.ToUpper(ao.Name), jsStr(ao.Async.Trigger.At))
		}
		fmt.Fprintf(&b, "export async function dispatch%s(outbox: Outbox, dispatcher: Dispatcher): Promise<number> {\n", opConst)
		fmt.Fprintf(&b, "\tconst rows = await outbox.pending(%s);\n", jsStr(ao.Name))
		b.WriteString("\tlet dispatched = 0;\n")
		b.WriteString("\tfor (const row of rows) {\n")
		b.WriteString("\t\tif (row.dispatched) continue;\n")
		b.WriteString("\t\tswitch (row.kind) {\n")
		for _, tk := range operation.TriggerKinds() {
			fmt.Fprintf(&b, "\t\t\tcase %s: await dispatcher.%s(row.target, row.payload); break;\n", jsStr(string(tk)), string(tk))
		}
		b.WriteString("\t\t\tdefault: continue;\n")
		b.WriteString("\t\t}\n")
		b.WriteString("\t\tawait outbox.markDispatched(row.effect_id);\n")
		b.WriteString("\t\tdispatched++;\n")
		b.WriteString("\t}\n")
		b.WriteString("\treturn dispatched;\n")
		b.WriteString("}\n\n")
	}

	out := []byte(strings.TrimRight(b.String(), "\n") + "\n")
	return artifact("gen/"+s.Project+"/worker.ts", TargetWorker, out, sourceHash), nil
}

// EmitAll fans the schema across the closed target set in canonical target order (DDL, TS,
// then Worker iff async). A caller regenerates the whole emitted tree in one deterministic
// pass. A BlockReason from any target short-circuits (no partial tree).
func EmitAll(s Schema) ([]Artifact, *blockreason.BlockReason) {
	var out []Artifact
	ddl, br := EmitDDL(s)
	if br != nil {
		return nil, br
	}
	out = append(out, ddl)
	ts, br := EmitTS(s)
	if br != nil {
		return nil, br
	}
	out = append(out, ts)
	if len(s.AsyncOps) > 0 {
		w, br := EmitWorker(s)
		if br != nil {
			return nil, br
		}
		out = append(out, w)
	}
	return out, nil
}
