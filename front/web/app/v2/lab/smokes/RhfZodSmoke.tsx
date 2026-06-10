"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";

/**
 * WB2-01 sonde react-hook-form + zod — un formulaire validé qui monte client-only.
 * Prouve que le couple formulaire/validation (WB2-03 wizard idée) monte, valide, et build OK.
 * Zod déclare le schéma ; RHF le câble via une resolver maison minimale (pas de @hookform/resolvers).
 */
const schema = z.object({
	intent: z.string().min(3, "Au moins 3 caractères."),
});
type Form = z.infer<typeof schema>;

export default function RhfZodSmoke() {
	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isSubmitSuccessful },
	} = useForm<Form>({ defaultValues: { intent: "" } });

	const onSubmit = (data: Form) => {
		const parsed = schema.safeParse(data);
		if (!parsed.success) {
			setError("intent", {
				message: parsed.error.issues[0]?.message ?? "Invalide.",
			});
		}
	};

	return (
		<form
			data-testid="v2-smoke-rhf-zod"
			onSubmit={handleSubmit(onSubmit)}
			className="space-y-2 text-sm"
		>
			<input
				{...register("intent")}
				data-testid="v2-smoke-rhf-input"
				placeholder="intention…"
				className="w-full rounded-md border border-border bg-background px-2 py-1 text-foreground"
			/>
			<button
				type="submit"
				data-testid="v2-smoke-rhf-submit"
				className="rounded-md border border-border bg-card px-3 py-1.5 text-foreground hover:bg-primary/5 hover:text-primary"
			>
				Valider
			</button>
			{errors.intent ? (
				<p data-testid="v2-smoke-rhf-error" className="text-destructive">
					{errors.intent.message}
				</p>
			) : null}
			{isSubmitSuccessful && !errors.intent ? (
				<p data-testid="v2-smoke-rhf-ok" className="text-primary">
					Validé.
				</p>
			) : null}
		</form>
	);
}
