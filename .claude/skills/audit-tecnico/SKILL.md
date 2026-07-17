---
name: audit-tecnico
description: Audita a qualidade de resolução dos chamados do GLPI de um técnico específico — lê chamado por chamado (descrição, acompanhamentos, tarefas, solução), classifica cada um numa taxonomia fixa de 5 categorias e responde perguntas extras específicas daquele técnico. Use sempre que o usuário pedir para analisar, auditar ou investigar os chamados resolvidos por uma pessoa específica no GLPI (ex. "analisa os chamados da Fulana", "audita o Beltrano"). Argumento: nome do técnico e, opcionalmente, perguntas extras separadas por ";".
---

Você está fazendo uma auditoria de qualidade de atendimento para UM técnico específico do GLPI. Este skill nasceu da auditoria feita para o Rodrigo Dittmar — a mecânica e a taxonomia daquela análise são fixas e devem se repetir para qualquer técnico. O que muda por invocação são: o nome do técnico e as perguntas extras específicas dessa pessoa (se houver).

## Uso esperado

`/audit-tecnico <nome do técnico> [; perguntas extras separadas por ponto e vírgula]`

Exemplos:
- `/audit-tecnico Rodrigo Dittmar` → só a base fixa.
- `/audit-tecnico Ana Paula; ela escala demais pra outros squads? o tempo de primeira resposta é maior que o dos outros?` → base fixa + essas 2 perguntas extras respondidas com os mesmos dados.

Se o usuário chamar o skill em linguagem natural em vez do comando (ex. "audita os chamados do fulano, quero saber se..."), trate a primeira parte como nome e o resto como perguntas extras, mesma lógica.

## Passo 1 — Identificar o técnico

Use o agente `glpi-analyst` (via Agent tool) para achar o `id` do usuário GLPI cujo nome bate com o informado (`GET /User?range=0-9999`, comparar firstname+realname+name, case-insensitive, aceitar match parcial). Se houver mais de um resultado plausível, pare e pergunte ao usuário qual é (não adivinhe entre pessoas homônimas).

## Passo 2 — Levantar os chamados resolvidos por ele

Via `glpi-analyst`, busque em `search/Ticket` com `criteria[field]=5` (técnico atribuído) `=id` e `criteria[field]=12` (status) `=old` (resolvido+fechado), trazendo `forcedisplay` para id (2), nome (1), status (12), data abertura (15), data solução (17), grupo (8). Esse é o universo de chamados a auditar. Informe ao usuário quantos chamados foram encontrados antes de continuar se for um número muito grande (>150) — pergunte se ele quer o período recortado.

## Passo 3 — Ler cada chamado por completo, em paralelo, fora do contexto principal

Para cada chamado, é preciso ler: descrição do chamado, todos os `ITILFollowup` (públicos e privados), `TicketTask` e `ITILSolution`. Isso é o que revela o que de fato aconteceu — nunca classifique só pelo título ou pelo status.

Não leia os 65+ chamados um por um no laço principal (é assim que a auditoria do Rodrigo consumiu contexto). Em vez disso:
1. Divida a lista de chamados em lotes de ~15–20.
2. Dispare um `Agent` (subagent_type `glpi-analyst` ou `general-purpose`) por lote, em paralelo (todas as chamadas do `Agent` na mesma mensagem).
3. O prompt de cada agente deve: (a) buscar `/Ticket/{id}`, `/Ticket/{id}/ITILFollowup`, `/Ticket/{id}/TicketTask`, `/Ticket/{id}/ITILSolution` para cada ID do lote; (b) aplicar a taxonomia da seção abaixo; (c) devolver como texto final um JSON array — um objeto por chamado — com `{id, titulo, categoria, nota, autor_real}` (`autor_real` só quando `categoria` for `outro_resolveu`, com o nome de quem de fato resolveu). Nada de prosa antes/depois do JSON.
4. Depois que todos os lotes voltarem, junte os arrays num só. Esse conjunto consolidado é a fonte de verdade tanto para as perguntas fixas quanto para as extras — não peça pros agentes reler nada de novo para responder as perguntas extras, a menos que a pergunta exija um dado que não foi capturado no passo 3 (nesse caso, ajuste o prompt dos agentes antes de rodar).

## Taxonomia fixa (sempre aplicada, não muda entre técnicos)

- **`tecnico`** — Correção técnica real: SQL, deploy, script, ajuste de configuração/infra. Conta mesmo que a execução tenha sido delegada (ex. um DBA rodou a query), desde que o técnico auditado tenha identificado e especificado a correção.
- **`operacional`** — Ação manual real dentro do próprio sistema (corrigir cadastro, reprocessar algo, liberar acesso) que resolveu o problema, mas não é código/SQL.
- **`duvida`** — Só explicação/orientação. Nenhuma ação de correção foi necessária ou realizada (ex. "isso é assim mesmo", causa é externa/do cliente).
- **`outro_resolveu`** — A solução (`ITILSolution`) foi assinada por outra pessoa, OU os acompanhamentos mostram outra pessoa fazendo o diagnóstico/correção real enquanto o técnico auditado só relatou, aprovou ou fechou o chamado em seu nome. Sempre registrar quem resolveu de fato.
- **`sem_resolucao`** — Fechado sem resolver nada de fato: falta de retorno do cliente, dado obrigatório ausente, duplicidade, chamado inválido.

Ao final, uma linha de cada chamado deve caber num desses 5 baldes — se estiver em dúvida entre dois, escolha pelo que efetivamente resolveu o problema do cliente, não pela intenção.

## Passo 4 — Perguntas extras (se houver)

Se o usuário passou perguntas específicas, responda cada uma usando o conjunto consolidado do passo 3 (texto bruto dos followups/soluções, não só as categorias). Essas perguntas não têm taxonomia fixa — sintetize da forma que melhor responder, com números concretos e 2–3 exemplos de chamado (`#id`) por afirmação, do mesmo jeito que a base fixa faz.

## Passo 5 — Relatório em Artifact, usando o template do CNM Design System

Use `.claude/skills/audit-tecnico/template.html`, nesta mesma pasta, como esqueleto — ele já tem os tokens de cor/tipografia/espaçamento do design system da Chaves na Mão e a estrutura (header, stat cards, barra empilhada, perguntas, tabela agrupada por categoria, conclusão). Para cada auditoria:

1. Copie o template para o scratchpad da sessão com um nome único por técnico (ex. `auditoria-<slug-do-nome>.html`) — nunca sobrescreva o relatório de outro técnico.
2. Preencha os placeholders marcados com comentários `<!-- ... -->`: nome do técnico, período, squad/grupo, contagens do painel, e o array `TICKETS` no `<script>` com os dados reais do passo 3.
3. Se houve perguntas extras, preencha a seção "Perguntas específicas" (ela é opcional no template — remova o bloco inteiro se não houver perguntas extras nessa rodada).
4. Escreva uma conclusão nova baseada nos achados reais dessa pessoa — não reaproveite a conclusão do Rodrigo, ela foi escrita para o caso dele.
5. Publique com `Artifact` (favicon 🔍, `description` mencionando o nome do técnico). Se for uma reauditoria da mesma pessoa mais tarde, reaproveite a URL existente passando `url`; senão é uma Artifact nova.

## Ao responder

Traga números e exemplos concretos (contagem por categoria, % do total, 2–3 `#id` de chamado por afirmação) — nunca só a impressão geral. Se o volume de chamados for pequeno (menos de ~10), diga isso explicitamente: a amostra é pequena demais para conclusões fortes.
