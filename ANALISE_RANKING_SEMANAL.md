# 🏁 Ranking Semanal — Requisitos (Fase 1: colunas A→U)

> Documento de requisitos self-contained — qualquer agente/pessoa deve conseguir entender o que construir e por quê só lendo este arquivo, sem precisar reabrir a planilha ou o PDF originais. Segue o fluxo da skill `novo-relatorio`: **análise → plano de produto → aprovação → só então código.** Nada foi implementado ainda.
>
> Ver também a skill `relatorio-comercial` (`.claude/skills/relatorio-comercial/`) — este relatório é o "relatório principal" que consome praticamente todos os outros relatórios comerciais já construídos (`/fila-leads`, `/estoque-semanal`, `/inside-sales-306090`, `metas_squad`).

## 1. O que é

A Chaves na Mão roda uma **campanha de gamificação semanal** pro time de Inside Sales (Imóveis): cada vendedor(a) acumula pontos por vendas de qualidade, ritmo de estoque/financeiro, tempo falado e disciplina operacional. A pontuação total define em qual "tier" (ELITE/ALTA PERFORMANCE/PERFORMANCE/STANDARD/NÃO APTO) a pessoa fica, e o tier decide quantas filas de distribuição de leads ela recebe na semana seguinte. Regras completas em `docs/Comercial/CAMPANHA_GAMIFICADA_SEMANAL_CHAVES_NA_MAO_31_JULHO_2026_IMOVEL (2).pdf` (resumidas na seção 6 abaixo).

Hoje essa apuração é feita numa planilha manual: `docs/Comercial/IMÓVEIS - MÉTRICAS TIME DE IS 2026 (2).xlsx`, aba **"RANKING SEMANAL"**. Essa aba, por sua vez, importa dados de **outras 3 fontes** via `IMPORTRANGE` do Google Sheets (ver seção 3) — e é exatamente por isso que este relatório é "o grande consumidor": quase tudo que já construímos no domínio Comercial nesta sessão foi, sem sabermos no início, pensado pra alimentar isso.

## 2. Período de apuração — ATENÇÃO, é diferente de todos os outros relatórios

> **Sexta-feira anterior até quinta-feira (7 dias), não Segunda-Domingo.**

Confirmado nos dois lados:
- PDF, seção 1: *"As pontuações serão consolidadas toda sexta-feira, considerando o período de sexta anterior até quinta-feira."*
- Planilha real: células `BB10`/`BB11` da aba RANKING SEMANAL contêm `31/07/2026` (uma sexta-feira) e `06/08/2026` (uma quinta-feira) — e o PDF se chama "SEMANA 31/07/2026".

Todos os outros relatórios do domínio (`/vendas`, `/estoque-semanal`, `/vendas-dia-a-dia`) usam presets Seg-Dom ou mês corrente — **este é o primeiro que precisa do preset Sexta→Quinta**. Se for reaproveitar `getVendasData`/`getEstoqueSemanalData` (que já aceitam `dataInicial`/`dataFinal` livres), isso é só uma questão de calcular o range certo no preset da tela, não uma mudança na lib.

## 3. De onde vem cada fonte (mapa de dependência)

```
RANKING SEMANAL (aba na planilha "IMÓVEIS - MÉTRICAS TIME DE IS 2026")
├─ colunas A-D  ← aba "IS 306090 HEADCOUNT" (mesma planilha, tabela nomeada IS_306090_HEADCOUNT)
│                  = hoje colado à mão; JÁ TEMOS ISSO PRONTO em /inside-sales-306090
│                  (achado do gap analysis anterior, ver memória project_ranking_semanal_gap_analysis)
│
├─ colunas E,G,I,K,M ← planilha externa "BASE DIÁRIA FILA DE LEADS" (Google Sheets, IMPORTRANGE)
│                       coluna com o texto do Tipo Base ("BASE -20"/"BASE 30+"/"BASE FOCO -100"/
│                       "BASE FOCO +100"/"TOP 20") + nome do vendedor + data de assinatura
│                       = EXATAMENTE o que /fila-leads calcula hoje (campo `tipoBase`)
│
├─ colunas P, S ← planilha externa "ESTOQUE SEMANAL" (outra chave de planilha, mesma família)
│                  P = soma da coluna "Qtd Anun" (Col19) filtrada por vendedor
│                  S = soma da coluna "Valor Total Ativas" (Col10) filtrada por vendedor
│                  = EXATAMENTE os campos `qtdAnuncios` e `valorTotalAtivas` de /estoque-semanal
│
├─ colunas Q,R,T,U ← aba "METAS SQUADS" (mesma planilha externa do Estoque Semanal)
│                     meta semanal de estoque/financeiro POR SQUAD (não por vendedor — ver seção 5, pergunta 2)
│                     = equivalente ao nosso `metas_squad` (Postgres/Neon), só falta 1 campo (seção 7)
│
└─ colunas V em diante ← abas "LIGAÇÕES", "FILA DO LEAD CONG/CANC", "IS PAINEL [MÊS]"
                          = dependem do crm-internal (tabelas `calls`, `deals`, `deal_flags`) —
                          NÃO TEMOS essa integração ainda (ver reference_crm_internal_novo_sistema).
                          É por isso que o usuário está certo: dá pra construir até a coluna U.
```

