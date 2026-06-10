"use client";

import dynamic from "next/dynamic";

/**
 * WB2-02 — le montage CLIENT-ONLY du schéma React Flow.
 *
 * React Flow touche le DOM (ResizeObserver) ; il ne doit pas rendre côté serveur. Next 16
 * interdit `dynamic(ssr:false)` dans un Server Component, on l'isole donc ici, dans un Client
 * Component, comme pour les sondes du banc /v2/lab. Code-split par route — n'alourdit pas le
 * First Load de /v2.
 */
const SchemaDiagram = dynamic(
	() => import("./SchemaDiagram").then((m) => m.SchemaDiagram),
	{ ssr: false },
);

export function SchemaDiagramMount() {
	return <SchemaDiagram />;
}
