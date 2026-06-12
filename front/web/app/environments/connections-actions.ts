"use server";

import { hashDemoMatrix } from "@/lib/connections";
import type { MatrixMeasureView } from "./connections-view";

/**
 * Server Action for the DP07 extension of the /environments Workbench panel —
 * the connection-mode matrix (resolveConnection, lib/connections, the TS twin
 * byte-parity-pinned to the authoritative Go back/runtime/connresolve).
 *
 * THE GESTURE (ui-completeness, CLAUDE.md §7): « mesurer la matrice » re-runs
 * the WHOLE demo resolution matrix (every service × the five closed
 * environments) and re-measures its content address against the Go-pinned
 * seeded one — the reproducibility law, executable from the screen (measure
 * twice → same address).
 *
 * THE WALL (CLAUDE.md §2): a PURE MEASURE — it WRITES NOTHING. A
 * binding-truth or manifest change flows through propose → ChangeSet →
 * approval (DP09), never a direct write from the screen.
 */
export async function measureMatrixAction(
	_prev: MatrixMeasureView,
	formData: FormData,
): Promise<MatrixMeasureView> {
	const seededHash = String(formData.get("seededHash") ?? "");
	const hash = await hashDemoMatrix();
	return { measured: true, hash, sameAsSeeded: hash === seededHash };
}
