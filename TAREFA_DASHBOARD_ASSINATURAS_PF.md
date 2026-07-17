# 📊 Tarefa: Novo Relatório de Assinaturas PF (evoluir o `purchase_report_for_pf`)

## O que é

Hoje existe uma tela no admin (`chavesnamao_novo`) em `/admin/purchase_report_for_pf/` que lista as compras de plano/assinatura de clientes PF (pessoa física), com filtro de data/segmento/status e ações de **congelar/descongelar** cliente.

Prototipamos, no repo `Automacoes_CNM` (Next.js interno da equipe), uma versão nova desse relatório — com mais números e visualizações, sem as ações de congelar/descongelar — pra validar que dados e queries fazem sentido antes de implementar de vez. **Esta tarefa é levar esse resultado para o admin em PHP** (o dashboard real e definitivo é o do admin, o protótipo em Next.js foi só uma prova de conceito).

**Não precisa reproduzir o visual React/Tailwind pixel a pixel** — pode seguir o padrão visual já usado no admin PHP. O que importa é: os **dados e queries corretos**, e a **paridade de cores/semântica** descrita abaixo (verde = bom, âmbar = atenção, vermelho = crítico, etc.).

Protótipo de referência (comportamento, não visual): `Automacoes_CNM/src/lib/assinaturas/index.ts` (query + agregações), `Automacoes_CNM/src/app/api/assinaturas/route.ts` (API), `Automacoes_CNM/src/app/assinaturas/page.tsx` (UI/interações).

---

## O que muda em relação à tela atual

| Item | Tela atual (`purchase_report_for_pf`) | Novo relatório |
|---|---|---|
| Congelar/descongelar cliente | ✅ tem (botões na listagem) | ❌ **remover** — não faz parte deste relatório |
| Link do anúncio | ✅ tem | ✅ manter |
| KPIs (hoje, mês, período, ticket médio) | ❌ não tem | ✅ adicionar |
| Evolução diária/mensal | ❌ não tem | ✅ adicionar |
| Evolução por horário (média / dia específico) | ❌ não tem | ✅ adicionar |
| Padrão por dia da semana (comparação) | ❌ não tem | ✅ adicionar |
| Divisão de planos vendidos | ❌ não tem | ✅ adicionar |
| Breakdown por status / forma de pagamento | ❌ não tem | ✅ adicionar |
| Indicador de verificação antifraude + detalhe | parcial (mostra dados soltos na linha) | ✅ indicador + modal/detalhe |
| Paginação | ✅ tem (30/página) | ✅ manter (sugestão: 20/página) |
| Exportar CSV | ❌ não tem | ✅ adicionar |

---

## Fonte de dados

Banco `webserver` (MySQL/Aurora, produção), mesma conexão já usada pelo resto do admin.

### View principal: `vw_pf_purchase`

Colunas relevantes (já confirmadas em produção):

```
segment (VARCHAR — 'VEHICLE' ou 'REALTY')
subscription_id (INT)
is_subscription_active (INT unsigned)
created_at (TIMESTAMP)
customer_id (INT)
name, email, mobile (dados do cliente já embutidos na view)
address_neighborhood, address_city_id
suspended (INT)
plan_id, plan_name, plan_price
ad_id (INT — FK pra tb_veiculo.id ou tb_imovel.id conforme segment)
subscription_started_at, subscription_ended_at (DATE)
payment_method (ex: 'cartao', 'pix', 'boleto')
payed_at (DATETIME)
ad_status (VARCHAR — ver tabela de status abaixo)
```

### Query de referência (com os joins que já validamos)

```sql
SELECT
  vw.segment, vw.subscription_id, vw.is_subscription_active, vw.created_at, vw.customer_id,
  vw.name, vw.email, vw.mobile, vw.address_neighborhood, vw.suspended,
  vw.plan_id, vw.plan_name, vw.plan_price, vw.ad_id,
  vw.subscription_started_at, vw.subscription_ended_at, vw.payment_method, vw.payed_at, vw.ad_status,
  c.cpfcnpj, c.tipo_pessoa, c.congelado AS cliente_congelado, c.deleted AS cliente_deletado,
  cid.nome_cidade, uf.sigla_uf,
  far.reason, far.procob_info, far.other_customers_ids, far.other_ad_id,
  far.customer_ip AS fraude_ip, far.created_at AS fraude_reportada_em
FROM vw_pf_purchase vw
LEFT JOIN tb_cliente c ON c.id = vw.customer_id
LEFT JOIN tb_cidade cid ON cid.id = vw.address_city_id
LEFT JOIN tb_uf uf ON uf.id = cid.id_uf
LEFT JOIN fraud_ad_report far ON far.id = (
  SELECT MAX(f2.id) FROM fraud_ad_report f2 WHERE f2.ad_id = vw.ad_id
)
WHERE vw.created_at BETWEEN :dataInicial_00h AND :dataFinal_23h59
  [AND vw.segment = :segmento]
  [AND vw.ad_status = :status COLLATE utf8mb4_unicode_ci]  -- ver armadilha #2 abaixo
ORDER BY vw.created_at DESC
```

