# Resumo — Fechamento de Folha de Pagamento

> Status: implementado e em uso real pelo RH. Todas as 28 colunas da planilha original têm fonte automatizada, exceto Observações/SITEPD (sempre manuais por natureza). Sem commit no git ainda — protótipo rodando localmente (`npm run dev`), validado contra dados reais de produção.

Substitui a planilha manual mensal do RH, cruzando Convenia (cadastro/salário), Secullum (ponto), o banco de produção (comissão), e três importações manuais mensais (Unimed, Odonto, Consignado) + uma nova (VA/VT). Ver `LEVANTAMENTO_FOLHA_PAGAMENTO.md` nesta mesma pasta para o levantamento original que precedeu a implementação.

## 1. Arquitetura

Trio padrão do repo, em `src/lib/folha-pagamento/`, `src/app/api/folha-pagamento/`, `src/app/folha-pagamento/page.tsx`:

- `types.ts` — `FolhaColaborador` (~30 campos), `OverrideSalario`, `DiaExcecao`.
- `calendario.ts` — dias úteis/descanso do mês (feriados nacionais + Páscoa calculada), com suporte a período parcial (admissão no meio do mês).
- `dissidio.ts` — dissídio antecipado (5%/ano ÷ 12 meses desde a admissão, capado em 12 meses).
- `comissao.ts` — comissão via acesso direto ao MySQL de produção (schema `webserver`/`cnm`): vendas elegíveis, aditivos de contrato, faixas progressivas, dedupe de vendedores duplicados.
- `horas.ts` — horas positivas/negativas via Secullum, com double-check de falta (ver seção 4).
- `overrides.ts` — tabela de exceção de liderança (% adicional de dissídio) e dias-exceção.
- `unimed.ts` / `odonto.ts` / `consignado.ts` / `vale.ts` — parsers dos arquivos mensais importados manualmente.
- `manual.ts` — campos editáveis pela tela (Observações, SITEPD, VA/VT manual, override de Horas +/−).
- `index.ts` — orquestrador (`getFolhaPagamento`, `getFolhaColaborador` para recálculo de 1 linha, tracking de progresso real).

Persistência própria (Postgres "Metas", `getMetasPool()`) via `migrations/folha-pagamento/0001..0004`: tabelas de override de salário, dia-exceção, Unimed/Odonto/Consignado importados, campos manuais (com override de horas), e VA/VT.

## 2. Fontes de dados

| Fonte | Uso | Observação |
|---|---|---|
| Convenia API | Cadastro + salário-base | Rate limit real — 1 req/colaborador, throttle de 1,5s com reserva-antes-do-await |
| Secullum `/Batidas` | Horas positivas/negativas, faltas | Rápido, sem rate limit relevante |
| Secullum `/Calcular` | Double-check pontual de falta | Rate limit de 100 req/h — só usado sob demanda (ver seção 4) |
| MySQL produção (`webserver`/`cnm`) | Comissão (vendas + aditivos) | Só leitura, mesma regra do admin PHP `chavesnamao_novo` |
| Unimed (PDF mensal) | Desconto Unimed | Cruzamento só por nome (sem CPF no PDF) |
| Odonto Bradesco (XLSX mensal) | Desconto Odonto | R$ 17,57 fixo por dependente, cruzamento por CPF |
| Consignado (JSON do governo) | Desconto Consignado | Soma de todos os empréstimos ativos do CPF na competência |
| Planilha de acompanhamento da empresa (XLSX mensal) | VA / VT | 3 abas (CLT/Estagiário/Aprendiz), sem CPF — cruzamento por nome |
| Manual (tela) | Observações, SITEPD, override de VA/VT, override de Horas +/− | Sempre tem prioridade sobre o valor calculado/importado |

## 3. Regras de negócio implementadas

- **Dissídio antecipado**: 5% ao ano, proporcional aos meses desde a admissão (capado em 12 meses) + tabela de exceção de liderança (% adicional somado, cadastrado manualmente com CPF/vigência).
- **DSR** (comissão, hora extra, falta): proporcional a dias úteis/dias de descanso do período — mês cheio, ou período parcial quando a admissão cai dentro do mês corrente.
- **Comissão**: vendas elegíveis do mês (perfil Vendedor e Atendente, com filtro de indicação para Atendente) + aditivos de contrato (upgrades), faixas progressivas de percentual (`faixa` onde `vendas ≤ quantidade`, não a primeira que seria `≥`), dedupe de linhas duplicadas de vendedor no banco (agrupado por nome, pega a mais atual).
- **Saldo de Horas**: nova coluna calculada (`Horas + − Horas −`), não editável, colorida conforme o sinal.
- **Falta**: dia sem batida, sem marcador de justificativa e com expectativa de trabalho na escala.

## 4. Double-check de falta via `/Calcular`

O `/Batidas` não expõe justificativa (declaração/abono) quando o dia não tem nenhuma batida registrada — só o `/Calcular` tem essa informação (coluna `JustPa.`), mas esse endpoint tem limite de 100 req/h por banco.

