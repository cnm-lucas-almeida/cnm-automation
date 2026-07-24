CREATE TABLE IF NOT EXISTS dre_provisao_ir_csll (
  competencia DATE PRIMARY KEY,
  irpj NUMERIC(14, 2) NOT NULL DEFAULT 0,
  csll NUMERIC(14, 2) NOT NULL DEFAULT 0,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
