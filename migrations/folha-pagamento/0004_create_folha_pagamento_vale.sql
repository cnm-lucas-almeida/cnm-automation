CREATE TABLE IF NOT EXISTS folha_pagamento_vale (
  id SERIAL PRIMARY KEY,
  competencia TEXT NOT NULL,
  nome_normalizado TEXT NOT NULL,
  nome_original TEXT NOT NULL,
  categoria TEXT NOT NULL, -- 'clt' | 'estagiario' | 'aprendiz' (abas da planilha da empresa)
  valor_va NUMERIC(10, 2) NOT NULL DEFAULT 0,
  valor_vt NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competencia, nome_normalizado)
);
