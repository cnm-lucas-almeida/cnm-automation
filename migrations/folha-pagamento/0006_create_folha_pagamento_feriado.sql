-- Feriados cadastrados pelo RH além dos nacionais (municipais, pontes
-- oficiais). Entram como "dia de descanso" no DSR de comissão e de hora extra:
-- o divisor passa a ser (dias do mês - domingos - feriados).
--
-- Caso que motivou (05/10/2026, fechamento de setembro): o sistema calculou
-- ÷25×5 e o RH esperava ÷24×6 — a diferença era o 08/09, feriado municipal de
-- Curitiba (Nossa Senhora da Luz dos Pinhais), que não existe na lista nacional.
CREATE TABLE IF NOT EXISTS folha_pagamento_feriado (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO folha_pagamento_feriado (data, descricao)
VALUES ('2026-09-08', 'Nossa Senhora da Luz dos Pinhais (feriado municipal de Curitiba)')
ON CONFLICT (data) DO NOTHING;
