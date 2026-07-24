CREATE TABLE IF NOT EXISTS dre_projecao_premissa (
  ano INTEGER PRIMARY KEY,
  folha_salario NUMERIC(14, 2) NOT NULL DEFAULT 0,
  folha_fgts NUMERIC(14, 2) NOT NULL DEFAULT 0,
  folha_inss NUMERIC(14, 2) NOT NULL DEFAULT 0,
  folha_rat NUMERIC(14, 2) NOT NULL DEFAULT 0,
  folha_terceiros NUMERIC(14, 2) NOT NULL DEFAULT 0,
  folha_vr NUMERIC(14, 2) NOT NULL DEFAULT 0,
  propaganda_aumento_pct NUMERIC(7, 4) NOT NULL DEFAULT 0,
  crescimento_receita_pct NUMERIC(7, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
