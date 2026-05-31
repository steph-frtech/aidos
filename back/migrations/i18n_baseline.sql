-- i18n baseline (ADR 0011) — bilingue par défaut, français en repli.
-- Content/entity strings are translatable as DATA (key + locale → value), never
-- hardcoded. The French row is required and is the fallback. The Workbench truth-store
-- carries this schema; emitters add the same table to an emitted app's Doltgres store.
-- Append-only spirit: values are versioned via updated_at; no destructive overwrite of
-- the French source is expected (the agent role gets no UPDATE/DELETE grant on it).

CREATE SCHEMA IF NOT EXISTS i18n;

CREATE TABLE IF NOT EXISTS i18n.translation (
    key        text        NOT NULL,
    locale     text        NOT NULL CHECK (locale IN ('fr', 'en')),
    value      text        NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (key, locale)
);

-- Resolve a key in the requested locale, falling back to French (the default).
CREATE OR REPLACE FUNCTION i18n.t(p_key text, p_locale text DEFAULT 'fr')
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT value
    FROM (
        SELECT value, (locale = p_locale) AS exact
        FROM i18n.translation
        WHERE key = p_key AND locale IN (p_locale, 'fr')
    ) candidates
    ORDER BY exact DESC
    LIMIT 1;
$$;
