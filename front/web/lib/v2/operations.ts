/**
 * WB2-12 — le TWIN PUR des FIXTURES Operation DSL (S10) jouées comme une MACHINE : la forme N2 de
 * vérité d'un workflow est une fixture `état → commande → events` (KRD §24.3, §93). L'écran
 * /v2/operations/[op] la REND et l'EXÉCUTE comme une machine XState : on rejoue la fixture pas-à-pas,
 * on voit les events apparaître, et on visualise le graphe d'états (React Flow).
 *
 * Ce module tient la LOGIQUE PURE (déterminisme-first, CLAUDE.md §6/§8) — XState et React Flow ne sont
 * que du rendu/orchestration :
 *   - le REJEU pas-à-pas : `frames(fixture)` projette la fixture en une suite ORDONNÉE de frames
 *     `{ index, command, state, events, done }` — l'état d'avancement après chaque pas (chaque verbe
 *     de l'opération est une « commande » qui peut émettre un event). Rejouer = avancer dans les frames ;
 *   - le GRAPHE D'ÉTATS pour React Flow : `stateGraph(fixture)` projette les nœuds (états : idle → un
 *     par verbe → done|denied) et les arêtes (commandes), content-adressé déterministe.
 *
 * RÉUTILISATION (pas de fork, ADR 0007) : l'INTERPRÉTEUR de l'opération (les six verbes, le résolveur
 * $-selector, l'ancre §93 createOrder, le run déterministe) est CELUI de S10 — `lib/operation.ts`. Ce
 * module ne fait que le DÉROULER en frames rejouables + un graphe d'états. L'interpréteur reste pur :
 * mêmes (op, état, deps) → mêmes events (le miroir de reproductibilité l'épingle par property).
 *
 * LE MUR (CLAUDE.md §2) : rejouer une fixture n'écrit AUCUNE vérité — c'est une LECTURE du
 * comportement (un mutate atteint le monde via un Mutator mocké, sous la ligne de flottaison). L'écran
 * PROPOSE/affiche, il n'applique rien. Aucun LLM n'entre : le rejeu et le graphe sont du code pur.
 */

import {
	CREATE_ORDER,
	HAPPY_CART,
	HAPPY_STATE,
	type MockDeps,
	type Operation,
	run,
	type Step,
} from "../operation";

/** Le statut d'un nœud d'état du graphe (le cycle de vie d'un rejeu). */
export type OpStateKind = "idle" | "step" | "done" | "denied";

/**
 * Une FIXTURE Operation DSL (la forme N2 : état → commande → events), rejouable comme machine. Réutilise
 * l'`Operation` (l'AST des six verbes) + l'état initial + les deps mockées (S10). `id` est l'identité
 * lisible de la fixture (ex. "createOrder/happy"). `expectedEvents` est la liste d'events attendue (le
 * verdict de la fixture) — un rejeu PASSE ssi les events émis l'égalent dans l'ordre.
 */
export interface OperationFixture {
	readonly id: string;
	readonly op: Operation;
	/** L'état initial ($.input, $.auth…) du bag $-rooted. */
	readonly state: Record<string, unknown>;
	/** Les deps mockées (Authorizer/Reader…) que la fixture passe à chaque couture. */
	readonly deps: Pick<MockDeps, "authorizeAllow" | "cart">;
	/** La commande déclenchante (le nom + l'input), pour l'affichage « état → commande → events ». */
	readonly command: {
		readonly name: string;
		readonly input: Record<string, unknown>;
	};
	/** Les events attendus, dans l'ordre — le verdict de la fixture. */
	readonly expectedEvents: readonly string[];
}

/**
 * Une FRAME de rejeu : l'état d'avancement APRÈS avoir joué le pas `index` (−1 = avant tout pas, l'état
 * initial). `command` est l'étiquette du verbe joué à ce pas ; `events` est la liste CUMULÉE des events
 * émis jusqu'ici (dans l'ordre) ; `done` marque la dernière frame (l'opération terminée ou refusée).
 * Le rejeu pas-à-pas = avancer l'index dans la suite de frames.
 */
export interface ReplayFrame {
	/** Le rang du pas (−1 = état initial, avant le premier verbe ; 0..n−1 = après le verbe i). */
	readonly index: number;
	/** L'étiquette de la commande/verbe joué à ce pas (vide pour l'état initial). */
	readonly command: string;
	/** L'état (nœud) atteint après ce pas : idle | step | done | denied. */
	readonly kind: OpStateKind;
	/** Les events ÉMIS jusqu'ici (cumulés, ordonnés) — ce que la fixture fait voir. */
	readonly events: readonly string[];
	/** La dernière frame ? (l'opération est terminée ou refusée). */
	readonly done: boolean;
}

