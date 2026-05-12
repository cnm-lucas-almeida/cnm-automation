import { listarContasPagar, listarClientesFornecedores } from './src/lib/omie';
async function test() {
  const cli = await listarClientesFornecedores(1, 50, 'PROCOB');
  const cod = cli.clientes_cadastro[0].codigo_cliente_omie;
  console.log('Cod:', cod);
  const data = await listarContasPagar({
    filtrar_cliente: cod,
  });
  console.log(JSON.stringify(data.conta_pagar_cadastro.map((c: any) => ({
    codigo: c.codigo_lancamento_omie,
    status: c.status_titulo,
    valor: c.valor_documento,
    venc: c.data_vencimento,
    prev: c.data_previsao
  })), null, 2));
}
test().catch(console.error);
