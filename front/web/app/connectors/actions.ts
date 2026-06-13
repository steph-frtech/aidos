"use server";

import {
	type ProposeResult,
	proposeConnectorDeclaration,
} from "@/lib/connector-declare";
import type { ConnectorSource } from "@/lib/connector-source";

/**
 * /connectors Server Action (DP24, piste DP, CLÔT EPIC E — the connector cockpit). The cockpit's
 * « déclarer un connecteur » button calls this action, which PROPOSES a ChangeSet wrapping the
 * declared connector source — it NEVER applies it.
 *
 * THE WALL (CLAUDE.md §2): proposeConnectorDeclarationAction stages a PROPOSE only. The returned
 * ChangeSet is ALWAYS « proposed » (DRAFT, appliedAt null) — the agent has NO GRANT to write
 * truth; the real apply is the human's, through the aidos writer role (idée → miroir → /goal →
 * approbation), staged through the S58 gateway's below-the-line `changeset_open` door. This
 * action writes NO truth and consults NO truth-store.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): it delegates to the PURE twin proposeConnectorDeclaration
 * (the verdict-for-verdict mirror of the Go runtime/connectordeclare.ProposeConnectorDeclaration)
 * — same source ⇒ same proposed ChangeSet, no DB, no clock, no rng, NO LLM. The cockpit also
 * computes the proposal client-side via the same pure twin (so the verdict is identical whether
 * shown from the server action or recomputed on screen — the code is authoritative).
 */
export async function proposeConnectorDeclarationAction(
	source: ConnectorSource,
): Promise<ProposeResult> {
	return proposeConnectorDeclaration(source);
}
