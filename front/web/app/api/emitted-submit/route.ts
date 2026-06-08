import { NextResponse } from "next/server";

/**
 * /api/emitted-submit — the DATASTORE STAND-IN for the emitted app's create-order operation
 * (S93 done-criterion: "Playwright sur un form généré qui soumet une vraie operation contre le
 * datastore (dont un upload blob)").
 *
 * The emitted FRONT (lib/front-emitter) renders a real create form that POSTS here. This
 * endpoint is the BELOW-THE-LINE datastore stand-in: it parses the multipart body, validates
 * the blob upload against the emitted entity's allow-list + size ceiling (the SAME contract the
 * S72 blob node pins — image/png|application/pdf, ≤ 5 MB), assigns a server-side id (the
 * identifier the create-form never inputs), and records the row in a project-scoped in-memory
 * store. It returns the assigned id + the validated blob facts (name, size) so the form proves
 * the submission landed.
 *
 * OpenQuestion OQ-S93-datastore (forward-dependency, CLAUDE.md §6 bootstrap exception). The
 * emitted app's LIVE Doltgres/Postgres datastore (the data-versioning target, ADR 0006) is a
 * later tooth — not a running service inside the Workbench. This route is therefore an
 * in-memory stand-in that exercises the SAME submission shape (multipart + blob validation +
 * server-assigned id); when the emitted runtime lands, the form posts to the emitted API route
 * instead. A documented OpenQuestion, not a failing residual.
 *
 * THE WALL (CLAUDE.md §2): this writes to a BELOW-THE-LINE store (a projection/runtime
 * datastore), NEVER the kernel/mirrors/fitness. Determinism: id assignment is a monotonic
 * counter (no clock, no rng in the response shape).
 */

const ALLOWED_MIME = ["image/png", "application/pdf"] as const;
const MAX_BYTES = 5_000_000;

// A project-scoped in-memory store (the datastore stand-in). Module-scope state is acceptable
// here: this is the runtime datastore adapter, NOT an emitted-app FN02 module.
const store: Record<string, { id: number; total: string; paid: boolean }[]> =
	{};
let nextId = 1;

export async function POST(req: Request) {
	let form: FormData;
	try {
		form = await req.formData();
	} catch {
		return NextResponse.json(
			{ ok: false, error: "malformed multipart body" },
			{ status: 400 },
		);
	}

	const entity = String(form.get("entity") ?? "order");
	const total = String(form.get("total") ?? "").trim();
	if (!total) {
		return NextResponse.json(
			{ ok: false, error: "total is required" },
			{ status: 422 },
		);
	}
	const paid = form.get("paid") === "on";

	// Validate the blob upload against the emitted entity's allow-list + ceiling (S72 contract).
	let blob: { name: string; size: number } | null = null;
	const receipt = form.get("receipt");
	if (receipt && receipt instanceof File && receipt.size > 0) {
		if (!ALLOWED_MIME.includes(receipt.type as (typeof ALLOWED_MIME)[number])) {
			return NextResponse.json(
				{ ok: false, error: `blob mime ${receipt.type} not allowed` },
				{ status: 422 },
			);
		}
		if (receipt.size > MAX_BYTES) {
			return NextResponse.json(
				{ ok: false, error: "blob exceeds max_bytes" },
				{ status: 422 },
			);
		}
		blob = { name: receipt.name, size: receipt.size };
	}

	const id = nextId++;
	const key = entity;
	if (!store[key]) store[key] = [];
	store[key].push({ id, total, paid });

	return NextResponse.json({ ok: true, id, blob });
}
