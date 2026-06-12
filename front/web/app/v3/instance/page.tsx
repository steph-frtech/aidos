import { loadInstanceConfigAction } from "./actions";
import { InstanceClient } from "./InstanceClient";

/**
 * /v3/instance — L'INSTANCE (lentille V3, ADR 0062) : la page (serveur) ne fait que
 * CHARGER la config persistée (.aidos-instance.json, parse fail-closed du twin
 * lib/v3/instance) ; les tuiles, la sonde (au montage, jamais au rendu) et le
 * formulaire de réglages vivent dans InstanceClient.
 */
export default async function V3InstanceScreen() {
	const config = await loadInstanceConfigAction();
	return <InstanceClient initialConfig={config} />;
}
