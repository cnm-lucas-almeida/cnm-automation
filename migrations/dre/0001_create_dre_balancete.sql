CREATE TABLE IF NOT EXISTS dre_balancete_linha (
  id SERIAL PRIMARY KEY,
  competencia DATE NOT NULL,
  conta_id INTEGER,
  classificacao VARCHAR(30) NOT NULL,
  tipo VARCHAR(1),
  nome VARCHAR(255) NOT NULL,
  saldo_anterior NUMERIC(14, 2) NOT NULL DEFAULT 0,
  debito NUMERIC(14, 2) NOT NULL DEFAULT 0,
  credito NUMERIC(14, 2) NOT NULL DEFAULT 0,
  saldo_atual NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competencia, classificacao)
);

CREATE INDEX IF NOT EXISTS idx_dre_balancete_classificacao ON dre_balancete_linha (classificacao);
