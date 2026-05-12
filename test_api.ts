import { listarContasPagar } from './src/lib/omie';

async function test() {
  const codigo_cliente = 9149113584; // PROCOB
  
  const data = await listarContasPagar({
    filtrar_cliente: Number(codigo_cliente),
    filtrar_por_data_de: "01/01/2026",
    filtrar_por_data_ate: "31/12/2026"
  });

  console.log(JSON.stringify(data.conta_pagar_cadastro?.map((c:any) => ({
    codigo: c.codigo_lancamento_omie,
    venc: c.data_vencimento,
    prev: c.data_previsao,
    reg: c.info?.dInc
  })), null, 2));
}

test().catch(console.error);
