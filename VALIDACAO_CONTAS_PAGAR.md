# 🔍 Validação de Contas a Pagar - Documentação

## O Que É?

A funcionalidade de **Validação de Contas a Pagar** permite que você importe uma planilha de pagamentos retroativos e o sistema **automaticamente valida se o título já existe no Omie**.

Se o título já estiver cadastrado no Omie, o sistema detecta isso e oferece a opção de **apenas lançar o pagamento**, sem duplicar o registro.

---

## 🎯 Casos de Uso

### Caso 1: Título Novo ✅
- **O que acontece**: O sistema não encontra o título no Omie
- **Ação necessária**: Importar normalmente (criar o título + lançar o pagamento)
- **Status na tela**: "Novos" (verde/indigo)

### Caso 2: Título Já Existe - Não Pago 📋
- **O que acontece**: O sistema encontra o título em **ABERTO** no Omie
- **Ação necessária**: **Apenas lançar o pagamento** (a planilha fornecerá a data)
- **Status na tela**: "Já Cadastrados" (amarelo) - com botão "Lançar Pagamento"
- **Benefício**: Evita duplicação e usa o título existente

### Caso 3: Título Já Existe - Já Pago ❌
- **O que acontece**: O sistema encontra o título **JÁ LIQUIDADO** no Omie
- **Ação necessária**: Nenhuma (não é possível lançar novamente)
- **Status na tela**: "Erros" (vermelho)
- **Mensagem**: "Duplicado e Pago - Não é possível lançar novamente"

---

## 📊 Como Funciona a Validação

O sistema busca títulos no Omie usando **três critérios**:

| Critério | Detalhe |
|----------|---------|
| **Fornecedor** | Deve ser o mesmo cliente |
| **Valor** | Margem de até **R$ 0,01** |
| **Data de Vencimento** | Janela de **±3 dias** |
| **NF (opcional)** | Se fornecida, tenta matching por número da nota |

### Exemplo:
- **Planilha**: Fornecedor A, R$ 1.000,00, Vencimento 15/01/2026
- **Omie**: Busca registros do Fornecedor A com valor entre R$ 999,99 e R$ 1.000,01, vencimento entre 12/01 e 18/01
- **Resultado**: Se encontrar, marca como "Já Cadastrado"

---

## 🚀 Como Usar

### Passo 1: Prepare sua Planilha
A planilha deve conter as seguintes colunas:

```
| NOMEFORNECEDOR | Nº NF | Dt NF | HISTÓRICO | Vencimento | PGTO | Saída | Bancos |
|---|---|---|---|---|---|---|---|
| Fornecedor X | 1001 | 01/01/2026 | Descrição | 15/01/2026 | 20/01/2026 | 1000.00 | Banco Y |
```

**Campos obrigatórios:**
- `NOMEFORNECEDOR` - Nome do fornecedor/cliente
- `Saída` ou `Valor` - Valor do pagamento
- `Vencimento` - Data de vencimento
- `PGTO` - Data do pagamento (usada para lançar no Omie)

**Campos opcionais:**
- `Nº NF` - Número da nota fiscal
- `HISTÓRICO` - Descrição/histórico
- `Bancos` - Banco para auto-preencher a conta corrente

### Passo 2: Upload da Planilha
1. Clique em **"Selecionar Arquivo"**
2. Escolha seu arquivo Excel (.xlsx)
3. Se houver senha, preencha o campo "Senha da Planilha"
4. O sistema automaticamente:
   - Lê os dados
   - Vincula os fornecedores ao Omie
   - **Valida se os títulos já existem**

### Passo 3: Revisar os Resultados

Na tabela, você verá um resumo com 4 colunas de status:

```
┌─────────────────────────────────────────────────────────┐
│ Novos: 5     │ Já Cadastrados: 3     │ Processados: 0     │ Erros: 0 │
│ Aguardando   │ Aguardando pagamento  │ Finalizados        │ Requerem │
│ importação   │                       │ com sucesso        │ revisão  │
└─────────────────────────────────────────────────────────┘
```

### Passo 4: Processar

#### Para títulos NOVOS:
- Clique em **"Importar"** → Sistema cria o título + lança o pagamento