## 4. Mapeamento coluna a coluna (A → U)

| Col | Cabeçalho na planilha | O que é | Fonte no Automacoes_CNM | Fórmula/regra |
|---|---|---|---|---|
| A | IS | Nome do vendedor | `/inside-sales-306090` (roster) | — |
| B | SQUAD | Squad atual do vendedor | `/inside-sales-306090` | — |
| C | CICLO | 1°/2°/V | `/inside-sales-306090` (mesma função `calcularCiclo` de `@/lib/inside-sales`) | — |
| D | SUPERVISOR | Supervisor atual | `/inside-sales-306090` | — |
| E | BASE -20 | Qtd vendas Tipo Base = "BASE -20" na semana | `/fila-leads` (`tipoBase`), contado por vendedor | `COUNTIF(tipoBase = 'BASE -20')` |
| F | PONTOS | Pontos da coluna E | Fórmula fixa | `E * 1` |
| G | BASE +30 | Qtd vendas Tipo Base = "BASE 30+" | `/fila-leads` | `COUNTIF(tipoBase = 'BASE 30+')` |
| H | PONTOS 2 | Pontos da coluna G | Fórmula fixa | `G * 3` |
| I | BASE&FOCO -100 | Qtd vendas Tipo Base = "BASE FOCO -100" | `/fila-leads` | `COUNTIF(tipoBase = 'BASE FOCO -100')` |
| J | PONTOS 3 | Pontos da coluna I | Fórmula fixa | `I * 5` |
| K | BASE+FOCO +100 | Qtd vendas Tipo Base = "BASE FOCO +100" | `/fila-leads` | `COUNTIF(tipoBase = 'BASE FOCO +100')` |
| L | PONTOS 4 | Pontos da coluna K | Fórmula fixa | `K * 8` |
| M | BASE 20+ | Qtd vendas Tipo Base = "TOP 20" | `/fila-leads` | `COUNTIF(tipoBase = 'TOP 20')` |
| N | PONTOS 5 | Pontos da coluna M | Fórmula fixa | `M * 15` |
| O | BASES | Total de vendas Base na semana | Soma das anteriores | `E+G+I+K+M` |
| P | ESTOQUE | Estoque (Qtd Anún) vendido na semana | `/estoque-semanal` (`qtdAnuncios`) | soma por vendedor |
| Q | PONTOS 6 | Pontos do ritmo de estoque | Tabela do PDF (ver §6.2) | `P / metaEstoqueSemanaDoSquad` → tabela |
| R | % | % de atingimento da meta de estoque | Cálculo | `P / metaEstoqueSemanaDoSquad` |
| S | FINANCEIRO | Valor de vendas ativas na semana | `/estoque-semanal` (`valorTotalAtivas`) | soma por vendedor |
| T | PONTOS 7 | Pontos do ritmo financeiro | Tabela do PDF **(⚠️ ver §5.1 — divergência a confirmar)** | `S / metaFinanceiraSemanaDoSquad` → tabela |
| U | % 2 | % de atingimento da meta financeira | Cálculo | `S / metaFinanceiraSemanaDoSquad` |

