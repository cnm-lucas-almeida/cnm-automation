# ⚽ Tarefa: Tela de Banco de Horas — Copa (29/06) no admin PHP

## O que é

No dia 29/06 a empresa liberou os colaboradores mais cedo por causa do jogo do Brasil na Copa. O mês de junho fechou como se esse dia tivesse sido trabalhado integralmente (8h) — ou seja, as horas não trabalhadas naquele dia viraram uma **dívida da empresa com o colaborador**, a ser paga em folha em julho, descontada pelas horas extras feitas desde então e re-acrescida por eventuais atrasos.

Hoje o RH faz esse controle **manualmente**: abre o Secullum, verifica colaborador por colaborador, calcula o saldo na mão e manda uma mensagem tipo:

> Bom dia, tudo bem?
> As suas horas a ser pago da Copa é 04:03.
> Na data de 13/07 já tem 04:17, contabilizando os atrasos de -03:09, para compensar tem o total de +01:08, faltando para pagar 02:55.

Prototipamos, no repo `Automacoes_CNM` (Next.js interno da equipe), uma tela que automatiza esse cálculo para todos os colaboradores de uma vez — pra validar que os dados e a regra de cálculo batem exatamente com o processo manual do RH antes de implementar de vez. **Esta tarefa é levar esse resultado para o admin PHP** (`chavesnamao_novo`) — o protótipo em Next.js foi só uma prova de conceito, o admin é onde o RH deve efetivamente usar isso.

**Não precisa reproduzir o visual React/Tailwind pixel a pixel** — pode seguir o padrão visual já usado no admin PHP. O que importa é a **regra de cálculo correta** (validada nos exemplos abaixo, batendo número a número com o processo manual do RH) e o **comportamento** descrito neste documento.

Protótipo de referência (comportamento, não visual):
- `Automacoes_CNM/src/lib/secullum/index.ts` — função `calcularBancoHorasCopa` (regra de cálculo) e `getBatidas` (integração Secullum)
- `Automacoes_CNM/src/lib/convenia/index.ts` — função `listarColaboradores` (lista de funcionários com CPF)
- `Automacoes_CNM/src/app/api/secullum/banco-horas-copa/route.ts` — API/lote e lista de exclusão
- `Automacoes_CNM/src/app/secullum/banco-horas-copa/page.tsx` — UI, filtros, paginação, mensagem de cobrança

---

## O que muda em relação ao processo atual

| Item | Processo manual hoje | Tela nova |
|---|---|---|
| Ver quem ainda deve horas da Copa | RH abre o Secullum e confere colaborador por colaborador | Lista todos de uma vez, com KPIs (pendentes/quitados/sem registro/erros) |
| Calcular quanto falta pagar | Cálculo manual olhando extras e atrasos no Secullum | Calculado automaticamente pela regra abaixo |
| Comunicar o colaborador | RH digita a mensagem à mão no WhatsApp | Botão "Copiar mensagem" já formatada com o nome da pessoa |
| Buscar uma pessoa específica | — | Busca por nome ou CPF |
| Filtrar quem deve mais que X horas | — | Filtro "Deve mais de ___ h ___ min" |
| Colaboradores que não batem ponto (cargos isentos) | RH sabe de cabeça quem ignorar | Lista de exclusão explícita (ver seção de dados) |
| Volume grande de colaboradores | Um por vez, demorado | Paginado (20 por página) |

---

## Fonte de dados

### 1. Lista de colaboradores ativos com CPF

Precisa de uma fonte que dê, para cada colaborador ativo: nome, CPF, cargo, departamento. No protótipo isso vem da API da Convenia (`GET /employees`, paginado), filtrando `status === 'Ativo'` e CPF preenchido. No admin PHP, usar a fonte de funcionários que já existir lá (Convenia ou tabela interna já sincronizada) — o que importa é ter o CPF, usado como chave para consultar o Secullum.

### 2. Integração com o Secullum — endpoint `/Batidas`

**Importante: usar o `/Batidas`, não o `/Calcular`.** O Secullum tem outro endpoint (`/Calcular`) que devolve os valores já prontos (extras, atrasos etc.), mas ele tem **limite de 100 requisições/hora por banco** — inviável para rodar um relatório com a empresa toda de uma vez (testamos e travou). O `/Batidas` não tem esse problema (é o mesmo endpoint que já usamos hoje na tela de Intervalo de Almoço, rodado diariamente para todos os colaboradores sem travar). A trabalheira de replicar o cálculo do `/Calcular` na mão (ver regra abaixo) vale a pena por isso.