#### Para títulos JÁ CADASTRADOS:
- Clique em **"Lançar Pagamento"** → Sistema usa o título existente e apenas registra o pagamento

#### Para títulos com ERRO:
- Revise o motivo do erro
- Faça ajustes se necessário
- Clique em **"Tentar Novamente"**

### Passo 5: Processamento em Lote
1. Quando tudo está pronto, clique em **"Iniciar Importação"**
2. O sistema processa todos os registros automaticamente
3. Você pode acompanhar o progresso em tempo real

---

## 📋 Estados de Status

| Status | Cor | Significado | Ação |
|--------|-----|-------------|------|
| **Pendente** | Cinza | Aguardando ação do usuário | Preencher dados ou importar |
| **Já Cadastrados** | Amarelo | Título existe em aberto no Omie | Clique em "Lançar Pagamento" |
| **Processando** | Azul | Sendo processado | Aguarde |
| **Sucesso** | Verde | Importado/Processado com sucesso | ID visível no status |
| **Duplicado e Pago** | Vermelho | Título já liquidado no Omie | Nenhuma ação (informativo) |
| **Erro** | Vermelho | Erro na importação | Revise ou tente novamente |

---

## 🔧 Troubleshooting

### Problema: "Fornecedor não encontrado no Omie"
**Solução**: 
- Clique no campo de fornecedor
- Digite parte do nome ou CNPJ
- Selecione na lista de sugestões

### Problema: "Categoria não preenche automaticamente"
**Solução**:
- Clique no campo de categoria
- Escolha a categoria apropriada manualmente

### Problema: "Titulo marcado como já pago, mas achei que era novo"
**Solução**:
- Significa que existe um registro no Omie com:
  - Mesmo fornecedor
  - Valor aproximado (±R$ 0,01)
  - Data de vencimento próxima (±3 dias)
- Verifique no Omie se o lançamento está realmente liquidado

### Problema: "Quero forçar a criação de um novo título mesmo que exista duplicado"
**Solução**:
- Isso não é possível por segurança
- Se o título está em aberto, use "Lançar Pagamento" para atualizá-lo
- Se quer um novo título, altere o valor ou data de forma a não coincidir

---

## 💡 Dicas e Boas Práticas

1. **Use a função "Vincular Automaticamente"** para auto-preencher fornecedores quando possível

2. **Exporte o Log CSV** antes de processar para ter um registro de tudo que foi feito

3. **Verifique o resumo visual** antes de clicar em "Iniciar Importação"

4. **Para títulos duplicados**, o sistema automaticamente oferece a opção de apenas lançar o pagamento - isso evita erros

5. **Se houver muitos erros**, revise sua planilha:
   - Verifique nomes de fornecedores (diferenças pequenas podem impedir matching)
   - Certifique-se de que os bancos estão preenchidos corretamente
   - Valide as datas (formato DD/MM/YYYY)

---

## ✅ Fluxo Completo Resumido

```
1. Upload da Planilha
        ↓
2. Sistema busca Fornecedores no Omie
        ↓
3. Sistema VALIDA cada registro:
   ├─ Novo? → Status "PENDENTE" (será importado)
   ├─ Já existe em aberto? → Status "LANCAR_PAGAMENTO" (só pagamento)
   └─ Já existe pago? → Status "ERRO" (informativo)
        ↓
4. Resumo Visual mostra quantidade de cada tipo
        ↓
5. Clique em "Iniciar Importação"
        ↓
6. Sistema processa:
   ├─ Novos: Inclui + Lança Pagamento
   └─ Duplicados em aberto: Apenas lança pagamento
        ↓
7. Sucesso! Títulos importados/pagamentos lançados no Omie
```

---

## 📞 Precisa de Ajuda?

Se encontrar problemas ou dúvidas, verifique:
- ✅ Os dados da planilha estão preenchidos corretamente
- ✅ Os fornecedores existem no Omie (busque manualmente se necessário)
- ✅ As datas estão no formato DD/MM/YYYY
- ✅ Os valores não têm símbolos de moeda
- ✅ O banco está selecionado (se necessário)
