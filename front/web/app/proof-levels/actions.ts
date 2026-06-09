"use server";

import {
	type CertLanguage,
	E_LEVELS,
	E_NAME,
	type ELevel,
	eHistogram,
	type MirrorIn,
	noLoss,
	relabel,
	type TestKind,
} from "@/lib/contracte";
import { defaultCorpus, VALID_CERTS, VALID_KINDS } from "./corpus";
import { type BasculeView, emptyBascule } from "./types";

/**
 * Server Actions for the /proof-levels Workbench panel (FK16 — la bascule E0-E7, contract half).
 *
 * THE STEP (ROADMAP-fke FK16, the LAST of the FK track): bascule mirrors/cert_language/panels/docs
 * to E0-E7; the legacy N-label is DEPRECATED via lifecycle, never deleted (append-only). The panel
 * flips from the N0-N5 ladder to the E0-E7 ladder, and is ACTION-CAPABLE (CLAUDE.md §7
 * ui-completeness): a RELABEL-THE-CORPUS control bound to the pure twin lib/contracte — feed a
 * sample N-typed corpus, throw the switch, and watch each mirror gain its derived E while keeping
 * (and deprecating, never deleting) its N. NoLoss is computed and shown ("zéro perte").
 *
 * THE WALL (§2): the action WRITES NOTHING — it derives the re-labelling. The real schema switch
 * (the evidence_level column, the n_lifecycle deprecation) is an expand-contract Postgres migration
 * applied by the privileged aidos role, gated by DataTruthScope. The N is preserved verbatim.
 */

/**
 * basculeAction is the action-capable control behind FK16 (CLAUDE.md §7 ui-completeness): it
 * re-labels the N-typed corpus to E0-E7 WITHOUT LOSS. Each mirror gains its derived E; the N is
 * preserved verbatim and its lifecycle flipped to Deprecated (never deleted). NoLoss is computed.
 * PURE, WRITES NOTHING (the schema switch is the gated migration).
 */
export async function basculeAction(
	_prev: BasculeView,
	formData: FormData,
): Promise<BasculeView> {
	const raw = String(formData.get("corpus") ?? "");
	let corpus: MirrorIn[];
	if (raw.trim() === "") {
		corpus = defaultCorpus();
	} else {
		try {
			const parsed = JSON.parse(raw) as MirrorIn[];
			if (!Array.isArray(parsed)) {
				return {
					...emptyBascule,
					error: "le corpus doit être un tableau JSON",
				};
			}
			corpus = parsed.map((m) => ({
				mirrorId: String(m.mirrorId ?? ""),
				testKind: String(m.testKind ?? ""),
				certLanguage: String(m.certLanguage ?? ""),
				n: String(m.n ?? ""),
			}));
		} catch {
			return { ...emptyBascule, error: "corpus JSON invalide" };
		}
	}

	// Validate kinds/certs are in the closed set (unknowns still re-label to E0, but we flag them).
	for (const m of corpus) {
		if (!VALID_KINDS.has(m.testKind as TestKind)) {
			return { ...emptyBascule, error: `test_kind inconnu : ${m.testKind}` };
		}
		if (!VALID_CERTS.has(m.certLanguage as CertLanguage)) {
			return {
				...emptyBascule,
				error: `cert_language inconnu : ${m.certLanguage}`,
			};
		}
	}

	const tags = relabel(corpus);
	const h = eHistogram(tags);

	return {
		ok: true,
		noLoss: noLoss(corpus, tags),
		tags: tags.map((t) => ({
			mirrorId: t.mirrorId,
			n: t.n,
			nLifecycle: t.nLifecycle,
			e: t.e,
			eName: t.eName,
		})),
		histogram: E_LEVELS.map((e: ELevel) => ({
			level: e,
			name: E_NAME[e],
			count: h[e],
		})),
	};
}
