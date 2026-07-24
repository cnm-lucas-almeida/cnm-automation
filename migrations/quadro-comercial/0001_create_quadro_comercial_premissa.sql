CREATE TABLE IF NOT EXISTS quadro_comercial_premissa (
  ano INTEGER PRIMARY KEY,
  headcount_meta_imoveis INTEGER NOT NULL DEFAULT 120,
  headcount_meta_veiculos INTEGER NOT NULL DEFAULT 25,
  vendedores_por_supervisor_imoveis NUMERIC(6, 2) NOT NULL DEFAULT 25,
  vendedores_por_supervisor_veiculos NUMERIC(6, 2) NOT NULL DEFAULT 20,
  turnover_mensal_pct NUMERIC(6, 4) NOT NULL DEFAULT 0.141,
  custo_medio_vendedor NUMERIC(14, 2) NOT NULL DEFAULT 0,
  custo_medio_supervisor NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