**Pontos-bônus do PDF que a planilha real NÃO calcula em colunas separadas** (ficam só na descrição, não achei coluna própria): "1 Lead Extra"/"2 Leads extra"/"4 Leads extra" por venda em cidade foco/20+, e as duas "Regras Exclusivas" de acionamento+venda outbound. Como dependem de acionamento (CRM), ficam fora do escopo desta fase de qualquer forma.

## 5. Perguntas em aberto — RESOLVIDAS (2026-08-08): "pode seguir como está na planilha"

Usuário confirmou seguir a planilha real como fonte de verdade em tudo (5.1-5.5), sem exigir mudança de comportamento em nenhum ponto. Regra geral pra daqui pra frente nesta feature: **a planilha manda, o PDF é só apoio/desatualizado onde divergir.**

### 5.1 🐛 Possível bug/divergência entre PDF e planilha real na tabela de pontos do Ritmo Financeiro

O PDF (seção 2, "Ritmo Financeiro") diz que a tabela de pontos é **idêntica** à do Ritmo de Estoque:

| Atingimento | Pontos (PDF, ambas as tabelas) |
|---|---|
| ≥120% | 18 |
| ≥100% | 16 |
| ≥90% | 12 |
| ≥80% | 10 |
| ≥70% | 8 |
| ≥60% | 5 |

Mas a fórmula real da coluna **T** (Pontos 7, Ritmo Financeiro) na planilha usa outros valores:

| Atingimento | Pontos (fórmula real da coluna T) |
|---|---|
| ≥120% | 20 |
| ≥100% | 18 |
| ≥90% | 14 |
| ≥80% | 10 |
| ≥70% | 8 |
| ≥60% | 5 |

Essa segunda tabela (20/18/14/10/8/5) é, na verdade, **idêntica à tabela de "Minutagem Média Diária"** (Tempo Falado) do PDF — plausível que seja um copy-paste incorreto na fórmula da planilha, ou que o PDF esteja desatualizado e a regra real já tenha mudado.

**RESOLVIDO (2026-08-08):** usuário decidiu seguir a planilha real como está — usar 20/18/14/10/8/5 na coluna T, não a tabela do PDF. O documento (PDF) fica marcado como desatualizado nesse ponto, não a implementação.

### 5.2 A meta usada em R/U é do SQUAD inteiro, não do vendedor individual

A fórmula faz `VLOOKUP(nome_do_squad, METAS_SQUADS, ...)` — ou seja, o estoque/financeiro de **uma pessoa** é dividido pela meta semanal de **todo o squad**. Isso está certo pela fórmula (não é erro de leitura minha), mas é estranho o suficiente pra eu confirmar antes de replicar: com essa conta, a soma dos "%" de todos os membros de um squad passa de 100% facilmente (ex.: um squad de 10 pessoas, cada uma batendo sua meta individual "normal", teria a soma dos % dando ~1000%). **Isso é intencional (mede contribuição individual pra meta coletiva) ou devia ser uma meta individual (meta do squad ÷ headcount) que ainda não existe?**

### 5.3 Roster (coluna A) hoje é digitado à mão toda semana

Pra automatizar, precisamos decidir a regra de "quem entra na lista": todo vendedor Inside Sales ativo no `/inside-sales-306090` durante a semana de apuração? Alguém que entrou/saiu no meio da semana entra como? Sugestão: mesma população que `/inside-sales-306090` já usa (Convenia, gestor Jackson, cargo Vendedor), sem exigir estar ativo o período todo.

### 5.4 "Venda BASE" = Conversão "Base" do `/fila-leads`?

A nomenclatura é idêntica ("BASE -20", "BASE 30+", "BASE FOCO -100/+100", "TOP 20" batem 100% com os valores do campo `tipoBase` que construímos), então a leitura mais direta é "sim, é a mesma coisa". Só quero confirmação explícita já que pontuação = dinheiro/prioridade real pro time.

### 5.5 Squad "atual" (A-D) vs. squad "na data da venda" (E-M) podem divergir

`/inside-sales-306090` usa squad **atual** do vendedor; `/fila-leads` usa squad **na data da assinatura** (ver `CONEXOES.md` da skill `relatorio-comercial`, §3). Numa janela de 7 dias isso raramente diverge, mas se um vendedor troca de squad no meio da semana, o "Squad" mostrado na linha (coluna B) pode não ser o squad em que a venda de fato aconteceu. Provavelmente aceitável, só documentando.

