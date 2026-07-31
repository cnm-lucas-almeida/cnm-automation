ALTER TABLE folha_pagamento_manual
  ADD COLUMN IF NOT EXISTS falta_qtd_override INTEGER;
