# 📋 Análise: Base diária de Fila de Leads

> Documento de trabalho (em construção) para o levantamento do relatório novo "Base diária de Fila de Leads", seguindo o fluxo da skill `novo-relatorio`: análise → plano de produto → aprovação → código. Ainda **não é** o handoff final (`TAREFA_*.md`) — isso só é gerado depois de implementado e aprovado.

## Status

🔄 Em levantamento — usuário está descrevendo as colunas do relatório uma a uma, a partir de um print de tela do admin.

## Referência confirmada

Tela do admin: `https://www.chavesnamao.com.br/admin/gerencia_link_contrato/`

Código real:
- Controller: `application/modules/admin/controllers/gerencia_link_contrato.php`
- Model: `application/models/gerencia_link_contrato_model.php` (métodos `getListPaged` / `getListExport`)
- Render da tabela: `public/js/admin/gerencia_link_contrato.js`

## Mapeamento de colunas (confirmado até agora)

| Coluna do print | Campo(s) | Tabela/origem |
|---|---|---|
| **Coluna 1** (nome PV / imobiliária / UF-cidade-bairro) | `nome_fantasia`, `nome`, `sigla_uf`+`nome_cidade`+`bairro_endereco` | `tb_cliente` + `tb_cidade` + `tb_uf` |
| **Vendedor** | `nome_vendedor` | `tb_vendedor` (via `tb_financeiro_contrato_pre_cadastro.id_vendedor`) |
| **Status** (Cadastro do PV / Criação do Link / Assinatura / Responsável) | `data_contrato_pre_cadastro`, `data_aprovacao` (→"Criação do Link"), `data_assinatura`, `responsavel` | `tb_financeiro_contrato_pre_cadastro` + `tb_gerencia_link_contrato` (glc) + `tb_sys_user` (via `tb_pre_cadastro_alerta`) |
| **Plano** (Fidelidade com N dias bonificados / plano ativo / valor) | `nome_tipo`, `dias_bonificados`, `planoAtivo`, `valor_contrato` | `tb_financeiro_contrato_tipo` + `tb_financeiro_contrato_pre_cadastro`/`tb_financeiro_contrato` |
| **CRM Info** (Cadastro / Conversão / Deal Flow INBOUND-OUTBOUND) | `data_cadastro_contato_pj`, `data_contato_pj`, `titulo_conversao`, `deal_flow_contato_pj` | `tb_contato_pj` (via subquery mais recente em `tb_contrato_conversao` por `id_cliente`) + `crm_channel` |
| **20+** (SIM/NÃO) | `rn <= 20` de um `ROW_NUMBER() OVER (PARTITION BY id_vendedor ORDER BY qtd_estoque_numerico DESC)` | `tb_contato_pj`, filtrado a `deal_status IN ('QUALIFICATION','NEGOTIATION')` e `id_vendedor IS NOT NULL`. Lógica em `contato_pj_model.php::getTwentyMoreStockPerSeller()`, hoje usada na tela `crm_contato_pj` (badge 👑), não na tela `gerencia_link_contrato`. |
| **Ciclo do vendedor** | já implementado no Automacoes_CNM (Inside Sales / Painel mensal) | — |
| **ID do cliente** | `cli.id` | `tb_cliente` |
| **Data e Hora assinatura** | `data_assinatura` (datetime completo) | `tb_gerencia_link_contrato` |
| **Conversão** (planilha chama de "CRM INFO") | `deal_flow_contato_pj === 'OUTBOUND' ? 'Base' : 'Lead'` | `tb_contato_pj.deal_flow` — valores reais confirmados no banco: `NULL` / `'INBOUND'` / `'OUTBOUND'` (sem o texto "Deal Flow: ", isso é só formatação do JS do admin — não precisamos replicar a busca textual da fórmula de planilha) |
| **Estoque** | `qtd_imoveis` (imóvel) / equivalente veículo | `tb_imovel_plano_assinatura` / `tb_veiculo_plano_assinatura`, ligado ao cliente via `tb_imovel_plano_assinatura_cliente` (**plano ATIVO atual**, mesma fonte do texto "Plano 50" já mostrado na coluna Plano) — confirmado com o cliente real do print (ID 1351419 → `qtd_imoveis: 50`, `nome: "Plano 50 com 0 destaques"`). Ver armadilha — **não** é `tb_financeiro_contrato_pre_cadastro.qtd_estoque`/`qtd_imoveis_plano` (correção de uma hipótese anterior errada). |
| **Squad** | `salesperson_id` → `squad_id` (com `started_at`/`finished_at`) | `crm_salesperson_allocation` |
| **Cidade** | `id_cidade` | `tb_cliente` → `tb_cidade`/`tb_uf` (já mapeado na Coluna 1) |
| **Cidades Foco** | ❌ **não existe** — nenhuma tabela/coluna com "foco" no banco, nenhuma referência no admin PHP | precisa criar tela de gestão nova (ver "Perguntas em aberto") |
| **Tipo Base** | derivado (sem fonte própria) — depende de 20+, Conversão, Cidades Foco (a criar) e Estoque; ver fórmula abaixo | — |

