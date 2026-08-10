ALTER TABLE metas_squad
  ADD COLUMN mes_referencia DATE NOT NULL DEFAULT date_trunc('month', now())::date,
  ADD COLUMN meta_pv_dia INTEGER NOT NULL DEFAULT 0;

ALTER TABLE metas_squad DROP CONSTRAINT IF EXISTS metas_squad_squad_id_key;
ALTER TABLE metas_squad ADD CONSTRAINT metas_squad_squad_id_mes_referencia_key UNIQUE (squad_id, mes_referencia);
