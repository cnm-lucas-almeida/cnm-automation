CREATE TABLE IF NOT EXISTS quadro_comercial_historico_mensal (
  competencia DATE PRIMARY KEY,
  vendedores_imoveis INTEGER NOT NULL DEFAULT 0,
  vendedores_veiculos INTEGER NOT NULL DEFAULT 0,
  back_office_imoveis INTEGER NOT NULL DEFAULT 0,
  back_office_veiculos INTEGER NOT NULL DEFAULT 0,
  admitidos INTEGER,
  desligamentos INTEGER,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
