/**
 * WB2-26 — l'EXTRACTEUR : du TEXTE SOURCE au graphe de code, déterministiquement
 * (ADR 0056 — « pré-intégré dès la rédaction du code », l'esprit graphify).
 *
 * Le graphe de connaissance du code n'est JAMAIS déclaré à la main ni généré par un
 * LLM : il est EXTRAIT du source réel par un PARSEUR — l'API compilateur TypeScript,
 * déjà présente dans l'arbre (réutilisation ADR 0007 ; graphify utilise tree-sitter,
 * même principe : AST local, zéro appel réseau). Même texte → même graphe ; modifier
 * le corps d'une fonction change SA version content-adressée et celle-là seulement —
 * c'est ce qui rend l'invalidation fine (actionKey, Bazel) possible.
 *
 * DEUX CONFIANCES (graphify) : une arête d'appel résolue DANS le fichier est
 * `extracted` (prouvée par l'AST) ; une arête résolue INTER-fichiers via les imports
 * est `inferred` (la résolution de module est heuristique : relative, .ts/.tsx).
 *
 * DÉTERMINISME-FIRST (§6/§8) : extractFromSource est PURE (texte → données, zéro E/S ;
 * ts.createSourceFile est tolérant aux erreurs et ne jette pas) ; assembleGraph est
 * PURE (résolution de chemins relatifs sans fs — un import non résolu ne produit AUCUNE
 * arête pendante, fail-closed). La COLLECTE des fichiers (fs) reste la seule couche
 * impure, côté serveur (app/v2/code). Miroir : lib/v2/code-extract.test.ts.
 *
 * CLIENT-SAFE : ce module importe `typescript` — il ne doit JAMAIS être importé par un
 * composant client ; les écrans consomment le graphe sérialisé via l'action serveur.
 */

import ts from "typescript";
import type { CodeEdge, CodeNode } from "./code-graph";

/** Un import relevé dans un fichier : le module cité + les noms importés (ordre source). */
export interface ImportRecord {
	readonly module: string;
	readonly names: readonly string[];
}

/** Un appel vers un nom IMPORTÉ, à résoudre inter-fichiers à l'assemblage. */
export interface PendingCall {
	readonly fromId: string;
	readonly name: string;
	readonly module: string;
}

/** Le résultat d'extraction d'UN fichier (pur, autonome, assemblable). */
export interface ExtractedFile {
	readonly file: string;
	readonly symbols: readonly CodeNode[];
	readonly edges: readonly CodeEdge[];
	readonly imports: readonly ImportRecord[];
	readonly pendingCalls: readonly PendingCall[];
}