> A cor de fundo (vermelho/preto = "Outro"/"FINAL") é lógica de exibição do `status` do link (pendente/revisão/assinado/reprovado) já existente na tela, não é uma coluna de dado nova.

### Fórmula "Tipo Base" (da planilha, a validar o "OK")

```
SE(20+ = "SIM"; "TOP 20";
  SE(Conversão = "Base";
    SE(CidadeFoco = "OK";
      SE(Estoque < 100; "BASE FOCO -100"; "BASE FOCO +100");
      SE(Estoque <= 20; "BASE -20"; "BASE 30+")
    );
    ""
  )
)
```
Pendente confirmar com o usuário: o que exatamente é a checagem "CidadeFoco = OK" (presumo: cidade do cliente está na lista de Cidades Foco a ser criada).

## Filtros/ações já existentes na tela atual (para referência, avaliar o que entra no relatório novo)

- Busca (nome, ID cliente, CPF/CNPJ, e-mail, telefone)
- Status do link (interno/pendente cliente/revisão/agendado/assinado/reprovado)
- Tipo (Imóvel / Veículo / Lançamento)
- Vendedor / Perfil
- Expansão (on/off)
- Dias úteis (on/off)
- Data cadastro (início/fim), Data assinatura (início/fim)
- Exportação Excel (síncrona ou por e-mail para exportações grandes)

## Ainda a levantar

- Próximas colunas que o usuário for descrevendo.
- KPIs desejados.
- Filtros da tela nova (herdar os da tela atual? adicionar algo?).
- Diferença de propósito: "Fila de Leads" parece ser uma visão diferente da tela de gestão de contratos — confirmar com o usuário o que muda de fato (é outra tela, ou é a mesma base com corte/agrupamento diferente?).

## Armadilhas identificadas até agora

- **"20+" não é top 20 clientes com mais estoque no geral.** É top 20 **por vendedor** (`PARTITION BY id_vendedor`), e só considera leads com `deal_status` Qualificação/Negociação. Um cliente pode ter muito estoque e não aparecer como "20+" porque não está mais nesses dois status, ou porque o ranking dele é calculado dentro da carteira do vendedor, não do total da base.
- Coluna "20+" mistura fonte: dado vem de `tb_contato_pj` (tela CRM/leads), enquanto o resto do print vem de `tb_gerencia_link_contrato`+`tb_cliente` — confirma que o relatório novo vai precisar combinar as duas fontes (contratos/PV + CRM leads).
- **Três campos de "estoque" diferentes, não confundir**:
  1. `tb_contato_pj.qtd_estoque_numerico` — autodeclarado pelo lead no CRM, usado só no ranking do "20+".
  2. `tb_financeiro_contrato_pre_cadastro.qtd_estoque`/`qtd_imoveis_plano` — valor no momento do PV/pré-cadastro (pode ficar desatualizado). **Não é a fonte da coluna "Estoque"** — hipótese inicial errada, corrigida depois de validar com dado real.
  3. `tb_imovel_plano_assinatura.qtd_imoveis` (via `tb_imovel_plano_assinatura_cliente`) — plano **ativo atual**, é este que alimenta a coluna "Estoque" e bate com o texto "Plano 50" já exibido. Validado com o cliente real do print (ID 1351419).
- **Cidades Foco não existe no admin** — vai exigir tela de gestão nova (CRUD simples: cidade × foco, ou cidade × squad × foco).

## Perguntas em aberto

- **"Tipo Base" / checagem "CidadeFoco = OK"**: confirmar com o usuário o que exatamente essa checagem representa (presumo: cidade do cliente está cadastrada como Cidade Foco).

---

## ✅ Plano de produto (v1) — aguardando aprovação

### O que é