> O `LEFT JOIN fraud_ad_report` usa `MAX(id)` numa subquery porque um mesmo `ad_id` pode ter mais de um registro de verificação antifraude — sem isso a query duplica linhas.

### Link do anúncio

Não precisa montar a URL de SEO completa (marca/modelo/cidade/slug/título) — existe rota curinga no site que aceita qualquer coisa no lugar do slug e redireciona (301) pra URL certa:

- **Imóvel**: `https://www.chavesnamao.com.br/imovel/x/id-{ad_id}/`
- **Veículo**: `https://www.chavesnamao.com.br/veiculo/x/{ad_id}/`

---

## ⚠️ Armadilhas (já caímos nelas, evitem repetir)

1. **Fuso horário.** `created_at` é `TIMESTAMP` e a sessão do MySQL usa fuso `Brazil/East` — ou seja, o valor que vem do banco **já está correto em horário de Brasília**. O bug que tivemos foi ao agrupar por dia/hora/dia-da-semana em JS usando métodos UTC (`getUTC*`), o que jogava eventos de madrugada/fim de dia pro dia errado (ex: 12/07 21h virava 13/07 00h). **Se qualquer agregação por dia/hora/dia-da-semana for feita em código (PHP ou JS), use sempre o horário de Brasília, nunca UTC.** Se a agregação for feita direto em SQL (`DATE(created_at)`, `HOUR(created_at)`, `DAYOFWEEK(created_at)`), não tem esse problema — o MySQL já resolve certo porque a sessão está no fuso correto.

2. **Collation do `ad_status`.** A coluna `ad_status` da view está em collation `utf8mb4_0900_ai_ci`, diferente da collation da conexão (`utf8mb4_unicode_ci`). Comparar `WHERE vw.ad_status = ?` sem tratar isso dá erro `Illegal mix of collations`. Em SQL puro, resolver com `COLLATE utf8mb4_unicode_ci` no lado do parâmetro (ou usar a collation que a conexão do PHP realmente usa — confirmar qual é).

3. **`fraud_ad_report` não é "fraude confirmada".** É uma verificação automática de risco (integração Procob) que dispara por regra de negócio (ex: "valor do anúncio acima de R$ 1.000.000,00" — ver campo `reason`, é um JSON array de motivos). Na prática dispara pra quase toda assinatura de valor mais alto. **Chamar de "Verificação antifraude"**, nunca de "Fraude", e mostrar o(s) motivo(s) do disparo — não é uma bandeira vermelha de fraude confirmada.

4. **Forma de pagamento "BO".** Aparece nos dados com valor R$ 0,00 — não tem sentido de negócio nesse contexto. Excluir do breakdown de forma de pagamento qualquer método com valor total = 0.

5. **KPIs "hoje" / "este mês" precisam respeitar os filtros.** Se a tela tiver filtro de segmento/status, os cards fixos de "assinaturas hoje" e "assinaturas este mês" **também devem aplicar esse filtro** (bug que cometemos: eles ficavam soltos, sem filtro, e não batiam com o resto da tela ao trocar o segmento).

---

## Filtros da tela

| Filtro | Opções |
|---|---|
| Período | Hoje / Este mês / Mês passado / Este ano / Personalizado (data inicial/final) — padrão: mês corrente |
| Segmento | Todos / Imóvel (`REALTY`) / Veículo (`VEHICLE`) |
| Status do anúncio | Todos + os 7 abaixo |
| Busca | Nome, e-mail, CPF/CNPJ ou ID do anúncio |
| Checkbox | Somente com verificação antifraude |

### Status do anúncio (`ad_status` → label PT-BR → cor do badge)

| `ad_status` | Label | Cor do badge |
|---|---|---|
| `ACTIVE` | Ativo | verde (`--success` / fundo `--success-bg`) |
| `EXPIRED` | Expirado | cinza neutro |
| `REJECTED` | Rejeitado | vermelho (`--destructive`, fundo claro) |
| `UNDER_REVIEW` | Em revisão | âmbar (`--warning` / fundo `--warning-bg`) |
| `PENDING_APPROVAL` | Aguardando aprovação | âmbar |
| `PENDING_PAYMENT` | Aguardando pagamento | âmbar |
| `INACTIVE` | Inativo | cinza neutro |

---

## KPIs (topo da tela)

1. **Assinaturas hoje** — contagem + valor de hoje (independe do período navegado, mas respeita segmento/status)
2. **Assinaturas este mês** — idem, para o mês corrente
3. **Total no período** — contagem + valor do período selecionado nos filtros, com quebra imóveis/veículos
4. **Ticket médio** — valor total / total de assinaturas do período; mostra também quantas têm verificação antifraude