/** FNV-1a 32 bits (hex) — le schéma content-adressé commun aux twins V2. */
function fnv1a(canon: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < canon.length; i++) {
		h ^= canon.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/** Le span de lignes (1-based, inclusif) d'un nœud AST. */
function spanOf(
	sf: ts.SourceFile,
	node: ts.Node,
): { start: number; end: number } {
	const s = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
	const e = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
	return { start: s, end: e };
}

/**
 * EXTRAIT le graphe d'UN fichier depuis son texte — PURE & TOTALE & REPRODUCTIBLE.
 * Grains extraits : le fichier, les fonctions déclarées, les const fléchées, les
 * classes et leurs méthodes — chacun avec son span de lignes, sa version (hash du
 * texte du symbole) et sa contenance (méthode → classe → fichier). Les arêtes
 * d'appel INTRA-fichier sont prouvées (`extracted`) ; les appels vers des noms
 * importés sont mis en attente (résolus à l'assemblage, `inferred`).
 */
export function extractFromSource(
	filePath: string,
	sourceText: string,
): ExtractedFile {
	const sf = ts.createSourceFile(
		filePath,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
	);

	const fileNode: CodeNode = {
		id: fnv1a(filePath),
		kind: "file",
		name: filePath,
		file: filePath,
		span: {
			start: 1,
			end: sf.getLineAndCharacterOfPosition(sf.getEnd()).line + 1,
		},
		version: fnv1a(sourceText),
		parentId: null,
	};

	const symbols: CodeNode[] = [fileNode];
	const usedIds = new Set<string>([fileNode.id]);
	/** Le corps AST de chaque symbole, pour la passe d'appels (2 passes : déclarer puis lier). */
	const bodies: { id: string; node: ts.Node }[] = [];

	const makeId = (qualified: string, startLine: number): string => {
		let id = fnv1a(`${filePath}#${qualified}`);
		if (usedIds.has(id)) id = fnv1a(`${filePath}#${qualified}@L${startLine}`);
		usedIds.add(id);
		return id;
	};

	const addSymbol = (
		kind: CodeNode["kind"],
		name: string,
		qualified: string,
		node: ts.Node,
		parentId: string,
	): CodeNode => {
		const span = spanOf(sf, node);
		const sym: CodeNode = {
			id: makeId(qualified, span.start),
			kind,
			name,
			file: filePath,
			span,
			version: fnv1a(node.getText(sf)),
			parentId,
		};
		symbols.push(sym);
		bodies.push({ id: sym.id, node });
		return sym;
	};

	const imports: ImportRecord[] = [];
	const importedFrom = new Map<string, string>(); // nom importé → module

	// ── passe 1 : déclarer les symboles + relever les imports ──────────────────
	for (const st of sf.statements) {
		if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
			const module = st.moduleSpecifier.text;
			const names: string[] = [];
			const clause = st.importClause;
			if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
				for (const el of clause.namedBindings.elements) {
					names.push(el.name.text);
					importedFrom.set(el.name.text, module);
				}
			}
			if (names.length > 0) imports.push({ module, names });
		} else if (ts.isFunctionDeclaration(st) && st.name !== undefined) {
			addSymbol("function", st.name.text, st.name.text, st, fileNode.id);
		} else if (ts.isVariableStatement(st)) {
			for (const decl of st.declarationList.declarations) {
				if (
					ts.isIdentifier(decl.name) &&
					decl.initializer !== undefined &&
					(ts.isArrowFunction(decl.initializer) ||
						ts.isFunctionExpression(decl.initializer))
				) {
					addSymbol(
						"function",
						decl.name.text,
						decl.name.text,
						decl,
						fileNode.id,
					);
				}
			}
		} else if (ts.isClassDeclaration(st) && st.name !== undefined) {
			const cls = addSymbol(
				"class",
				st.name.text,
				st.name.text,
				st,
				fileNode.id,
			);
			for (const member of st.members) {
				if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
					addSymbol(
						"method",
						member.name.text,
						`${st.name.text}.${member.name.text}`,
						member,
						cls.id,
					);
				}
			}
		}
	}

	// ── passe 2 : lier les appels (locaux = extracted ; importés = en attente) ──
	const localByName = new Map<string, string>(); // nom → id (fonctions/consts top-level)
	for (const s of symbols)
		if (s.kind === "function") localByName.set(s.name, s.id);

	const edges: CodeEdge[] = [];
	const pendingCalls: PendingCall[] = [];
	const seenEdge = new Set<string>();
	const seenPending = new Set<string>();

	for (const { id: fromId, node } of bodies) {
		const visit = (n: ts.Node): void => {
			if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
				const callee = n.expression.text;
				const localId = localByName.get(callee);
				if (localId !== undefined && localId !== fromId) {
					const key = `${fromId}>${localId}`;
					if (!seenEdge.has(key)) {
						seenEdge.add(key);
						edges.push({
							from: fromId,
							to: localId,
							kind: "calls",
							confidence: "extracted",
						});
					}
				} else {
					const module = importedFrom.get(callee);
					if (module !== undefined) {
						const key = `${fromId}>${callee}@${module}`;
						if (!seenPending.has(key)) {
							seenPending.add(key);
							pendingCalls.push({ fromId, name: callee, module });
						}
					}
				}
			}
			ts.forEachChild(n, visit);
		};
		visit(node);
	}

	return { file: filePath, symbols, edges, imports, pendingCalls };
}

/** Normalise un chemin relatif (résout `./` et `../`) — pur, sans fs. */
function resolveRelative(fromFile: string, module: string): string {
	const dir = fromFile.split("/").slice(0, -1);
	const parts = module.split("/");
	const out = [...dir];
	for (const p of parts) {
		if (p === "." || p === "") continue;
		if (p === "..") out.pop();
		else out.push(p);
	}
	return out.join("/");
}

/**
 * ASSEMBLE le graphe inter-fichiers : concatène les extractions, puis résout chaque
 * appel en attente — le module relatif (`./util` → `src/util.ts|.tsx`) doit désigner
 * un fichier PRÉSENT et le nom un symbole de ce fichier, sinon l'appel est IGNORÉ
 * (fail-closed : jamais d'arête pendante). Les arêtes résolues sont `inferred`
 * (graphify : la résolution de module est heuristique, pas prouvée par l'AST).
 * PURE & TOTALE & REPRODUCTIBLE : mêmes fichiers → même graphe.
 */
export function assembleGraph(files: readonly ExtractedFile[]): {
	nodes: CodeNode[];
	edges: CodeEdge[];
} {
	const nodes: CodeNode[] = [];
	const edges: CodeEdge[] = [];
	const symbolByFileAndName = new Map<string, string>(); // "file#name" → id

	for (const f of files) {
		nodes.push(...f.symbols);
		edges.push(...f.edges);
		for (const s of f.symbols)
			if (s.kind !== "file")
				symbolByFileAndName.set(`${s.file}#${s.name}`, s.id);
	}

	const filesPresent = new Set(files.map((f) => f.file));
	const seen = new Set(edges.map((e) => `${e.from}>${e.to}`));

	for (const f of files) {
		for (const call of f.pendingCalls) {
			if (!call.module.startsWith(".")) continue; // un module externe (lib) — hors graphe
			const base = resolveRelative(f.file, call.module);
			const target = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(
				(c) => filesPresent.has(c),
			);
			if (target === undefined) continue; // fichier absent → AUCUNE arête (fail-closed)
			const toId = symbolByFileAndName.get(`${target}#${call.name}`);
			if (toId === undefined) continue;
			const key = `${call.fromId}>${toId}`;
			if (seen.has(key)) continue;
			seen.add(key);
			edges.push({
				from: call.fromId,
				to: toId,
				kind: "calls",
				confidence: "inferred",
			});
		}
	}

	return { nodes, edges };
}
