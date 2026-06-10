"use client";

import { Tree } from "react-arborist";

/**
 * WB2-01 sonde react-arborist — un arbre minimal qui monte client-only.
 * Prouve que la lib d'arbre virtualisé (WB2-04 kernels/composes) monte + build OK.
 */
const DATA = [
	{
		id: "produit",
		name: "Produit",
		children: [
			{ id: "parcours", name: "Parcours" },
			{ id: "vue", name: "Vue" },
		],
	},
];

export default function ArboristSmoke() {
	return (
		<div data-testid="v2-smoke-arborist" className="text-sm text-foreground">
			<Tree
				initialData={DATA}
				openByDefault
				width={240}
				height={120}
				indent={16}
				rowHeight={28}
			>
				{({ node, style, dragHandle }) => (
					<div
						style={style}
						ref={dragHandle}
						className="cursor-default px-1 py-0.5 text-foreground"
					>
						{node.isOpen ? "▾ " : node.isLeaf ? "• " : "▸ "}
						{node.data.name}
					</div>
				)}
			</Tree>
		</div>
	);
}
