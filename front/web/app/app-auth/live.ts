import {
	type Decision,
	isRole,
	type Policy,
	type Role,
} from "../../lib/app-auth";
import { arr, type Decoder, isObject, str } from "../../lib/gateway-sdk";

/**
 * /app-auth live reads — the decoders over the Go app-auth MCP tools' output (S80; the ADR 0092
 * batch-4A flip). Kept OUT of actions.ts (a Next "use server" module may only export async functions)
 * so the parity mirror (live.test.ts) can import the PURE decoders directly.
 *
 * NEVER DOUBLE-TYPED (the flip done-criterion): each decoder is the SINGLE runtime declaration of the
 * live wire shape; the static Decision / Policy are the front twin's types it fills. It pins the
 * decoders == the Go appauthsrv contract (checkOutput{allowed, role, required} ; attachOutput{target,
 * pieces, policies[{name,scope,operation,min_role,effect}], wrote_kernel, landed}), NOT a second
 * implementation of the auth logic (the Go appauth runtime is authoritative — check_access is a PURE
 * role→operation lookup, NEVER an LLM).
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia
 * falls back to the demo snapshot. THE WALL (§2): check_access/expand write NOTHING; attach lands via
 * an APPROVED ChangeSet (WroteKernel always false — the kernel freeze is the aidos CLI's job).
 */

function decodeRole(raw: unknown): Role | null {
	const s = str(raw);
	if (s === null || !isRole(s)) return null;
	return s;
}

/** checkDecoder decodes the Go `checkOutput` (allowed/role/required) into the front Decision. */
export const checkDecoder: Decoder<Decision> = (
	raw: unknown,
): Decision | null => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null; // an honesty error (unknown role/operation) → demo fallback.
	if (typeof raw.allowed !== "boolean") return null;
	const role = decodeRole(raw.role);
	const required = decodeRole(raw.required);
	if (role === null || required === null) return null;
	return { allowed: raw.allowed, role, required };
};

/** The attach preview the panel renders (the subsystem's pieces + the role-authz band). */
export interface AttachRead {
	target: string;
	macro: string;
	expansionId: string;
	pieces: string[];
	policies: Policy[];
	landed: boolean;
	wroteKernel: boolean;
}

function decodePolicy(raw: unknown): Policy | null {
	if (!isObject(raw)) return null;
	const name = str(raw.name);
	const scope = str(raw.scope);
	const operation = str(raw.operation);
	const minRole = decodeRole(raw.min_role);
	const effect = str(raw.effect);
	if (
		name === null ||
		scope === null ||
		operation === null ||
		minRole === null ||
		effect === null
	) {
		return null;
	}
	return { name, scope, operation, min_role: minRole, effect };
}

/** attachDecoder decodes the Go `attachOutput` (target/pieces/policies/landed/wrote_kernel). */
export const attachDecoder: Decoder<AttachRead> = (
	raw: unknown,
): AttachRead | null => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	const target = str(raw.target);
	if (target === null) return null;
	const pieces = arr(str)(raw.pieces);
	if (pieces === null) return null;
	const policies = arr(decodePolicy)(raw.policies ?? []);
	if (policies === null) return null;
	return {
		target,
		macro: str(raw.macro) ?? "app-auth",
		expansionId: str(raw.expansion_id) ?? "",
		pieces,
		policies,
		landed: raw.landed === true,
		wroteKernel: raw.wrote_kernel === true,
	};
};
