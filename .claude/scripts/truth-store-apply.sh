#!/usr/bin/env bash
# ADR 0073 — applique les baselines du truth-store (back/migrations/*_baseline.sql) à une
# base Postgres, en ORDRE de dépendances, idempotent (IF NOT EXISTS), multi-passes.
#
# Les baselines sont expand-only/append-only (jamais d'ALTER/DROP destructif). kernel_records
# crée la plupart des schémas (kernel/ideas/changesets/dag/mirrors/…) → il passe TÔT ; les
# baselines lifecycle/extension qui les RÉUTILISENT passent après. L'idempotence permet
# plusieurs passes : l'ordre se résout en re-jouant les fichiers en échec.
#
# Usage : DB=aidos_validate bash truth-store-apply.sh          (valide sur une base jetable)
#         DB=aidos          bash truth-store-apply.sh --live   (applique à la vérité vivante)
# Cible le conteneur supabase-db (rôle postgres). NE LANCE PAS sans --live sur DB=aidos.
set -uo pipefail

REPO="${AIDOS_REPO:-/data/dev/aidos}"
MIG="$REPO/back/migrations"
DB="${DB:-aidos_validate}"
CTR="${AIDOS_PG_CONTAINER:-supabase-db}"
LIVE="${1:-}"

if [ "$DB" = "aidos" ] && [ "$LIVE" != "--live" ]; then
	echo "✗ refus : DB=aidos sans --live (la base de vérité vivante). Valide d'abord sur aidos_validate."; exit 1
fi

psql() { docker exec -i "$CTR" psql -v ON_ERROR_STOP=1 -U postgres "$@"; }

# ── roles (les GRANTs des baselines les référencent) ──────────────────────────────────
echo "▶ ensure roles (aidos, aidos_agent, aidos_scheduler)"
docker exec -i "$CTR" psql -U postgres -d postgres <<'SQL' 2>&1 | grep -iE 'error|created' || true
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aidos') THEN CREATE ROLE aidos LOGIN PASSWORD 'aidos'; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aidos_agent') THEN CREATE ROLE aidos_agent LOGIN PASSWORD 'aidos_agent'; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aidos_scheduler') THEN CREATE ROLE aidos_scheduler LOGIN PASSWORD 'aidos_scheduler'; END IF;
END $$;
SQL

# ── ensure the target db exists ───────────────────────────────────────────────────────
if ! docker exec -i "$CTR" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
	echo "▶ create db $DB"; docker exec -i "$CTR" psql -U postgres -c "CREATE DATABASE $DB OWNER aidos;" 2>&1 | grep -iE 'error|create' || true
fi

# ── apply order: known-first, then the rest, multi-pass (idempotent) ──────────────────
FIRST="archive kernel_records wall_grants"
mapfile -t ALL < <(cd "$MIG" && ls -1 *_baseline.sql | sed 's/_baseline.sql$//')
ordered=()
for f in $FIRST; do ordered+=("$f"); done
for f in "${ALL[@]}"; do case " $FIRST " in *" $f "*) ;; *) ordered+=("$f");; esac; done

PASSES="${PASSES:-3}"
for pass in $(seq 1 "$PASSES"); do
	echo "═══ PASS $pass/$PASSES (db=$DB) ═══"
	fails=0
	for f in "${ordered[@]}"; do
		out=$(docker exec -i "$CTR" psql -v ON_ERROR_STOP=1 -U postgres -d "$DB" < "$MIG/$f"_baseline.sql 2>&1)
		if [ $? -ne 0 ]; then
			fails=$((fails+1))
			[ "$pass" = "$PASSES" ] && echo "  ✗ $f: $(printf '%s' "$out" | grep -iE 'ERROR' | head -1)"
		fi
	done
	echo "  pass $pass: $fails fichiers en échec"
	[ "$fails" -eq 0 ] && break
done

# ── report what exists ────────────────────────────────────────────────────────────────
echo "▶ schémas dans $DB :"
docker exec -i "$CTR" psql -U postgres -d "$DB" -tAc "select string_agg(nspname,', ' order by nspname) from pg_namespace where nspname not like 'pg_%' and nspname<>'information_schema';"
echo "▶ # tables par schéma de vérité :"
docker exec -i "$CTR" psql -U postgres -d "$DB" -tAc "select table_schema, count(*) from information_schema.tables where table_schema in ('kernel','mirrors','ideas','changesets','dag','brain','context','runtime','projects','archive','provenance','fitness') group by 1 order by 1;"
