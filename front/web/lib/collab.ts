import { createHash } from "node:crypto";
import { authorize as authorizeMembership, type Role } from "./membership";

export type { Role };

/**
 * lib/collab.ts — the S113 COLLABORATION SUBSTRATE, the pure TS twin of
 * back/runtime/collab (the Go authority). It mirrors, deterministically and
 * client-side-mirrorably: identified provenance on every act, comments on
 * ideas/miroirs/changesets, an activity feed, real-time presence with
 * concurrent-edit protection, and the per-project AdoptionStage ladder.
 *
 * THE WALL (CLAUDE.md §2). Every act is BELOW the line — it acts directly in the
 * `collab` below-the-line zone; this twin writes NO truth. The only truth-implying
 * act (approving a ChangeSet) is the S110/S85 propose→ChangeSet path — here we only
 * AUTHORIZE it and stamp the provenance.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function is PURE and TOTAL; every record
 * is content-addressed (SHA-256, byte-identical to the Go records.Hash) so the same
 * input lands the same id. A blank identity is refused everywhere — provenance is
 * NEVER a placeholder.
 */

export type Verdict = "allow" | "deny";
export type Act = "comment" | "share" | "invite" | "approve";
export type BlockCode =
	| "UNIDENTIFIED_ACTOR"
	| "NOT_A_MEMBER"
	| "ROLE_FORBIDDEN"
	| "EMPTY_BODY"
	| "STAGE_GATE_UNMET";

export interface BlockReason {
	code: BlockCode;
	severity: string;
	explanation: string;
	howToFix: string[];
}
export interface Decision {
	verdict: Verdict;
	blockReason?: BlockReason;
}

export interface Actor {
	identity: string;
	projectId: string;
	/** the actor's role in projectId, or null when a non-member. */
	role: Role | null;
}

export function isIdentified(a: Actor): boolean {
	return a.identity.trim() !== "" && a.projectId.trim() !== "";
}

/** the S62 op each act needs (read for comment/share; administer for invite/approve). */
function requiredOp(act: Act): "read" | "administer" {
	return act === "invite" || act === "approve" ? "administer" : "read";
}

function unidentifiedActor(): BlockReason {
	return {
		code: "UNIDENTIFIED_ACTOR",
		severity: "error",
		explanation:
			"L'acte social a été tenté sans identité résolue — la provenance ne doit JAMAIS être un placeholder (« qui a voulu quoi » avec de vrais users).",
		howToFix: [
			"Authentifiez-vous (S61) pour résoudre une identité réelle.",
			"Agissez dans un projet précis (project_id non vide).",
		],
	};
}
function notAMember(projectId: string): BlockReason {
	return {
		code: "NOT_A_MEMBER",
		severity: "error",
		explanation: `L'identité résolue ne détient aucune adhésion dans « ${projectId} » — un non-membre ne peut pas agir sur ce projet.`,
		howToFix: [
			"Demandez à un owner du projet de vous inviter (/invite).",
			"Vérifiez que vous agissez dans le bon projet.",
		],
	};
}
function roleForbidden(act: Act): BlockReason {
	return {
		code: "ROLE_FORBIDDEN",
		severity: "error",
		explanation: `Le rôle de ce membre est trop bas pour l'acte « ${act} » : approuver/inviter exige l'autorité administer (owner).`,
		howToFix: [
			"Demandez à un owner d'effectuer cet acte.",
			"Demandez une promotion de rôle (viewer→editor→owner) à un owner.",
		],
	};
}
function emptyBody(what: string): BlockReason {
	return {
		code: "EMPTY_BODY",
		severity: "error",
		explanation: `Le « ${what} » est à moitié formé (corps/cible vide ou rôle invalide) — un acte social n'est jamais à demi.`,
		howToFix: [
			"Fournissez une cible et un corps non vides.",
			"Pour un invite, un rôle valide (owner|editor|viewer).",
		],
	};
}

/**
 * authorize — the single deterministic gate. Refuses an unidentified actor, then
 * delegates to the S62 membership authority (the exact twin of the Go Authorize).
 */
export function authorize(actor: Actor, act: Act): Decision {
	if (!isIdentified(actor)) {
		return { verdict: "deny", blockReason: unidentifiedActor() };
	}
	const m = actor.role
		? {
				id: "",
				identity: actor.identity,
				projectId: actor.projectId,
				role: actor.role,
			}
		: null;
	const d = authorizeMembership(m, actor.projectId, requiredOp(act));
	if (d.verdict === "allow") return { verdict: "allow" };
	if (d.blockReason?.code === "NOT_A_MEMBER") {
		return { verdict: "deny", blockReason: notAMember(actor.projectId) };
	}
	return { verdict: "deny", blockReason: roleForbidden(act) };
}

