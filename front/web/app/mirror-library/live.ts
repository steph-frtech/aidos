import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";
import type { Mirror } from "../../lib/mirror-health";
import type { AppMirrors } from "../../lib/mirror-library";

/**
 * /mirror-library live read — the decoder over the Go mirror-library `library_list_by_app` tool
 * output (S59 cutover, ADR 0092). Kept OUT of actions.ts (a Next "use server" module may only
 * export async functions) so the parity mirror (live.test.ts) can import the PURE decoder directly.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): `appsDecoder` is the SINGLE runtime declaration of
 * the live per-app listing shape; the static AppMirrors[] is the front twin's type the decoder
 * fills. The parity mirror pins the decoder == the Go `listByAppOutput` contract ({ ok, apps:
 * [{ project, mirrors:[Mirror], alive, dead }] }, the Mirror carrying snake_case fields mirror_id /
 * test_kind / cert_language / content_hash / reflects:{layer_id, version}), NOT a second
 * implementation of the grouping logic (the Go library.ListByApp is authoritative).
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia
 * falls back to the demo listing.
 */

/** decodeMirror decodes one Go `records.Mirror` (snake_case) into the front camelCase Mirror. */
function decodeMirror(raw: unknown): Mirror | null {
	if (!isObject(raw)) return null;
	const mirrorId = str(raw.mirror_id);
	const reflects = isObject(raw.reflects) ? raw.reflects : null;
	const testKind = str(raw.test_kind);
	const certLanguage = str(raw.cert_language);
	const authority = str(raw.authority);
	const liveness = str(raw.liveness);
	if (
		mirrorId === null ||
		reflects === null ||
		testKind === null ||
		certLanguage === null ||
		authority === null ||
		liveness === null
	) {
		return null;
	}
	const layerId = str(reflects.layer_id);
	const version = str(reflects.version);
	if (layerId === null || version === null) return null;
	if (authority !== "above" && authority !== "below") return null;
	if (liveness !== "alive" && liveness !== "dead") return null;
	// content_hash is advisory in the front Mirror; an absent hash decodes to "".
	const contentHash = str(raw.content_hash) ?? "";
	return {
		mirrorId,
		reflects: { layerId, version },
		testKind,
		certLanguage,
		authority,
		liveness,
		contentHash,
	};
}

/** decodeApp decodes one Go `appMirrorOut` into the front AppMirrors. */
function decodeApp(raw: unknown): AppMirrors | null {
	if (!isObject(raw)) return null;
	const project = str(raw.project);
	const alive = num(raw.alive);
	const dead = num(raw.dead);
	if (project === null || alive === null || dead === null) return null;
	const mirrors = arr(decodeMirror)(raw.mirrors ?? []);
	if (mirrors === null) return null;
	return { project, mirrors, alive, dead };
}

/**
 * appsDecoder decodes the Go `library_list_by_app` tool output ({ ok, apps }) into the front
 * AppMirrors[]. A missing `apps` list decodes to [] (an empty library); a malformed app row → null
 * (→ demo fallback).
 */
export const appsDecoder: Decoder<AppMirrors[]> = (raw) => {
	if (!isObject(raw)) return null;
	return arr(decodeApp)(raw.apps ?? []);
};
