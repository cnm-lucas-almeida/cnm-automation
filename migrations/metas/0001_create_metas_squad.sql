CREATE TABLE IF NOT EXISTS metas_squad (
  id SERIAL PRIMARY KEY,
  squad_id INTEGER NOT NULL UNIQUE,
  squad_nome VARCHAR(255) NOT NULL,
  segmento VARCHAR(20) NOT NULL CHECK (segmento IN ('imoveis', 'veiculos')),
  meta_estoque_dia INTEGER NOT NULL DEFAULT 0,
  meta_financeira_dia NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