Solução: dias que parecem falta integral (sem batida, sem marcador) viram "candidatos"; só quando um colaborador tem ao menos 1 candidato no mês é feita **uma** chamada a `/Calcular` (cobre o mês inteiro, cache de 1h). Se o dia tiver `JustPa.` preenchido, deixa de contar como falta. Validado em dados reais: apenas ~8% dos colaboradores ativos geram esse double-check em um mês típico — bem abaixo do limite. Teto de segurança (80 chamadas/hora) com degradação silenciosa (mantém o comportamento anterior) se algum mês fugir do padrão.

## 5. Tela (`/folha-pagamento`)

- **Filtros**: mês/ano, botão "Atualizar Convenia" (force refresh), botão "Exceções" (modal de override de liderança).
- **KPIs**: total da folha, total de comissões, total de descontos, pendências (colaboradores sem match automático — sinalizados em amarelo na tabela).
- **Progresso real**: modal com 2 barras (busca de salário no Convenia / cálculo de horas+comissão+descontos), refletindo contadores reais do backend — não é um tempo estimado.
- **Tabela**: colunas agrupadas por título (Dados Gerais, Salário, Comissão, Horas, Descontos, Benefícios, Observações), com Admissão/Nome/CPF fixos (sticky) ao rolar horizontalmente. Acréscimos em verde, descontos em vermelho.
- **Edição inline**: Horas +/−, Observações, SITEPD, VA, VT — clicáveis (ícone de lápis sempre visível), persistem permanentemente e têm prioridade sobre o valor calculado/importado.
- **Uploads mensais**: Unimed (PDF), Odonto (XLSX), Consignado (JSON), VA/VT (XLSX).

## 6. Bugs reais encontrados e corrigidos

| Bug | Causa | Correção |
|---|---|---|
| Todos os salários zerados | `buscarSalario` lia `raw.salary` em vez de `res.data?.salary` | Unwrap correto do `.data` |
| Admissão no meio do mês contava falta antes da contratação | Consulta ao Secullum não respeitava a data de admissão | Início da consulta = `max(primeiro dia do mês, data admissão)` |
| Comissão de Alana zerada | CPF em branco no `tb_vendedor` + perfil Atendente bloqueado + aditivos não calculados | Match por nome como fallback, cálculo de Atendente estendido, nova lógica de aditivos |
| Aditivos com valor errado (3 tentativas até bater) | Baseline errado (`valor_mensalidade_original` em vez de `antigo_valor_mensalidade`), filtro de mês na data errada (criação do aditivo em vez do pagamento), subquery aninhada retornando 0 linhas no MySQL | Baseline correto, filtro por data de pagamento, query achatada com `GROUP BY`/`HAVING` |
| Comissão de Alessandra Severino 15% em vez de 20% | `percentualPorFaixa` usava cascata `>=` (crescente) em vez de `<=` (regra real do PHP legado) | Cascata corrigida |
| Comissão de Alessandra Mitrut zerada | Mesmo CPF em 4 linhas de `tb_vendedor` (3 históricas + 1 atual com CPF em branco) | Agrupar por nome normalizado, escolher a linha mais atual, registrar CPF de qualquer linha do grupo |
| `Convenia 429` ao vivo | Race condition no throttle (reserva de slot depois do await) + Strict Mode do React duplicando o efeito de montagem | Reserva antes do await + `AbortController` no efeito |
| Override de liderança nunca aplicava (Alex Galvão) | `vigencia_inicio`/`vigencia_fim` voltam do Postgres como objeto `Date`, comparados com string `"YYYY-MM-DD"` — essa comparação sempre resulta em `false` | Conversão pra string ISO na leitura do banco |
| Falta de Angelo Miguel ignorava declaração parcial | `/Batidas` não expõe justificativa quando o dia não tem batida | Double-check via `/Calcular` (seção 4) |

## 7. Limitações conhecidas

- **Sem "limpar" override manual de horas**: o upsert usa `COALESCE`, então passar `null` não reseta um valor já salvo (precisa de UPDATE direto via SQL hoje). Sem UX pra isso ainda.
- **Atraso parcialmente justificado por declaração** (ex.: chegou atrasado mas tinha 2h de abono) não passa pelo double-check — só falta integral passa, porque cobrir todo atraso estouraria o limite de 100 req/h do `/Calcular`. Correção fica manual via edição de Horas.
- **Unimed e VA/VT**: cruzamento só por nome (sem CPF nos arquivos-fonte) — risco de homônimo/grafia divergente.
- **Dia corrente sem batida** (fechar a folha no próprio último dia do mês) aparece como falta candidata — comportamento esperado, não um bug.

## 8. Próximos passos possíveis

- Definir com o usuário se este fluxo deve virar handoff (`TAREFA_FOLHA_PAGAMENTO.md`) pra implementação definitiva no admin PHP (`chavesnamao_novo`), seguindo o padrão já usado em `TAREFA_BANCO_HORAS_COPA.md`/`TAREFA_DASHBOARD_ASSINATURAS_PF.md` — ainda não solicitado.
- Commit no git (nunca pedido explicitamente até agora).
- UX de "resetar override manual" de horas/VA/VT.
