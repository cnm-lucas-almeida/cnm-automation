-- RH pode sobrescrever o valor da comissão de um colaborador no mês (pedido do
-- Lucas em 05/10/2026). Segue o padrão das horas e da falta: a chave existir
-- com valor = prevalece sobre o calculado; NULL = volta ao cálculo automático.
-- O DSR de comissão, Sal+Comissão e o valor da hora recalculam em cima do
-- valor editado.
ALTER TABLE folha_pagamento_manual
  ADD COLUMN IF NOT EXISTS comissao_override NUMERIC(14, 2);
