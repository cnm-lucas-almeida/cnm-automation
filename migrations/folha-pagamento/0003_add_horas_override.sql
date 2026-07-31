ALTER TABLE folha_pagamento_manual
  ADD COLUMN IF NOT EXISTS horas_positivas_override NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS horas_negativas_override NUMERIC(6, 2);