**Autenticação** (OAuth2 password grant):
```
POST https://autenticador.secullum.com.br/Token
Content-Type: application/x-www-form-urlencoded
Body: grant_type=password&username={SECULLUM_USERNAME}&password={SECULLUM_PASSWORD}&client_id=3
→ { access_token, expires_in, refresh_token }
```

**Consulta de batidas** (por colaborador, período):
```
GET https://pontowebintegracaoexterna.secullum.com.br/IntegracaoExterna/Batidas
Headers:
  Authorization: Bearer {access_token}
  secullumidbancoselecionado: {SECULLUM_BANCO_ID}
Params: dataInicio=2026-06-29, dataFim={data de referência}, funcionarioCpf={cpf}
```

Retorna um array com um item por dia, contendo (campos relevantes):
```
Data                                    -- data do dia (ISO)
Entrada1/Saida1 ... Entrada5/Saida5     -- horários batidos (HH:mm ou null)
MemoriaEntrada1/MemoriaSaida1 ... x5    -- horário ESPERADO da escala naquele dia (HH:mm ou null)
Folga, Neutro, NBanco                   -- booleans: dia não conta pra banco de horas se qualquer um for true
Compensado                              -- boolean (informativo, não usado na regra)
```

Os campos `MemoriaEntrada`/`MemoriaSaida` são o pulo do gato: é o horário da escala planejada, disponível para todo dia com jornada esperada (normalmente nulo em dias sem expediente, tipo fim de semana). Comparando o horário batido (`EntradaN`/`SaidaN`) com o esperado (`MemoriaEntradaN`/`MemoriaSaidaN`) dá pra saber se o colaborador trabalhou a mais ou a menos naquele dia, sem precisar do `/Calcular`.

### 3. Colaboradores excluídos (não batem ponto)

Alguns cargos não registram ponto no Secullum (isentos de controle de jornada) e não devem entrar neste relatório:

- **Alex Galvão Borges** — Coordenador de Inovação e IA — CPF `05464225943`

Manter essa lista **explícita e fácil de editar** (vão aparecer mais nomes conforme o RH identificar). No protótipo é um `Set` de CPFs no início do arquivo da API; no admin, pode ser uma tabela de configuração ou uma constante — o importante é não precisar mexer em lógica de cálculo pra adicionar/remover alguém.

---

## Regra de cálculo (validada contra o processo manual do RH)

Para cada colaborador, buscar as batidas de **29/06/2026 até a data de referência** (ver seção de data de referência abaixo) e calcular:

1. **Carga esperada do dia** (`cargaMin`): soma, para cada par `MemoriaEntradaN`/`MemoriaSaidaN` preenchido, da diferença em minutos entre saída e entrada.
2. **Trabalhado no dia** (`trabalhadoMin`): mesma soma, mas usando `EntradaN`/`SaidaN` (horário batido de verdade).
3. **Diferença do dia** (`diffMin = trabalhadoMin - cargaMin`): positivo = trabalhou a mais, negativo = trabalhou a menos.
4. Se `Folga`, `Neutro` ou `NBanco` forem `true` naquele dia, ele **não entra** em nenhuma soma (pula o dia).

A partir disso:

