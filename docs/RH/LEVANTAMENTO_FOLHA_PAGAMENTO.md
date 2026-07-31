# Levantamento — Fechamento de Folha de Pagamento

> Status: levantamento de requisitos concluído (24/28 colunas com fonte e fórmula definidas e validadas; VA/VT seguem em aberto por decisão do usuário). Nenhum código implementado ainda — próximo passo é o plano técnico (trio `lib`/`api`/`page`).

Objetivo: substituir a planilha manual mensal do RH por uma tela automatizada no Automacoes_CNM, cruzando Convenia, Secullum, o módulo de comissionamento do admin (`chavesnamao_novo` + `C:\Git\api`), e os extratos de Unimed/Odonto/Consignado importados manualmente todo mês.

## 1. Fontes de dados por sistema

### Convenia — cadastro e salário-base
API já integrada no repo (`src/lib/convenia/index.ts`). Header de auth correto: `token: <CONVENIA_TOKEN>` (não é Bearer). Duas chamadas por colaborador são necessárias:
- `GET /employees` → `documents.cpf`, `name`+`last_name`, `job.name`, `department.name`, `hiring_date` (não traz salário)
- `GET /employees/{id}` → `salary` (não repete o CPF)

144 colaboradores hoje → 145 chamadas por fechamento (sem paginação real).

### Secullum — horas positivas e negativas
Lib já existente (`src/lib/secullum/index.ts`) calcula extras/atrasos a partir de `/Batidas`, já com tolerância CLT de 10 min e tratamento de dias justificados — mesma base do banco de horas da Copa. Reaproveitável quase 1:1.

### Comissionamento — acesso direto ao banco (MySQL)
Investigado `C:\Git\api` (NestJS/TypeORM, schema `cnm`) e `C:\Git\chavesnamao_novo` (PHP legado, schema `webserver`). Não existe fórmula secreta em nenhuma API externa — o endpoint `GET /getComission` só decide quais contratos contam como "venda elegível no mês":

```sql
-- 1. Vendas elegíveis do mês
SELECT fc.*, c.*
FROM tb_financeiro_contrato fc
JOIN tb_cliente c ON c.id = fc.id_cliente
WHERE fc.id_vendedor = :vendorId
  AND c.deleted = 0 AND fc.deleted = 0
  AND fc.valor_mensalidade > 0.01
  AND YEAR(fc.data_contrato) = :ano AND MONTH(fc.data_contrato) = :mes
  -- 2. excluir contratos já fechados para este vendedor
  AND fc.id NOT IN (
    SELECT cd.id_contrato
    FROM tb_comissao_detalhamento cd
    JOIN tb_comissao_fechada cf ON cf.id = cd.id_comissao_fechada
    WHERE cf.id_vendedor = :vendorId
  )
```

- **3. Faixa de comissão**: `tb_vendedor.faixas_comissao` (JSON faixa1..faixa5) comparado contra a contagem de vendas elegíveis do mês → define `comissao_percentual`.
- **4. Valor por linha**: `totalReceber = valor_mensalidade × (comissao_percentual / 100)`.
- Regra vigente desde 2024-02-29 (contrato criado no mês, ativo, não cancelado) — diferente da regra antiga usada por outros perfis (mensalidade paga/vencida/a vencer).
- Cruzamento por `tb_vendedor.documento` (CPF).

⚠️ **Confirmar antes de implementar**: os schemas `cnm` (repo `api`) e `webserver` (PHP) têm tabelas/colunas idênticas, então é muito provável que sejam a mesma instância física — mas nenhum dos dois repos tem `.env` de produção para provar isso. Validar com quem administra o RDS.

### Unimed — PDF mensal
Demonstrativo de faturamento em blocos por família/beneficiário. **Decidido usar `Total Eventos`** (uso real do plano no mês — consultas, exames), não `Mensalidade` (prêmio fixo). Sem CPF nem matrícula preenchida — cruzamento só por **nome completo**.

### Odonto Bradesco — planilha mensal
XLSX com `TITULARIDADE` (Titular/Dependente) agrupado por `CERTIFICADO`. Só dependente gera desconto. **Valor validado com dados reais: R$ 17,57 fixo por dependente** (42/43 casos com aderência exata em centavos). Fórmula: `Desconto Odonto = nº de dependentes × 17,57`. Cruzamento por CPF.

### Consignado — arquivo do governo (Portal de Consignações)
JSON baixado mensalmente por CNPJ + competência (ex.: `43853784000103-202607v1.4.json`), um registro por **contrato de empréstimo ativo** (um colaborador pode ter várias linhas/empréstimos simultâneos). Campos: `cpf`, `nomeTrabalhador`, `valorParcela`, `ifConcessora.descricao`, `competencia`. Fórmula: `Consignado = soma(valorParcela)` agrupado por CPF, filtrando pela competência da folha. Cruzamento direto por CPF.

## 2. Fórmulas confirmadas — horas, DSR e faltas

Reverse-engineering feito em cima de 1.337 fórmulas Excel *vivas* na planilha real de junho (`Folha Junho Atualizada - Dissídio.xlsx`, 133 colaboradores):

