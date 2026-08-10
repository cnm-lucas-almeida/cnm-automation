# 🐛 Divergências encontradas em `/admin/relatorio_vendas_vendedor/` (chavesnamao_novo)

> Documento de referência — **não é uma tarefa em execução**. Registra bugs/divergências achados ao investigar a fonte de dados da planilha "Estoque Semanal" (ver `Automacoes_CNM`, skill `relatorio-comercial`), pra corrigir no admin PHP num momento futuro, separado da criação do relatório novo aqui no Automacoes_CNM (que **não** vai replicar nenhum destes problemas).

**Localização no código**: `chavesnamao_novo/application/modules/admin/controllers/relatorio_vendas_vendedor.php` (ação `exportar_total` monta o Excel; ação `index` monta a tela) + `chavesnamao_novo/application/models/financeiro_contrato_model.php::listaVendasVendedor()`.

## 1. Congelamento usa a flag "foto atual" em vez do histórico correto

A query filtra `c.congelado = 0/1` (`tb_cliente.congelado`) pra decidir se uma venda está "ativa" ou "congelada". Essa flag é só o estado **atual** do cliente — não reflete o histórico por contrato. A fonte de verdade real é `tb_cliente_congelamento` (evento com `data_congelamento`/`data_descongelamento`, correlacionado por `id_contrato`), que é o que a tela `/admin/relatorio_congelamento` (e agora também o Automacoes_CNM, em `/vendas`) usa.

**Efeito prático**: um cliente pode ter sido congelado e descongelado várias vezes ao longo do tempo; a flag "foto atual" só reflete o estado de hoje, não o estado no momento em que o período do relatório foi analisado — pode sub ou sobre-contar "congeladas"/"ativas" de períodos passados.

## 2. Exclui contratos com PV ainda não assinado — confirmar se é intencional

```sql
AND NOT EXISTS (
    SELECT 1 FROM tb_gerencia_link_contrato glc
    WHERE glc.id_contrato = fc.id AND glc.deleted = 0 AND glc.status <> 3
)
```

Qualquer contrato que tenha um registro de link de assinatura (`tb_gerencia_link_contrato`) com status diferente de 3 (Assinado) é **excluído inteiramente** da contagem — mesmo que o contrato em si já exista em `tb_financeiro_contrato`. Não está claro se isso é intencional ("só conta venda com PV assinado") ou um resquício de outra regra de negócio que passou a excluir vendas legítimas por engano. Precisa confirmar com quem usa a tela hoje qual é a intenção original.

## 3. `valor_cancelado` provavelmente tem uma condição errada

```sql
SUM(CASE WHEN fc.cancelado = 1 AND c.congelado = 1 THEN fc.valor_mensalidade_original ELSE 0 END) valor_cancelado
```

Só soma no "valor cancelado" os contratos que estão **cancelados E congelados ao mesmo tempo** (`congelado=1`). Isso não faz sentido de negócio — um contrato cancelado devia contar como "valor cancelado" independente de estar ou não congelado. Suspeita forte de bug de copiar/colar de outra condição (compare com `congeladas`/`valor_congelado`, que também exigem `c.congelado = 1`, mas ali o cancelamento faz sentido estar excluído, não incluído). **Efeito prático**: `Valor Cancelado` no export provavelmente está subestimado — a maioria dos contratos cancelados não fica congelada antes de cancelar.

## 4. "Não Pagas" não é o inverso de "Pagas" nem de "Pendentes" — risco de confusão, não necessariamente bug

```sql
SUM(CASE WHEN fm.pago = 0 AND fm.data_vencimento < CURRENT_DATE() THEN 1 ELSE 0 END) nao_pago_a_primeira
-- ...
ativas - pagas pendentes
```

`Não Pagas` conta 1ª parcela vencida e não paga (recorte por vencimento). `Pendentes` é só `ativas - pagas` (recorte por status). Os dois números não são complementares e podem se sobrepor — quem lê a planilha sem saber disso pode somar as colunas esperando bater com o total e não bater (como aconteceu nesta investigação: 66+17+203=286 ≠ 271 vendas). Não é um bug de cálculo, mas é uma armadilha de leitura que vale documentar/renomear no admin pra menos confusão (ex.: "Não Pagas" → "1ª Parcela Vencida").

## 5. Filtro de departamento hardcoded como padrão

```php
if (empty($_GET["user_department_id"])) {
    $_GET["user_department_id"] = 1; // Departamento Comercial
}
```

Sem passar `user_department_id` na URL, a tela sempre filtra pro departamento "Comercial" (id 1) por padrão — não é bug, é comportamento intencional, mas fácil de esquecer ao comparar números "gerais" vindo de uma exportação sem esse parâmetro explícito.

---

*Nenhuma dessas divergências foi replicada no relatório novo do Automacoes_CNM — lá a fonte de congelamento é `tb_cliente_congelamento` (correta) e não há exclusão de PV pendente nem a condição de `valor_cancelado` acima.*
