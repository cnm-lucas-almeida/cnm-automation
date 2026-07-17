import { readFileSync } from 'fs';
import { Client } from 'pg';

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

// squad_id vem de crm_squad (MySQL admin), todos vertical_id = 1 (Imóveis),
// conforme mapeamento validado contra o print da planilha atual de metas.
const seed = [
  { squadId: 14, squadNome: 'IMOV - SQUAD BRASIL +500', segmento: 'imoveis', metaEstoqueDia: 500, metaFinanceiraDia: 995.0 },
  { squadId: 24, squadNome: 'IMOV - SQUAD SP ESTADO', segmento: 'imoveis', metaEstoqueDia: 200, metaFinanceiraDia: 752.0 },
  { squadId: 23, squadNome: 'IMOV - SQUAD SP CAPITAL', segmento: 'imoveis', metaEstoqueDia: 200, metaFinanceiraDia: 752.0 },
  { squadId: 12, squadNome: 'IMOV - SQUAD RJ/MG/ES', segmento: 'imoveis', metaEstoqueDia: 150, metaFinanceiraDia: 711.0 },
  { squadId: 20, squadNome: 'IMOV - SQUAD SUL', segmento: 'imoveis', metaEstoqueDia: 150, metaFinanceiraDia: 711.0 },
  { squadId: 27, squadNome: 'IMOV - SQUAD REATIVAÇÃO', segmento: 'imoveis', metaEstoqueDia: 250, metaFinanceiraDia: 793.0 },
  { squadId: 13, squadNome: 'IMOV - SQUAD NO/NE/CO', segmento: 'imoveis', metaEstoqueDia: 100, metaFinanceiraDia: 672.0 },
  { squadId: 37, squadNome: 'IMOV - SQUAD BRASIL 1º CICLO', segmento: 'imoveis', metaEstoqueDia: 100, metaFinanceiraDia: 672.0 },
];

const client = new Client({
  connectionString: env.METAS_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  for (const s of seed) {
    await client.query(
      `INSERT INTO metas_squad (squad_id, squad_nome, segmento, meta_estoque_dia, meta_financeira_dia)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (squad_id) DO UPDATE SET
         squad_nome = EXCLUDED.squad_nome,
         segmento = EXCLUDED.segmento,
         meta_estoque_dia = EXCLUDED.meta_estoque_dia,
         meta_financeira_dia = EXCLUDED.meta_financeira_dia,
         updated_at = now()`,
      [s.squadId, s.squadNome, s.segmento, s.metaEstoqueDia, s.metaFinanceiraDia]
    );
    console.log(`seed ok: ${s.squadNome}`);
  }
  console.log('Seed concluído.');
} finally {
  await client.end();
}
