#!/usr/bin/env bash
# ADR 0077 — REBUILD DÉTERMINISTE du binaire de déploiement aidospulumi.
#
# Le déploiement par projet exécute AIDOS_PULUMI_BIN (.deploy-pulumi/aidospulumi-bin).
# Determinism-first (§8) : le binaire DOIT être une fonction pure de ses sources
# (back/cmd/aidospulumi + ses deps honoemit/appdata/generators…). Sans rebuild, un
# changement d'émetteur (même specs) laisse tourner un binaire PÉRIMÉ — une faille de
# déterminisme (le « même source → même binaire » n'est plus garanti). Ce script
# recompile AVANT chaque déploiement ; `go build` est caché → quasi-instantané si rien
# n'a changé, recompile sinon. Il imprime le SHA-256 du binaire (l'empreinte de fraîcheur).
#
# Sortie : "OK <sha256>" sur succès (exit 0) ; "BUILD_FAILED" + l'erreur (exit 1) si les
# sources ne compilent pas — l'appelant NE DÉPLOIE PAS un binaire périmé dans ce cas.
set -uo pipefail

REPO="${AIDOS_REPO:-/data/dev/aidos}"
BIN="${AIDOS_PULUMI_BIN:-$REPO/.deploy-pulumi/aidospulumi-bin}"

mkdir -p "$(dirname "$BIN")"
if ! (cd "$REPO/back" && go build -o "$BIN" ./cmd/aidospulumi) 2> /tmp/aidospulumi-build.err; then
	echo "BUILD_FAILED"
	cat /tmp/aidospulumi-build.err >&2
	exit 1
fi
echo "OK $(sha256sum "$BIN" | cut -d' ' -f1)"