## 6. Regras da campanha (resumo do PDF, pra referência ao implementar)

### 6.1 Pontos por venda BASE (colunas E-N)

| Tipo Base | Pontos por venda |
|---|---|
| BASE -20 (planos 5/10/20) | 1 |
| BASE 30+ (planos 30+) | 3 |
| BASE FOCO -100 (cidade foco, planos 5-90) | 5 |
| BASE FOCO +100 (cidade foco, planos 100+) | 8 |
| TOP 20 (20+ maiores contas) | 15 |

### 6.2 Pontos por Ritmo de Estoque (coluna Q) — tabela confirmada, sem divergência

| Atingimento da meta semanal | Pontos |
|---|---|
| ≥120% | 18 |
| ≥100% | 16 |
| ≥90% | 12 |
| ≥80% | 10 |
| ≥70% | 8 |
| ≥60% | 5 |
| <60% | 0 |

### 6.3 Pontos por Ritmo Financeiro (coluna T) — ⚠️ ver pergunta 5.1, tabela ainda não confirmada

### 6.4 Fora de escopo nesta fase (precisa do crm-internal — colunas V+)

- Tempo falado / minutagem média diária
- Acionamentos (quantidade de discagens)
- % Fechamento de Lead
- Cong/Canc a nível CRM (`deal_flags`, diferente de `tb_cliente_congelamento`)
- Redutores de atraso/falta/caixa postal/advertência/dias sem venda (hoje digitados à mão — nem isso depende do CRM, mas depende de uma tela de lançamento manual de ocorrências que ainda não existe, ver gap analysis anterior)
- Tier final (ELITE/ALTA PERFORMANCE/PERFORMANCE/STANDARD) e liberação de filas — depende da pontuação total, que só fecha com as colunas V+ inclusas

## 7. O que falta construir (visão técnica de alto nível — não é o plano de implementação ainda)

1. **`metas_squad`**: adicionar campo `metaEstoqueSemana` (= `metaEstoqueDia * 5`, mesma fórmula já usada para `metaEstoqueMes`/`metaFinanceiraSemana`) — mudança trivial na lib `@/lib/metas`.
2. **Nova lib `ranking-semanal`**: reaproveita `getFilaLeadsData` (contagem de `tipoBase` por vendedor no período) + `getEstoqueSemanalData` (`qtdAnuncios`/`valorTotalAtivas` por vendedor) + `/inside-sales-306090` (roster/squad/ciclo/supervisor) + `listarMetas` (meta por squad) — sem nenhuma query nova além da extensão de metas.
3. **Preset de período Sexta→Quinta** — não existe em nenhum relatório hoje, precisa de uma função nova de cálculo de semana (ex.: `semanaCampanhaAtual()` que acha a última sexta-feira e a quinta seguinte).
4. **Tela nova `/ranking-semanal`**: tabela com colunas A-U, deixando claro visualmente (ex. colunas acinzentadas/"em breve") onde entrariam as colunas V+ quando o crm-internal for integrado — não esconder que o relatório é parcial.

## 8. Recomendações antes de aprovar

- Resolver a pergunta 5.1 (tabela de pontos do Ritmo Financeiro) antes de codar — é a única que muda um número de pontuação real, o resto são só perguntas de nomenclatura/confirmação.
- Considerar já deixar a estrutura de dados (tipo TypeScript da linha do ranking) com os campos V+ como `null`/opcionais, em vez de omitir — facilita a Fase 2 (quando o crm-internal entrar) não precisar redesenhar o tipo.
- Como este relatório finalmente teria uso pra `qtdAnuncios`/`valorTotalAtivas` de `/estoque-semanal` e `tipoBase` de `/fila-leads`, vale considerar (só depois de aprovado, não agora) se compensa expor uma função "resumo semanal por vendedor" numa lib comum, já que tanto `/estoque-semanal` quanto este relatório novo vão precisar rodar com o preset Sexta-Quinta às vezes.

---

*Próximo passo: usuário responde as perguntas da seção 5 (principalmente 5.1) → apresento o plano de produto formal (Passo 3 da skill `novo-relatorio`) → aprovação → implementação.*