/** canApprove — the named S110 gate: only an owner may approve a ChangeSet. */
export function canApprove(actor: Actor): boolean {
	return authorize(actor, "approve").verdict === "allow";
}

function hashBody(obj: Record<string, unknown>): string {
	// canonical JSON (keys sorted) — byte-identical to the Go records.Canonicalize.
	const sorted: Record<string, unknown> = {};
	for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
	return createHash("sha256")
		.update(Buffer.from(JSON.stringify(sorted), "utf8"))
		.digest("hex");
}

// ── comments ──

export type TargetKind = "idea" | "mirror" | "changeset";
export interface Comment {
	id: string;
	author: string;
	projectId: string;
	targetKind: TargetKind;
	targetId: string;
	body: string;
}

export function comment(
	actor: Actor,
	targetKind: TargetKind,
	targetId: string,
	body: string,
): { comment?: Comment; decision: Decision } {
	const d = authorize(actor, "comment");
	if (d.verdict !== "allow") return { decision: d };
	const tid = targetId.trim();
	const b = body.trim();
	const validKind =
		targetKind === "idea" ||
		targetKind === "mirror" ||
		targetKind === "changeset";
	if (!validKind || tid === "" || b === "") {
		return { decision: { verdict: "deny", blockReason: emptyBody("comment") } };
	}
	const id = hashBody({
		kind: "collab_comment",
		author: actor.identity,
		project_id: actor.projectId,
		target_kind: targetKind,
		target_id: tid,
		body: b,
	});
	return {
		comment: {
			id,
			author: actor.identity,
			projectId: actor.projectId,
			targetKind,
			targetId: tid,
			body: b,
		},
		decision: { verdict: "allow" },
	};
}

// ── invite ──

export interface Invite {
	id: string;
	inviter: string;
	invitee: string;
	projectId: string;
	role: Role;
}

export function invite(
	actor: Actor,
	invitee: string,
	role: Role,
): { invite?: Invite; decision: Decision } {
	const d = authorize(actor, "invite");
	if (d.verdict !== "allow") return { decision: d };
	const inv = invitee.trim();
	const validRole = role === "owner" || role === "editor" || role === "viewer";
	if (inv === "" || !validRole) {
		return { decision: { verdict: "deny", blockReason: emptyBody("invite") } };
	}
	const id = hashBody({
		kind: "collab_invite",
		inviter: actor.identity,
		invitee: inv,
		project_id: actor.projectId,
		role,
	});
	return {
		invite: {
			id,
			inviter: actor.identity,
			invitee: inv,
			projectId: actor.projectId,
			role,
		},
		decision: { verdict: "allow" },
	};
}

// ── activity feed ──

export interface FeedEntry {
	id: string;
	actor: string;
	projectId: string;
	act: Act;
	target: string;
	seq: number;
}

export function record(
	actor: Actor,
	act: Act,
	target: string,
	seq: number,
): { entry?: FeedEntry; decision: Decision } {
	if (!isIdentified(actor)) {
		return { decision: { verdict: "deny", blockReason: unidentifiedActor() } };
	}
	const t = target.trim();
	const id = hashBody({
		kind: "collab_feed_entry",
		actor: actor.identity,
		project_id: actor.projectId,
		act,
		target: t,
		seq,
	});
	return {
		entry: {
			id,
			actor: actor.identity,
			projectId: actor.projectId,
			act,
			target: t,
			seq,
		},
		decision: { verdict: "allow" },
	};
}

/** feed — the canonical activity-feed order (Seq asc, id tiebreak). PURE. */
export function feed(entries: FeedEntry[]): FeedEntry[] {
	return [...entries].sort((a, b) =>
		a.seq !== b.seq ? a.seq - b.seq : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	);
}

// ── presence & concurrent edit ──

export interface Presence {
	identity: string;
	projectId: string;
	canvasId: string;
}
export interface Canvas {
	canvasId: string;
	projectId: string;
	present: Presence[];
	lockHolder: string;
}

export function newCanvas(canvasId: string, projectId: string): Canvas {
	return { canvasId, projectId, present: [], lockHolder: "" };
}

/** join — ADDS a presence (never overwrites); deduped + sorted by identity. */
export function join(
	c: Canvas,
	actor: Actor,
): { canvas: Canvas; decision: Decision } {
	if (!isIdentified(actor)) {
		return {
			canvas: c,
			decision: { verdict: "deny", blockReason: unidentifiedActor() },
		};
	}
	const seen = new Set<string>();
	const present: Presence[] = [];
	for (const p of c.present) {
		if (seen.has(p.identity)) continue;
		seen.add(p.identity);
		present.push(p);
	}
	if (!seen.has(actor.identity)) {
		present.push({
			identity: actor.identity,
			projectId: c.projectId || actor.projectId,
			canvasId: c.canvasId,
		});
	}
	present.sort((a, b) =>
		a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0,
	);
	return {
		canvas: { ...c, present },
		decision: { verdict: "allow" },
	};
}

