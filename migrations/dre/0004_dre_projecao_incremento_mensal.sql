ALTER TABLE dre_projecao_premissa DROP COLUMN IF EXISTS crescimento_receita_pct;
ALTER TABLE dre_projecao_premissa
  ADD COLUMN IF NOT EXISTS receita_incremento_mensal NUMERIC(14, 2)[] NOT NULL
    DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::NUMERIC(14,2)[];