/** Une étiquette de verbe lisible (le « command » d'un pas), dérivée du Step — pure. */
function stepLabel(step: Step): string {
	switch (step.kind) {
		case "validate":
			return `validate ${step.schema}`;
		case "authorize":
			return `authorize ${step.policy}`;
		case "read":
			return `read ${step.entity} → ${step.as}`;
		case "mutate":
			return `mutate ${step.entity} ${step.op}`;
		case "return":
			return `return ${step.ref}`;
		default:
			// jeu CLOS (mirroir de operation.ts) : un verbe inconnu est un échec typé, jamais un saut muet.
			throw new Error(
				`operations: unknown step kind ${(step as { kind: string }).kind}`,
			);
	}
}

/**
 * `frames` PROJETTE une fixture en sa suite ORDONNÉE de frames rejouables — PURE & TOTALE & DÉTERMINISTE.
 * Elle DÉLÈGUE l'exécution à l'interpréteur S10 (`run`) pour la vérité des events (mêmes deps → mêmes
 * events), puis attribue à chaque verbe la liste cumulée d'events à ce point :
 *   - frame −1 : l'état initial (idle), aucun event ;
 *   - frame i : après le verbe i — `step` (ou `denied` si un authorize a refusé, `done` au dernier) ;
 *   - les events cumulés suivent l'ORDRE d'émission de l'interpréteur (mutate create → OrderCreated, …).
 * Un refus (authorize DENY) court-circuite : la frame du authorize est `denied` et c'est la dernière.
 * Aucun aléa, aucune horloge, aucun LLM — rejouer deux fois donne la MÊME suite de frames.
 */
export function frames(fixture: OperationFixture): ReplayFrame[] {
	// 1 · la VÉRITÉ des events : l'interpréteur S10 pur (mêmes commandes → mêmes events).
	const res = run(fixture.op, fixture.state, {
		authorizeAllow: fixture.deps.authorizeAllow,
		cart: fixture.deps.cart,
		calls: [],
	});

	const steps = fixture.op.steps;
	const out: ReplayFrame[] = [];

	// frame −1 : l'état initial.
	out.push({ index: -1, command: "", kind: "idle", events: [], done: false });

	// quel verbe émet quel event ? on rejoue l'ordre : chaque mutate consomme le prochain event émis.
	const emitted = res.events;
	let emittedCursor = 0;
	const cumulative: string[] = [];
	// si un authorize a refusé, on s'arrête à ce verbe (denied) — l'interpréteur n'émet rien après.
	const denied = res.denied;

	for (let i = 0; i < steps.length; i++) {
		const step = steps[i];
		// un mutate émet exactement un event (dans l'ordre de l'interpréteur).
		if (step.kind === "mutate" && emittedCursor < emitted.length) {
			cumulative.push(emitted[emittedCursor]);
			emittedCursor++;
		}
		const isAuthorizeDeny = denied && step.kind === "authorize";
		const isLast = isAuthorizeDeny || i === steps.length - 1;
		const kind: OpStateKind = isAuthorizeDeny
			? "denied"
			: isLast
				? "done"
				: "step";
		out.push({
			index: i,
			command: stepLabel(step),
			kind,
			events: [...cumulative],
			done: isLast,
		});
		if (isAuthorizeDeny) break; // court-circuit : plus aucun verbe ne joue.
	}

	return out;
}

/** Un nœud du graphe d'états (React Flow) : un état de la machine de rejeu. */
export interface StateNode {
	/** L'identité stable du nœud (content-adressée par sa position : "s-1", "s0", …). */
	readonly id: string;
	/** Le libellé affiché (le verbe, ou « init »/« done »/« denied »). */
	readonly label: string;
	/** Le type d'état (pour le style : idle | step | done | denied). */
	readonly kind: OpStateKind;
}

/** Une arête du graphe d'états : la commande qui fait passer d'un état au suivant. */
export interface StateEdge {
	readonly id: string;
	readonly source: string;
	readonly target: string;
	/** L'étiquette de la commande (le verbe joué) — ce qui déclenche la transition. */
	readonly label: string;
}

/** Le graphe d'états complet (nœuds + arêtes) — la projection que React Flow rend. */
export interface StateGraph {
	readonly nodes: readonly StateNode[];
	readonly edges: readonly StateEdge[];
}

