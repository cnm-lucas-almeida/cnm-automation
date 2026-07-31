CREATE TABLE IF NOT EXISTS folha_pagamento_manual (
  id SERIAL PRIMARY KEY,
  competencia TEXT NOT NULL,
  cpf TEXT NOT NULL,
  observacoes TEXT,
  sitepd TEXT,
  vale_alimentacao NUMERIC(10, 2),
  vale_transporte NUMERIC(10, 2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competencia, cpf)
);