| Campo | Fórmula confirmada |
|---|---|
| Sal + Comissão | `Salário atual + Comissão` |
| Valor Hora | `(Salário atual + Comissão) ÷ 200` — 3 colaboradores meio-período usam ÷100 |
| Hora Extra | `Valor Hora × Horas Convertidas (positivas)` |
| HE + 75% | `Hora Extra × 1,75` — confirmado exatamente 75% |
| DSR Hora Extra | `HE+75% ÷ dias úteis do mês × dias de descanso do mês` (junho: ÷25×5; proporcional para admissão no meio do mês) |
| DSR Comissão | `Comissão ÷ dias úteis × dias de descanso` (mesma lógica) |
| Salário/Hora (p/ falta) | `Salário atual ÷ 200` — sem somar comissão |
| Desc. Horas Falta | `Salário/Hora × Hora Convertida (negativa)` |
| DSR (falta) | `Salário atual ÷ 25 × nº de DSRs perdidos` — **regra de perda**: falta injustificada de um dia inteiro da semana = perde 1 DSR; **valor de cada DSR = valor de um dia de trabalho** (equivalente a `Salário/Hora × 8h`) |

## 3. Dissídio antecipado

A empresa antecipa o reajuste da convenção coletiva antes de ela sair oficialmente — por isso o salário pago é maior do que o registrado no Convenia.

Mecanismo encontrado na planilha real:

| Coluna auxiliar | Significado |
|---|---|
| Salário (base) | valor "oficial" — é o que deve bater com o Convenia |
| Meses | quantos meses de reajuste já acumularam para aquele colaborador (0–12) |
| percentual | constante `5/12` em 100% das linhas → 5% ao ano, aplicado mês a mês |
| aumento | `percentual × meses ÷ 100` |
| Salário atual | `Salário base × (1 + aumento)` — valor realmente pago |

126 de 133 colaboradores seguem essa fórmula exatamente.

**Decisões do usuário:**
- **Contador de meses**: baseado na **data de admissão** de cada colaborador (`hiring_date` do Convenia) — não uma data única para a empresa toda. A automação calcula isso sozinha.
- **Overrides de liderança** (7 exceções: +40% de mercado em 5 casos, +10% de mérito em 1 caso): viram uma **tabela de exceção separada**, com o percentual extra adicionado manualmente por colaborador — fora do mecanismo automático de dissídio.

## 4. Mapeamento das 28 colunas

| # | Coluna | Fonte / fórmula | Status |
|---|---|---|---|
| 1 | Admissão | Convenia `hiring_date` | ✅ pronto |
| 2 | Nome do colaborador | Convenia `name`+`last_name` | ✅ pronto |
| 3 | CPF | Convenia `documents.cpf` (lista) | ✅ pronto |
| 4 | Cargo | Convenia `job.name` | ✅ pronto |
| 5 | Dpto | Convenia `department.name` | ✅ pronto |
| 6 | Salário atualizado | Convenia (base) + dissídio (admissão) + tabela de exceção liderança | ✅ pronto |
| 7 | Comissão | MySQL direto — query de vendas elegíveis + faixas | ✅ pronto |
| 8 | DSR Comissão | `Comissão ÷ 25 × 5` (proporcional) | ✅ pronto |
| 9 | Sal + Comissão | `#6 + #7` | ✅ pronto |
| 10 | Horas Positivas | Secullum | ✅ pronto |
| 11 | Horas Convertidas | calculado (HH:mm → decimal) | ✅ pronto |
| 12 | Valor Hora | `(#6 + #7) ÷ 200` | ✅ pronto |
| 13 | Hora Extra | `#11 × #12` | ✅ pronto |
| 14 | HE + 75% | `#13 × 1,75` | ✅ pronto |
| 15 | DSR Hora Extra | `#14 ÷ 25 × 5` (proporcional) | ✅ pronto |
| 16 | Horas negativas | Secullum | ✅ pronto |
| 17 | Hora Convertida | calculado (HH:mm → decimal) | ✅ pronto |
| 18 | Salário/Hora | `#6 ÷ 200` | ✅ pronto |
| 19 | Desc. Horas Falta | `#17 × #18` | ✅ pronto |
| 20 | Falta | Secullum · `Entrada1..5 = null` + `Memoria` presente + não Folga/Neutro (validado ao vivo) | ✅ pronto |
| 21 | DSR | `#6 ÷ 25 × nº DSRs perdidos` | ✅ pronto |
| 22 | Desconto Unimed | PDF Unimed · `Total Eventos`, match por nome | ✅ pronto |
| 23 | Desconto Odonto | `nº dependentes × 17,57` | ✅ pronto |
| 24 | Consignado | JSON do governo · `soma(valorParcela)` por CPF | ✅ pronto |
| 25 | Observações | campo livre, manual | manual |
| 26 | SITEPD | campo manual, mesmo padrão da planilha atual (35 fixo / "Oposição" / "licença") — sem automação por enquanto | manual |
| 27 | Vale Alimentação | sem fonte — **em aberto, sem prioridade** | ❌ sem fonte |
| 28 | Vale Transporte | sem fonte — **em aberto, sem prioridade** | ❌ sem fonte |