/**
 * `stateGraph` PROJETTE la fixture en un GRAPHE D'ÉTATS pour React Flow — PURE & TOTALE & DÉTERMINISTE.
 * Les nœuds sont les frames de rejeu (idle → un par verbe → done|denied) ; les arêtes sont les commandes
 * (le verbe qui fait passer d'un état au suivant). L'identité d'un nœud est sa POSITION (content-adressée
 * "s<index>"), donc deux appels donnent le MÊME graphe (mêmes ids, même ordre). Aucun LLM.
 */
export function stateGraph(fixture: OperationFixture): StateGraph {
	const fs = frames(fixture);
	const nodes: StateNode[] = fs.map((f) => ({
		id: `s${f.index}`,
		label:
			f.kind === "idle"
				? "init"
				: f.kind === "done"
					? `done · ${f.command}`
					: f.kind === "denied"
						? `denied · ${f.command}`
						: f.command,
		kind: f.kind,
	}));
	const edges: StateEdge[] = [];
	for (let i = 1; i < fs.length; i++) {
		edges.push({
			id: `e${fs[i - 1].index}-${fs[i].index}`,
			source: `s${fs[i - 1].index}`,
			target: `s${fs[i].index}`,
			label: fs[i].command,
		});
	}
	return { nodes, edges };
}

/**
 * Le VERDICT d'un rejeu : les events émis (la dernière frame) égalent-ils, DANS L'ORDRE, les events
 * attendus de la fixture ? PURE & TOTALE. C'est le « PASS » de la fixture (la forme N2 prouve le
 * comportement). Calculé, jamais déclaré.
 */
export function verdict(fixture: OperationFixture): {
	readonly events: readonly string[];
	readonly pass: boolean;
} {
	const fs = frames(fixture);
	const events = fs[fs.length - 1].events;
	const pass =
		events.length === fixture.expectedEvents.length &&
		events.every((e, i) => e === fixture.expectedEvents[i]);
	return { events, pass };
}

// ── Les fixtures CANONIQUES (déterministes) — l'ancre §93 createOrder ─────────

/**
 * La fixture createOrder/happy (le chemin heureux §93) : compte authentifié, panier à deux articles
 * → events [OrderCreated, CartCleared]. Réutilise l'ancre + l'état + le panier de S10 (lib/operation).
 */
export const CREATE_ORDER_HAPPY: OperationFixture = {
	id: "createOrder/happy",
	op: CREATE_ORDER,
	state: HAPPY_STATE,
	deps: { authorizeAllow: true, cart: HAPPY_CART },
	command: { name: "createOrder", input: { cartId: "c1" } },
	expectedEvents: ["OrderCreated", "CartCleared"],
};

/**
 * La fixture createOrder/denied : l'autorisation REFUSE (canPlaceOrder DENY) → court-circuit, AUCUN
 * event, AUCUN mutate (la §93 « tout DENY bloque » à la frontière de l'opération). Même op, même état ;
 * seul `authorizeAllow=false` change — la fixture prouve le refus.
 */
export const CREATE_ORDER_DENIED: OperationFixture = {
	id: "createOrder/denied",
	op: CREATE_ORDER,
	state: HAPPY_STATE,
	deps: { authorizeAllow: false, cart: HAPPY_CART },
	command: { name: "createOrder", input: { cartId: "c1" } },
	expectedEvents: [],
};

/** Le registre CLOS des fixtures connues (par id). L'écran [op] résout son op contre lui (totalité). */
export const FIXTURES: Record<string, OperationFixture> = {
	[CREATE_ORDER_HAPPY.id]: CREATE_ORDER_HAPPY,
	[CREATE_ORDER_DENIED.id]: CREATE_ORDER_DENIED,
};

/**
 * Résout le slug de route [op] vers une fixture. Le slug est l'id avec « / » remplacé par « -- » (un
 * « / » casse le segment de route). Ex. "createOrder--happy" → la fixture "createOrder/happy". Renvoie
 * undefined pour un slug inconnu (totalité : seules les fixtures déclarées existent → 404 côté écran).
 */
export function fixtureBySlug(slug: string): OperationFixture | undefined {
	const id = slug.replaceAll("--", "/");
	return FIXTURES[id];
}

/** Le slug de route d'une fixture (l'inverse de `fixtureBySlug`) — "createOrder/happy" → "createOrder--happy". */
export function fixtureSlug(id: string): string {
	return id.replaceAll("/", "--");
}

/** Les slugs de toutes les fixtures (pour generateStaticParams + la liste). */
export function fixtureSlugs(): string[] {
	return Object.keys(FIXTURES).map(fixtureSlug);
}

/** Le slug d'étape canonique de WB2-12 (pour la seed de doc de l'écran). */
export const STEP_SLUG = "wb2-12-operations";