Tela nova `Base diária de Fila de Leads` no Automacoes_CNM. Não é evolução 1:1 de uma tela existente do admin — é uma **tabela operacional** que cruza duas fontes que hoje vivem separadas (`gerencia_link_contrato` = PV/contrato, `contato_pj`/CRM = lead) mais uma classificação derivada ("Tipo Base") que hoje só existe numa planilha manual com fórmulas. Objetivo: dar ao time de Inside Sales/gestão uma visão diária de prioridade por PV (quem é "TOP 20", "BASE FOCO", etc.), substituindo a planilha.

Rota sugerida: `/fila-leads`.

### Fonte de dados (consolidado)

Ver tabela de mapeamento de colunas acima — resumo das tabelas envolvidas:
`tb_gerencia_link_contrato`, `tb_cliente`, `tb_cidade`, `tb_uf`, `tb_vendedor`, `tb_financeiro_contrato_pre_cadastro`, `tb_financeiro_contrato`, `tb_financeiro_contrato_tipo`, `tb_sys_user`, `tb_pre_cadastro_alerta`, `tb_contato_pj`, `tb_contrato_conversao`, `crm_channel`, `tb_imovel_plano_assinatura`/`tb_veiculo_plano_assinatura` (+ `_cliente`), `crm_salesperson_allocation`, `crm_squad`. Mais uma tabela **nova** para Cidades Foco (ver abaixo).

### Colunas da tabela

Coluna 1 (PV/imobiliária/cidade) · Vendedor · Status (datas + responsável) · Plano · CRM Info (cadastro/conversão/deal flow) · 20+ · Ciclo do vendedor · ID cliente · Data/Hora assinatura · Conversão (Base/Lead) · Estoque · Squad · Cidade · Tipo Base.

### KPIs / visualizações

Nem o print nem a planilha têm KPIs ou gráfico — é uma base tabular linha a linha. **Proposta v1: só tabela + filtros + exportação**, sem cards de KPI. Podemos adicionar depois (ex.: contagem por Tipo Base, por Squad) se fizer sentido no uso real.

### Filtros e ações

Herdados da tela atual: busca (nome/ID/CPF-CNPJ/e-mail/telefone), status do link, tipo (Imóvel/Veículo/Lançamento), vendedor, data de assinatura (período).
Novos, específicos deste relatório: Squad, Ciclo, Tipo Base, 20+ (Sim/Não).
Exportação: CSV (padrão do resto do Automacoes_CNM) — não Excel real, pra manter consistência com as outras telas.

### Cidades Foco — decisão de escopo

Não existe nada disso hoje no admin. Proposta: criar uma tela de gestão simples nova em `/configuracoes/cidades-foco` (CRUD: cidade → é foco ou não, boolean), reaproveitando os componentes de tabela/`Select`/busca já existentes no design system. Sem essa tela, a coluna "Tipo Base" fica errada pra qualquer cliente em "Base" (cai sempre no ramo "não-foco"), então proponho já entrar na v1.

`CidadeFoco = "OK"` na fórmula: assumindo que significa **"a cidade do cliente está marcada como foco"** nessa tela nova. Seguindo esse entendimento a menos que você corrija.

### Armadilhas (consolidado)

1. "20+" é top 20 **por vendedor**, não geral, e só entre leads em Qualificação/Negociação.
2. Duas fontes diferentes por trás do print: contratos/PV (`gerencia_link_contrato`) e CRM leads (`contato_pj`) — junção pelo `id_cliente`.
3. Três campos de "estoque" com nomes parecidos e fontes diferentes — usar `tb_imovel_plano_assinatura.qtd_imoveis`/equivalente veículo (plano ativo) para a coluna "Estoque", nunca os outros dois.
4. "Conversão" pode ser calculada direto do valor raw `deal_flow` (`INBOUND`/`OUTBOUND`), sem precisar buscar texto como a planilha faz.
5. Cidades Foco não existe — é feature nova, não só leitura de dado existente.

### Perguntas em aberto (com sugestão, para não travar o plano)

1. `CidadeFoco = "OK"` — confirmar que é isso mesmo (cidade do cliente marcada como foco na tela nova).
2. Criar a tela de Cidades Foco já nesta v1 (recomendado) ou usar uma lista fixa por enquanto?
3. Tabela pura sem KPI/gráfico (recomendado) ou você quer algum card/resumo no topo?

---

*Assim que aprovado, sigo para o desenvolvimento (`src/lib/fila-leads/`, `src/app/api/fila-leads/route.ts`, `src/app/fila-leads/page.tsx` + tela de Cidades Foco).*
