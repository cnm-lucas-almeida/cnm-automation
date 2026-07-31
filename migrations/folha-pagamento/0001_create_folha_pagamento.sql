CREATE TABLE IF NOT EXISTS folha_pagamento_override_salario (
  id SERIAL PRIMARY KEY,
  cpf TEXT NOT NULL,
  nome TEXT NOT NULL,
  percentual NUMERIC(6, 4) NOT NULL,
  motivo TEXT NOT NULL,
  vigencia_inicio DATE NOT NULL,
  vigencia_fim DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_folha_override_salario_cpf ON folha_pagamento_override_salario (cpf);

CREATE TABLE IF NOT EXISTS folha_pagamento_dia_excecao (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL UNIQUE,
  motivo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS folha_pagamento_unimed_evento (
  id SERIAL PRIMARY KEY,
  competencia TEXT NOT NULL,
  nome_beneficiario TEXT NOT NULL,
  valor_eventos NUMERIC(14, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competencia, nome_beneficiario)
);

CREATE TABLE IF NOT EXISTS folha_pagamento_odonto_certificado (
  id SERIAL PRIMARY KEY,
  competencia TEXT NOT NULL,
  certificado TEXT NOT NULL,
  cpf_titular TEXT,
  nome_titular TEXT NOT NULL,
  dependentes_qtd INTEGER NOT NULL,
  valor_unitario NUMERIC(10, 2) NOT NULL DEFAULT 17.57,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competencia, certificado)
);

CREATE TABLE IF NOT EXISTS folha_pagamento_consignado (
  id SERIAL PRIMARY KEY,
  competencia TEXT NOT NULL,
  cpf TEXT NOT NULL,
  nome TEXT,
  valor_total NUMERIC(14, 2) NOT NULL,
  contratos_qtd INTEGER NOT NULL,
  detalhe JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competencia, cpf)
);

CREATE TABLE IF NOT EXISTS folha_pagamento_fechamento (
  id SERIAL PRIMARY KEY,
  competencia TEXT NOT NULL,
  cpf TEXT NOT NULL,
  dados JSONB NOT NULL,
  fechado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  fechado_por TEXT,
  UNIQUE (competencia, cpf)
);
