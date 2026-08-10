ALTER TABLE cidade_foco DROP CONSTRAINT IF EXISTS cidade_foco_id_cidade_key;
ALTER TABLE cidade_foco ADD COLUMN IF NOT EXISTS categoria VARCHAR(50) NOT NULL DEFAULT 'FOCO';
ALTER TABLE cidade_foco ADD CONSTRAINT cidade_foco_id_cidade_categoria_key UNIQUE (id_cidade, categoria);