- **Devido da Copa** (`devidoMin`): olhando só o dia **29/06/2026**, é `max(0, -diffMin)` daquele dia (quanto ele trabalhou a menos por causa da liberação do jogo).
- **Extras acumuladas** (`extrasMin`): soma de `diffMin` positivo de todos os dias **a partir de 01/07/2026** (inclusive) — **junho não entra nessa conta**, só o saldo criado em 29/06 é considerado; a compensação em si só conta a partir de julho.
- **Atrasos acumulados** (`atrasosMin`): soma de `-diffMin` (valor positivo) de todos os dias a partir de 01/07/2026 com `diffMin` negativo.
- **Tolerância da CLT**: dias em que `|diffMin| <= 10` (10 minutos) **não contam nem como extra nem como atraso** — é a tolerância do Art. 58 §1º da CLT ("variações de horário não excedentes de 5 minutos, observado o limite de 10 minutos diários"), que o Secullum já aplica internamente. **Sem essa tolerância os números não batem** com o Secullum (erramos por 2 minutos até descobrir isso).
- **Compensado** (`compensadoMin`): `extrasMin - atrasosMin`.
- **Falta pagar** (`faltaPagarMin`): `devidoMin > 0 ? (devidoMin - compensadoMin) : 0`. **Se não há dívida da Copa (`devidoMin = 0`), falta pagar é sempre 0** — nunca derivar esse valor de atrasos/extras de quem nunca saiu mais cedo em 29/06, senão vira dívida de Copa que não existe (ver armadilha #7). Quando `devidoMin > 0`, o resultado pode ficar negativo se o colaborador compensou além do devido — nesse caso, tratar como quitado/zero na exibição, mas manter o valor real internamente se for útil pra auditoria.
- **Status**: `pendente` se `faltaPagarMin > 0`, senão `quitado`.
- Se não houver batida no dia 29/06/2026 (funcionário admitido depois, férias, etc.), marcar como `sem_registro` em vez de calcular.

### Exemplo validado (bate com a mensagem manual do RH)

Colaborador com batidas reais no período: devido = `04:03`, extras (desde 01/07) = `04:17`, atrasos (desde 01/07) = `03:09` → compensado = `01:08` → falta pagar = `04:03 - 01:08 = 02:55`. Esse exato conjunto de números foi conferido contra o `/Calcular` oficial do Secullum e contra a mensagem que o RH mandou manualmente — bateram 100%.

---

## ⚠️ Armadilhas (já caímos nelas, evitem repetir)

1. **Não usar o `/Calcular` para o relatório em lote.** Limite de 100 req/hora por banco — trava com a empresa toda. Usar `/Batidas` + regra de cálculo acima (sem limite prático, mesmo endpoint já usado hoje na tela de Intervalo de Almoço).

2. **Tolerância de 10 min da CLT é obrigatória.** Sem ela, os números ficam a poucos minutos de distância do valor certo (fica "quase certo", o que é pior que errado na certa — passa despercebido). Ver regra acima.

3. **Nunca usar a data de hoje como referência padrão — usar D-1.** Se o dia corrente ainda não fechou (colaborador ainda não bateu a saída), o Secullum trata as horas que faltam bater como atraso, distorcendo pra pior o saldo de qualquer pessoa que ainda esteja em turno. Ver também a mesma regra já aplicada na tela de Intervalo de Almoço (`dataD1()`).

4. **Junho não entra na conta de extras/atrasos.** Só o saldo criado no dia 29/06 é considerado dívida; a compensação (extras que abatem, atrasos que somam) só é contada a partir de 01/07. Incluir 30/06 na soma de extras infla o valor incorretamente (validamos isso comparando com o `/Calcular` oficial).

5. **Filtro de busca por nome/CPF: cuidado com string vazia.** Se implementar a busca como "nome contém X OU cpf contém dígitos-de-X", **não** deixe a condição do CPF rodar quando não houver dígito nenhum no termo buscado — `"12345".includes("")` é sempre `true` em qualquer linguagem/lib que siga esse comportamento de substring vazia, e isso faz o filtro aceitar tudo, silenciosamente. Foi um bug real que tivemos: buscar por nome não filtrava nada.

6. **Nem todo CPF do RH/Convenia existe no Secullum.** Alguns colaboradores retornam erro "Funcionário não encontrado" (ex: registros de teste/placeholder na base de RH, tipo um cadastro genérico "Tecnologia de CNM - Alterado 19-01-24"). Tratar como erro de consulta por linha, não travar o relatório inteiro.

7. **Sem dívida da Copa, não existe "falta pagar" — nem que a pessoa tenha atrasos depois.** Bug real que cometemos: se `devidoMin` (o débito criado em 29/06) for `0` — colaborador que trabalhou o dia inteiro, não saiu mais cedo —, o `faltaPagarMin` **tem que ser sempre `0`**, mesmo que a pessoa tenha atrasos normais depois de 01/07. Sem esse cuidado, atrasos de julho **sem nenhuma relação com a Copa** apareciam somados como se fossem dívida da Copa, e gente que nunca deveu nada da Copa aparecia como "Pendente" (achamos um caso real assim, "Fay Calabrese da Silva" — `devido: 0`, mas aparecia devendo 8h42 só por atraso comum de julho). Regra: `faltaPagarMin = devidoMin > 0 ? (devidoMin - compensadoMin) : 0`.

8. **KPIs "hoje"/"este mês" não se aplicam aqui, mas se o admin tiver filtros de outros relatórios reaproveitados, confira sempre se os totais respeitam os filtros ativos** (mesma armadilha do relatório de Assinaturas PF, citada por precaução).

---

## Filtros e comportamento da tela

| Filtro/controle | Comportamento |
|---|---|
| Data de referência | Date picker, padrão D-1 (ver armadilha #3) |
| Status | Todos / Pendentes / Quitados / Sem registro 29/06 / Erros — clicável nos próprios cards de KPI |
| Busca | Nome ou CPF — quando preenchida, ignora o filtro de Status (busca em todo mundo) |
| "Deve mais de ___ h ___ min" | Só mostra quem tem `faltaPagarMin` acima do limite informado |
| Botão "Limpar filtros" | Reseta busca, limite de horas e status pra "todos" |
| Paginação | 20 colaboradores por página, com "Anterior"/"Próxima" e contagem total |

## KPIs (topo da tela)

1. **Colaboradores** — total consultado (ativos, com CPF, exceto lista de exclusão)
2. **Pendentes** — `faltaPagarMin > 0`
3. **Quitados** — `faltaPagarMin <= 0`
4. **Sem registro 29/06** — sem batida naquele dia
5. **Erros** — falha ao consultar o Secullum para aquele CPF (mostrar o motivo, permitir tentar de novo individualmente sem refazer o lote inteiro)

## Tabela

Colunas: Funcionário (+ cargo), Departamento, CPF, Devido Copa, Extras (jul), Atrasos (jul), Compensado, Falta pagar, Status (badge colorido), Ação.

Ação por linha:
- Se erro: botão "Tentar novamente" (reconsulta só aquele colaborador)
- Se pendente/quitado: botão "Copiar mensagem" (copia o texto abaixo pra área de transferência)

## Mensagem de cobrança (botão "Copiar mensagem")

```
Oi, {primeiro nome}! Tudo bem?

Sobre o pagamento das horas da Copa (jogo do Brasil em 29/06):
• Valor devido: {devido}
• Extras desde 01/07: +{extras}
• Atrasos desde 01/07: -{atrasos}
• Compensado até {data de referência formatada}: {+/-}{compensado}
• Falta pagar: {falta pagar, nunca negativo}
```

---

## Checklist de implementação

- [ ] Nova tela no admin PHP (`chavesnamao_novo`) — não precisa reaproveitar visual React, seguir padrão do admin
- [ ] Fonte de colaboradores ativos com CPF (Convenia ou equivalente já existente no admin)
- [ ] Credenciais do Secullum configuradas no admin (usuário, senha, ID do banco) — mesmo fluxo de autenticação OAuth2 descrito acima
- [ ] Consultar `/Batidas` (não `/Calcular`) por colaborador, período 29/06 até data de referência
- [ ] Implementar a regra de cálculo completa (carga esperada via `Memoria*`, trabalhado via batida real, tolerância de 10min da CLT, corte de 01/07 pra extras/atrasos, falta pagar sempre 0 quando devido = 0 — armadilha #7)
- [ ] Pular dias com `Folga`/`Neutro`/`NBanco` = true
- [ ] Lista de exclusão de colaboradores que não batem ponto (começar com Alex Galvão Borges, CPF `05464225943`; deixar fácil de adicionar mais)
- [ ] KPIs: colaboradores, pendentes, quitados, sem registro, erros — clicáveis como filtro de status
- [ ] Busca por nome/CPF (cuidado com a armadilha #5 — string vazia no filtro de CPF)
- [ ] Filtro "deve mais de X horas/minutos"
- [ ] Paginação (sugestão: 20/página)
- [ ] Botão "Tentar novamente" por linha em caso de erro de consulta
- [ ] Botão "Copiar mensagem" com o template acima, usando o primeiro nome do colaborador
- [ ] Data de referência com padrão D-1 (nunca hoje — armadilha #3)
- [ ] Testar contra o exemplo validado (04:03 / 04:17 / 03:09 / 01:08 / 02:55) e/ou outros colaboradores reais, comparando com o protótipo Next.js rodando em paralelo

---

## Dúvidas / validação

Qualquer dúvida sobre os números (por que tal saldo bate ou não), o protótipo em `Automacoes_CNM` (`/secullum/banco-horas-copa`) pode ser rodado localmente pra comparar lado a lado antes de fechar a implementação — ele já foi validado ponta a ponta contra o `/Calcular` oficial do Secullum e contra mensagens reais que o RH mandou manualmente.