---

## Visualizações

1. **Evolução de assinaturas** (barras) — toggle por dia / por mês, clicável (clicar num dia abre o detalhe por horário daquele dia, item 2)
2. **Evolução por horário** (curva/linha) — toggle "Média do período" (24 horas, média de assinaturas por hora ao longo dos dias do período) / "Dia específico" (escolhe um dia e vê hora a hora)
3. **Padrão por dia da semana** (barras, Dom–Sáb) — média de assinaturas por dia da semana no período; permite selecionar 2+ dias pra comparar (ex: só Seg/Ter/Qua) com resumo da soma/média combinada
4. **Divisão de planos vendidos** (pizza/donut, ≤ 6-8 fatias) — % de cada plano (30/90/180 dias etc.) — **cor de cada plano fixa pela duração**, não pelo ranking de quantidade, pra não trocar de cor quando o filtro muda os números
5. **Por status do anúncio** — lista com barra de progresso (contagem + valor por status)
6. **Por forma de pagamento** — idem, excluindo métodos com valor zero (ver armadilha #4)
7. **Tabela paginada** (sugestão: 20/página) — colunas: data/hora, cliente (nome + e-mail + CPF/CNPJ), cidade/UF, plano, valor, forma de pagamento, status (badge), link do anúncio, indicador de verificação antifraude (abre modal com: motivo(s) do disparo, dados Procob — nome/documento/endereço —, IP, outros clientes/anúncios ligados)
8. **Exportar CSV** — exporta a lista filtrada (não só a página atual)

---

## Paleta de cores (reaproveitar os tokens/cores que já existem no admin quando possível)

| Uso | Cor | Hex |
|---|---|---|
| Barra do gráfico "Evolução de assinaturas" | vermelho (mesmo do `--destructive` do design system) | `#CA3500` |
| Barra do gráfico "Padrão por dia da semana" (estado padrão, sem seleção) | vermelho **claro** (salmão) — evita pesar o dashboard de vermelho | `#E49A7F` |
| Barra selecionada (destaque na comparação por dia da semana) | vermelho forte, igual ao da evolução | `#CA3500` |
| Status "Ativo" / indicadores positivos | verde | `#00A63E` (fundo claro `#DCFCE7`) |
| Verificação antifraude / status "em revisão"/"aguardando" | âmbar — **não usar vermelho aqui**, pra não parecer fraude confirmada | `#D08700` (fundo claro `#FEF9C2`) |
| Status "Rejeitado" | vermelho | `#CA3500` |
| Status neutro (expirado/inativo) | cinza | `#F6F5F5` fundo / `#6F686B` texto |
| Planos no donut (cor fixa por duração, na ordem: menor→maior duração) | azul, verde-água, amarelo, verde, violeta, vermelho, magenta, laranja | `#2a78d6`, `#1baf7a`, `#eda100`, `#008300`, `#4a3aa7`, `#e34948`, `#e87ba4`, `#eb6834` |

---

## Checklist de implementação

- [ ] Nova tela (ou evolução da atual) **sem** os botões de congelar/descongelar
- [ ] Query base com os joins acima (cliente, cidade/UF, verificação antifraude)
- [ ] Tratar collation do `ad_status` ao filtrar (armadilha #2)
- [ ] KPIs: hoje, este mês, total do período + valor, ticket médio — **todos respeitando os filtros de segmento/status**
- [ ] Gráfico evolução diária/mensal com toggle e clique pra abrir detalhe por horário
- [ ] Gráfico evolução por horário (média do período / dia específico)
- [ ] Gráfico padrão por dia da semana com seleção múltipla pra comparar
- [ ] Donut de divisão de planos (cor fixa por duração do plano)
- [ ] Breakdown por status do anúncio (com labels/cores da tabela acima)
- [ ] Breakdown por forma de pagamento (excluindo valor zero)
- [ ] Tabela paginada com link do anúncio e indicador + modal de verificação antifraude (chamar de "verificação antifraude", nunca "fraude")
- [ ] Exportar CSV (lista filtrada completa, não só a página atual)
- [ ] Filtros: período (com presets), segmento, status, busca, checkbox de verificação antifraude
- [ ] Conferir bucketing de dia/hora/dia-da-semana no fuso de Brasília (armadilha #1)
- [ ] Testar: trocar segmento/status e confirmar que os KPIs "hoje"/"este mês" também mudam

---

## Dúvidas / validação

Qualquer dúvida sobre os números (ex: por que tal contagem bate ou não com o relatório antigo), o protótipo em `Automacoes_CNM` pode ser rodado localmente pra comparar lado a lado antes de fechar a implementação.