export function presentCount(c: Canvas): number {
	return c.present.length;
}
export function isPresent(c: Canvas, identity: string): boolean {
	return c.present.some((p) => p.identity === identity);
}

/** claimLock — explicit, recorded; NEVER silently steals a held lock. */
export function claimLock(
	c: Canvas,
	actor: Actor,
): { canvas: Canvas; decision: Decision } {
	if (!isIdentified(actor)) {
		return {
			canvas: c,
			decision: { verdict: "deny", blockReason: unidentifiedActor() },
		};
	}
	if (!isPresent(c, actor.identity)) {
		return {
			canvas: c,
			decision: {
				verdict: "deny",
				blockReason: {
					code: "ROLE_FORBIDDEN",
					severity: "error",
					explanation:
						"Vous devez être présent sur le canvas pour réclamer le verrou d'édition.",
					howToFix: ["Rejoignez le canvas (join) avant d'éditer."],
				},
			},
		};
	}
	if (c.lockHolder !== "" && c.lockHolder !== actor.identity) {
		return {
			canvas: c,
			decision: {
				verdict: "deny",
				blockReason: {
					code: "ROLE_FORBIDDEN",
					severity: "warning",
					explanation: `« ${c.lockHolder} » détient déjà le verrou d'édition — deux utilisateurs n'écrasent jamais le même canvas en silence.`,
					howToFix: [
						"Attendez que le détenteur relâche le verrou.",
						"Éditez une autre zone.",
					],
				},
			},
		};
	}
	return {
		canvas: { ...c, lockHolder: actor.identity },
		decision: { verdict: "allow" },
	};
}

export function releaseLock(c: Canvas, actor: Actor): Canvas {
	return c.lockHolder === actor.identity ? { ...c, lockHolder: "" } : c;
}

// ── per-project AdoptionStage ladder ──
// The ladder twin reuses the S47 adoption ladder shape. The five tiers + their
// requires/grants are the declared §82.5 mapping, byte-aligned with the Go specs.

export type AdoptionStage = "T0" | "T1" | "T2" | "T3" | "T4";
export const STAGES: readonly AdoptionStage[] = ["T0", "T1", "T2", "T3", "T4"];

const STAGE_REQUIRES: Record<AdoptionStage, string[]> = {
	T0: ["tests", "mutation"],
	T1: ["one-cell"],
	T2: ["kernel", "mirror", "reality-mirror-live"],
	T3: ["context-graph", "memory"],
	T4: ["evolve", "quality-diversity", "evolution-sandbox"],
};

export interface Gap {
	stage: AdoptionStage;
	missing: string;
	reason: string;
}
export interface ProjectStage {
	projectId: string;
	current: AdoptionStage | "";
	next: AdoptionStage | "";
	nextGaps: Gap[];
	allSatisfied: boolean;
}

/** stageFor — the per-project ladder (current + next dent). PURE twin of StageFor. */
export function stageFor(
	projectId: string,
	capabilities: string[],
): ProjectStage {
	const have = new Set(capabilities);
	let current: AdoptionStage | "" = "";
	let next: AdoptionStage | "" = "";
	let nextGaps: Gap[] = [];
	let allSat = true;
	let nextSet = false;
	for (const s of STAGES) {
		const gaps = STAGE_REQUIRES[s]
			.filter((c) => !have.has(c))
			.map((c) => ({ stage: s, missing: c, reason: `${s} requiert « ${c} »` }));
		if (gaps.length === 0) {
			if (!nextSet) current = s;
			continue;
		}
		allSat = false;
		if (!nextSet) {
			next = s;
			nextGaps = gaps;
			nextSet = true;
		}
	}
	return { projectId, current, next, nextGaps, allSatisfied: allSat };
}

/** canAdvance — true ONLY when the next dent's gate is reached. Done is computed. */
export function canAdvance(ps: ProjectStage): {
	ok: boolean;
	reason?: BlockReason;
} {
	if (ps.allSatisfied) return { ok: false };
	if (ps.nextGaps.length === 0) return { ok: true };
	return {
		ok: false,
		reason: {
			code: "STAGE_GATE_UNMET",
			severity: "info",
			explanation: `Le projet « ${ps.projectId} » ne peut pas avancer au palier « ${ps.next} » : la porte n'est pas atteinte (done is computed).`,
			howToFix: ps.nextGaps.map((g) => `${g.missing} — ${g.reason}`),
		},
	};
}
