-- ROLLBACK (manual, NÃO é migration) de 20261125200000_insurance_coherence.sql.
-- ATENÇÃO: apaga termos por instrumento e justificativas de divergência (append-only). Faça backup antes
-- (pg_dump -t public.insurance_instrument_terms -t public.insurance_coherence_justifications).
-- insurance_draft_approve volta ao corpo de 20261122201000 (copie-o do arquivo original e execute), sem o portão de coerência.
drop function if exists public.insurance_coherence_justify(uuid, text, text, text, uuid);
drop function if exists public.insurance_coherence_check(uuid, uuid);
drop function if exists public.insurance_int_coherence(uuid, uuid);
drop function if exists public.insurance_instrument_terms_save(uuid, text, uuid, jsonb);
drop table if exists public.insurance_coherence_justifications;
drop table if exists public.insurance_instrument_terms;
drop function if exists public.f4b_party_equal(text, text, text, text);
drop function if exists public.f4b_tax_digits(text);
drop function if exists public.f4b_norm_text(text);
