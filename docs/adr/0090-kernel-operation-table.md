# ADR 0090 — Déclarer la table `kernel.operation` (truth-store de l'AST Operation)

- **Statut :** proposed (à accepter + ENACTER par le rôle `aidos`, pas par l'agent — voir « Enactment »)
- **Date :** 2026-06-16
- **Contexte KRD :** S17/S31 OpenQuestion ; clôt la boucle d'autoring d'opération (ADR/feature OP-1·2·3, commits `53a3bda`·`02a351e`·`1feb69c`).
- **Le mur (CLAUDE.md §2) :** `back/migrations/` est AU-DESSUS de la ligne de flottaison (le mur le refuse à l'agent — preuve : `AGENT_WRITE_ABOVE_WATERLINE`). **Cet ADR DÉCLARE la décision + le DDL prêt ; il ne l'écrit pas dans `back/migrations/`. Seul le rôle `aidos` l'ENACTE** (l'agent propose, l'humain/`aidos` dispose).

## Contexte

L'OS sait, depuis OP-1/2/3, **autoriser** une opération (éditeur typé + miroir), la **proposer** (`idea_capture` → `ideas.idea` draft), et la **projeter** (`projectOps` → `EmitProjectServer` → routes Hono interpréteur-backed). Mais le maillon central manque : **`kernel.operation` n'est déclarée par AUCUNE migration**. Le schéma `kernel` n'a que `records/expr/policy/control/action/entity/links/composes/…` — pas `operation`. Conséquences :

- une opération approuvée via `/goal` n'a **aucune table où atterrir** (le `ChangeSet` n'a pas de cible) ;
- `ReadProjectOps` (`back/runtime/appdata/projectops_reader.go`) lit une table absente → erreur backend → repli sur l'ancre `createOrder` statique. Le seam est prêt mais **lit le vide**.

C'est l'OpenQuestion S17/S31 : la persistance Postgres de l'AST Operation, à back-filler (exception bootstrap, CLAUDE.md §6).

## Décision

Déclarer `kernel.operation` selon **exactement le même schéma content-addressé / append-only** que `kernel.control` / `kernel.action` (S11, `kernel_control_action_baseline.sql`) — jamais un chemin de hachage forké — **avec `project_id` dès l'origine** (convention post-S54 `project_scope_baseline.sql` : `project_id` est une colonne de SCOPE, pas une vérité ; l'agent n'y gagne aucune écriture). Le `body` JSONB encode l'AST `operation.Operation {Name, Input, Steps[], Emits[]}` + le bloc `Async` optionnel (`{Trigger, Effects[]}`).

## Le DDL prêt (à enacter par `aidos`, `back/migrations/kernel_operation_baseline.sql`)

```sql
-- S17/S31 (ADR 0090): kernel.operation AST table baseline. Expand-only, append-only.
-- MÊME schéma content-addressé que S02 records / S08 expr / S09 policy / S11 control·action
-- (jamais un hachage forké). project_id dès l'origine (convention post-S54). La table HOLD
-- la vérité ; l'agent y a SELECT only (le mur) ; seul `aidos` écrit, via un ChangeSet approuvé.
CREATE SCHEMA IF NOT EXISTS kernel;

CREATE TABLE IF NOT EXISTS kernel.operation (
    id            TEXT        NOT NULL,
    body          JSONB       NOT NULL,  -- l'AST operation.Operation + Async{Trigger,Effects[]} optionnel
    version       TEXT        NOT NULL,
    superseded_by TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    project_id    TEXT        NOT NULL DEFAULT '__system__',  -- colonne de scope (S54), pas une vérité
    CONSTRAINT operation_pkey PRIMARY KEY (id),
    -- L'invariant content-address, en base : version == id (le hash du body canonique).
    CONSTRAINT operation_content_addressed CHECK (version = id)
);

-- Rôles (guards si appliqué hors-ordre).
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aidos_agent') THEN CREATE ROLE aidos_agent NOLOGIN; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aidos')       THEN CREATE ROLE aidos       NOLOGIN; END IF; END $$;

-- LE MUR sur kernel.operation : l'agent LIT, n'écrit JAMAIS la vérité ici.
GRANT  USAGE  ON SCHEMA kernel    TO aidos_agent;
GRANT  SELECT ON kernel.operation TO aidos_agent;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.operation FROM aidos_agent;

-- Le rôle aidos : la seule porte de la vérité — écriture via un ChangeSet approuvé
-- (DELETE retenu : la vérité est append-only, jamais détruite).
GRANT USAGE                  ON SCHEMA kernel    TO aidos;
GRANT SELECT, INSERT, UPDATE ON kernel.operation TO aidos;
```

## Enactment (le mur — l'agent ne franchit pas)

1. L'agent a **préparé** cet ADR + le DDL (ici, en `docs/` — autorisé). Il **ne peut pas** écrire `back/migrations/` (le mur le refuse : `AGENT_WRITE_ABOVE_WATERLINE`).
2. Le rôle **`aidos`** matérialise `back/migrations/kernel_operation_baseline.sql` (copie du DDL ci-dessus) et l'applique via le processus truth-store (Atlas/`truth-store-apply.sh`, expand-contract). C'est l'acte humain/privilégié (le step S17/S31).
3. Dès la table en place, `ReadProjectOps` lit un vrai `kernel.operation` (vide → 0 op → CRUD), puis **se peuple par `/goal` → ChangeSet** : un humain approuve une opération proposée (OP-1/2) → la ligne atterrit → l'app du projet **porte sa route** (OP-3), sans une ligne de code de plus.

## Conséquences

- **+** la boucle d'autoring d'opération devient VIVANTE de bout en bout (le seul maillon restant — l'approbation `/goal` — est l'acte humain voulu).
- **+** `ReadProjectOps` ne lit plus le vide ; le repli sur l'ancre `createOrder` ne sert plus que de bootstrap (retiré quand des opérations réelles existent).
- **−** une table de vérité de plus à gouverner (RLS S55 à étendre à `kernel.operation` : keyée sur l'identité propagée — suit le même patron que les autres tables kernel).
- **mur inchangé** : `project_id` est du scope, pas de la vérité ; l'agent reste SELECT-only ; la vérité ne bouge que par ChangeSet.

## Alternatives écartées

- *Stocker l'opération hors-`kernel` (ex un schéma `app`)* : casserait l'uniformité du truth-store (un AST kernel est une vérité ; il vit dans `kernel`, content-addressé, append-only). Écarté.
- *L'agent écrit la migration directement* : **interdit par le mur** (`back/migrations/` au-dessus de la ligne). C'est précisément ce que le mur protège.
