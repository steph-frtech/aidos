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