## 5. Armadilhas identificadas

1. Confirmar que `cnm` e `webserver` são a mesma instância de banco antes de apontar a folha direto pro MySQL.
2. Mês de referência da comissão ≠ mês da venda — regra vigente desde 2024-02-29 é "contrato criado no mês", diferente da regra antiga (mensalidade paga) ainda usada por outros perfis.
3. Coluna `excecao` em `tb_comissao_detalhamento` zera comissão silenciosamente (já paga por outro meio) — não ignorar ao somar.
4. Atendente só comissiona em indicação de cliente, não em toda venda.
5. Representante Comercial fecha por semana (dom–sáb), não por mês — semanas que cruzam virada de mês precisam de rateio.
6. Rescisão no meio do mês muda a regra de cálculo (inclui pendências que normalmente não comissionariam).
7. Convenia: nenhum endpoint único traz as 6 colunas cadastrais — CPF só na lista, salário só no detalhe (1 + N chamadas).
8. Convenia traz só o salário-base, sem o dissídio antecipado — aplicar o mecanismo da seção 3 por cima.
9. 7 colaboradores de liderança/tech têm reajuste fora do mecanismo padrão (tabela de exceção separada).
10. Unimed: colunas numéricas coladas sem separador no texto puro do PDF — extrair por coordenada (x/y), não por texto linear.
11. Unimed: blocos de família quebram entre páginas do PDF — concatenar todas as páginas antes de segmentar.
12. Unimed: cruzamento só por nome (sem CPF/matrícula) — risco de homônimos e divergência de grafia; precisa de tela de conferência manual.
13. Unimed: bloco de "Eventos" tem colunas próprias (Descrição/Evento/Grau/Guia/Executor/Data/Qtd./Valor Total), diferente do bloco de Mensalidade — mesmo risco de colunas grudadas.
14. Odonto: arquivo é snapshot cumulativo (não só novidades do mês); nº de dependentes muda mês a mês.
15. Consignado: um colaborador pode ter vários empréstimos simultâneos — somar todos os contratos ativos daquele CPF na competência.
16. Consignado, Unimed e Odonto são arquivos baixados/gerados manualmente por competência — a tela precisa de um fluxo de "upload mensal" para os três, não é uma API consultada sozinha.
17. Planilha real de junho tem cabeçalhos corrompidos (coluna "Empresa" contém Admissão; header de CPF virou um número de data) — não usar como template de import sem corrigir antes.

## 6. Falta integral — marcador confirmado ao vivo no Secullum

Validado batendo 4 casos reais da planilha de junho (CPF + data) direto contra `/IntegracaoExterna/Batidas`:

- **Falta integral não justificada** = `Entrada1..5 === null` (nenhum horário batido, e não é um marcador textual) **E** `Folga = false` **E** `Neutro = false` **E** havia expectativa de trabalho no dia (`MemoriaEntrada1` não-nulo, ou seja, o dia estava na escala).
- **Dias com marcador textual não contam como falta comum.** Além dos já mapeados na lib (`AT. MÉD`, `ABONO`, `DECL.`, `FE. IND`), a validação ao vivo encontrou dois marcadores novos: `"SUSP"` (suspensão disciplinar) e `"GERAR"` (dia pendente de processamento no Secullum) — ambos aparecem nos campos de horário em vez de `HH:mm`.
- **Achado de bug no processo manual atual**: o dia 29/06 (dia em que a empresa liberou o time durante o jogo do Brasil) apareceu como "falta" de um colaborador (Nilson Luis Dos Santos Junior) na planilha manual de junho. Isso está errado — a lib já existente (`calcularBancoHorasCopa`) trata esse dia como especial: conta como trabalhado no fechamento de junho, com a dívida da empresa compensada em julho. A automação não deve reproduzir esse erro; precisa de uma lista própria de "dias-exceção" definidos pela empresa (feriados liberados, folgas coletivas), separada da regra geral de falta.

## 7. Perguntas em aberto

Só resta uma, deixada em aberto por decisão do usuário:

- **VA / VT**: sem fonte automatizada hoje (Convenia `/benefits` existe mas retorna 403 — sem permissão no token atual). Sem prioridade por enquanto.

## 8. Tela proposta

Seguindo o padrão trio já usado no repo (`lib` / `api` / `page`, ex. `assinaturas`, `secullum`).

- **Filtros**: mês/ano de referência da folha; botão para reimportar/atualizar Convenia e Secullum; upload do PDF Unimed, XLSX Odonto e JSON de Consignado do mês.
- **KPIs de topo**: total da folha, total de comissões, total de descontos (Unimed + Odonto + Consignado + faltas), pendências de match (colaboradores não encontrados no Unimed/comissionamento por nome ou CPF).
- **Tabela**: uma linha por colaborador com as 28 colunas — calculadas somente-leitura, manuais (Observações, SITEPD, VA, VT) editáveis na própria tela — com export para Excel/CSV ao final.

---

Levantamento também disponível em formato visual: artifact publicado na conversa com Claude (link privado, não versionado aqui).
