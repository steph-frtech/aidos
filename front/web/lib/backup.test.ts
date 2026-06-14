import { describe, expect, it } from "vitest";
import {
	accessArtifact,
	artifactIsClean,
	BACKUP_SCHEDULE_AT,
	demoLeakingState,
	demoState,
	isBackupError,
	isolationToken,
	mintArtifact,
	realizeBackup,
	restoreBackup,
	stateEqual,
} from "./backup";

/**
 * DP31 — the backup twin mirror (the pure twin of the Go back/runtime/backup).
 * mirror record: reflects=DP31-backup, test_kind=property+fixture, cert_language=vitest, liveness=live
 *
 * Reproduces the four DP31 done-criteria as deterministic TS assertions over lib/backup,
 * the pure twin of RealizeBackup/RestoreBackup (horloge INJECTÉE côté twin) :
 *  (1) un backup PLANIFIÉ s'exécute (horloge injectée) et produit un artefact RESTAURABLE ;
 *  (2) une restauration ROUND-TRIP la donnée SANS PERTE (backup→restore ⇒ même donnée) ;
 *  (3) PROPERTY — le backup ne contient AUCUN secret en clair (scan déterministe S91) ;
 *  (4) isolation PAR PROJET (backup de A inaccessible depuis B, scope project_id).
 * + reproductibilité (même état + même horloge ⇒ même artefact).
 */

const BEFORE = "2026-06-08T08:00:00Z"; // avant l'échéance
const AT = BACKUP_SCHEDULE_AT; // à l'échéance
const AFTER = "2026-06-09T10:00:00Z"; // après l'échéance

describe("DP31 backup twin — (1) un backup planifié s'exécute sur une horloge injectée", () => {
	it("ne tire RIEN avant l'échéance (horloge injectée, jamais Date.now)", () => {
		const r = realizeBackup(demoState("proj-a"), BEFORE);
		expect(isBackupError(r)).toBe(false);
		if (isBackupError(r)) return;
		expect(r.fired).toBe(false);
		expect(r.artifact).toBeUndefined();
		expect(r.events).toHaveLength(0);
	});

	it("tire à/après l'échéance et produit un artefact RESTAURABLE content-addressed + un événement idempotent", () => {
		for (const now of [AT, AFTER]) {
			const r = realizeBackup(demoState("proj-a"), now);
			expect(isBackupError(r)).toBe(false);
			if (isBackupError(r)) return;
			expect(r.fired).toBe(true);
			expect(r.artifact).toBeDefined();
			expect(r.artifact?.contentAddress).toMatch(/^[0-9a-f]{64}$/);
			expect(r.events).toHaveLength(1);
			expect(r.events[0].kind).toBe("notification");
			expect(r.events[0].id).toMatch(/^[0-9a-f]{64}$/);
		}
	});
});

describe("DP31 backup twin — (2) restauration ROUND-TRIP sans perte", () => {
	it("backup→restore reconstruit EXACTEMENT l'état sauvegardé (stateEqual ⇒ aucune perte)", () => {
		const state = demoState("proj-a");
		const r = realizeBackup(state, AT);
		if (isBackupError(r) || !r.artifact) throw new Error("backup attendu");
		const out = restoreBackup(r.artifact);
		expect(isBackupError(out)).toBe(false);
		if (isBackupError(out)) return;
		expect(stateEqual(out.state, state)).toBe(true);
		// la décision de restauration est enregistrée, content-addressed (append-only §9).
		expect(out.decision.address).toMatch(/^[0-9a-f]{64}$/);
		expect(out.decision.artifactAddress).toBe(r.artifact.contentAddress);
	});

	it("la décision de restauration est IDEMPOTENTE (même artefact ⇒ même adresse de décision)", () => {
		const r = realizeBackup(demoState("proj-a"), AT);
		if (isBackupError(r) || !r.artifact) throw new Error("backup attendu");
		const a = restoreBackup(r.artifact);
		const b = restoreBackup(r.artifact);
		if (isBackupError(a) || isBackupError(b))
			throw new Error("restore attendu");
		expect(a.decision.address).toBe(b.decision.address);
	});
});

describe("DP31 backup twin — (3) PROPERTY : aucun secret en clair (scan déterministe S91)", () => {
	it("un état SANS secret scanne VERT et produit un artefact", () => {
		const r = realizeBackup(demoState("proj-a"), AT);
		expect(isBackupError(r)).toBe(false);
		if (isBackupError(r) || !r.artifact) return;
		expect(artifactIsClean(r.artifact)).toBe(true);
	});

	it("un état AVEC un secret en clair FAIL CLOSED (aucun artefact fuyant n'est jamais frappé)", () => {
		const r = realizeBackup(demoLeakingState("proj-a"), AT);
		expect(isBackupError(r)).toBe(true);
		if (!isBackupError(r)) return;
		expect(r.code).toBe("secret-in-clear");
	});

	it("la valeur de secret connue est aussi attrapée verbatim (le contrôle le plus fort)", () => {
		const secret = "supersecretpw-known-value-1234";
		const state = demoState("proj-a");
		state.volumes[0].bytes += `\ntoken=${secret}\n`;
		const r = realizeBackup(state, AT, [secret]);
		expect(isBackupError(r)).toBe(true);
		if (!isBackupError(r)) return;
		expect(r.code).toBe("secret-in-clear");
	});
});

describe("DP31 backup twin — (4) isolation PAR PROJET (scope project_id)", () => {
	it("un backup de A est INACCESSIBLE depuis B (cross-project refusé)", () => {
		const r = realizeBackup(demoState("proj-a"), AT);
		if (isBackupError(r) || !r.artifact) throw new Error("backup attendu");
		expect(accessArtifact(r.artifact, "proj-a")).toBeNull();
		const refused = accessArtifact(r.artifact, "proj-b");
		expect(refused).not.toBeNull();
		expect(refused?.code).toBe("cross-project");
	});

	it("deux projets distincts aux MÊMES octets ⇒ clés de stockage DISTINCTES (namespacing par token)", () => {
		const sa = demoState("proj-a");
		const sb = demoState("proj-b");
		// même payload de volumes/datastore, projet différent.
		sb.volumes = sa.volumes.map((v) => ({ ...v }));
		sb.datastore = { ...sa.datastore };
		const a = mintArtifact(sa);
		const b = mintArtifact(sb);
		expect(a.storageKey).not.toBe(b.storageKey);
		expect(isolationToken("proj-a")).not.toBe(isolationToken("proj-b"));
	});
});

describe("DP31 backup twin — reproductibilité (même état + même horloge ⇒ même artefact)", () => {
	it("la même planification deux fois frappe le MÊME content-address (×3)", () => {
		const state = demoState("proj-a");
		const addrs = new Set<string>();
		for (let i = 0; i < 3; i++) {
			const r = realizeBackup(state, AT);
			if (isBackupError(r) || !r.artifact) throw new Error("backup attendu");
			addrs.add(r.artifact.contentAddress);
		}
		expect(addrs.size).toBe(1);
	});

	it("rejette un moteur de datastore hors de l'ensemble fermé", () => {
		const state = demoState("proj-a");
		// @ts-expect-error — moteur volontairement invalide pour le test fail-closed.
		state.datastore.engine = "mysql";
		const r = realizeBackup(state, AT);
		expect(isBackupError(r)).toBe(true);
		if (!isBackupError(r)) return;
		expect(r.code).toBe("unknown-engine");
	});
});
