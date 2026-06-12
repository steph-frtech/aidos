import { redirect } from "next/navigation";

/** /v3 — la porte d'entrée V3 : tout commence dans l'AI Lab (le chat). */
export default function V3Index() {
	redirect("/v3/lab");
}
