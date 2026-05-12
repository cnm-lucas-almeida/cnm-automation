# 🚀 Projeto: Omie Validator (Reconciliação Integrada)

## 📋 Visão Geral
O **Omie Validator** é uma aplicação interna desenvolvida em **Next.js** com o objetivo de automatizar e auditar o cruzamento de dados entre os pagamentos registrados no sistema Administrativo do **Chaves na Mão** e os títulos no Contas a Receber do **ERP Omie**.

A ferramenta permite identificar discrepâncias financeiras, localizar títulos faltantes no ERP e realizar a baixa (conciliação) em lote de forma simplificada.

---

## ✨ Principais Funcionalidades

- **Dashboard Financeiro**: Visualização em tempo real do total em aberto, valores já conciliados, pendências de ação e lacunas de registro (itens ausentes no Omie).
- **Gráficos de Status**: Monitoramento visual do progresso da conciliação e saúde financeira do período selecionado.
- **Cruzamento Inteligente**: Algoritmo que vincula automaticamente pagamentos do Admin ao Omie com base em critérios flexíveis.
- **Conciliação em Lote (Bulk Action)**: Possibilidade de selecionar múltiplos títulos e realizar a baixa no Omie com um único clique.
- **Filtros Avançados**: Busca por cliente (Nome/CPF/CNPJ), Número de Nota Fiscal, Valor exato e Forma de Pagamento (Pix, Boleto, Cartão, etc.).
- **Exportação para Excel**: Geração de relatórios detalhados para auditoria externa ou controle administrativo.

---

## 🧠 Lógica de Cruzamento (Matching)
Para garantir a precisão e flexibilidade, o sistema considera um "Match" (Vínculo) quando o **Valor do Pagamento** é correspondente (margem de R$ 0,05) e satisfaz pelo menos uma das seguintes condições:
1. **CPF/CNPJ**: O documento do cliente no Admin é idêntico ao registrado no Omie.
2. **Número da Nota (NF)**: O número do documento fiscal coincide entre os sistemas.

---

## 🛠️ Status Técnico
- **Stack**: Next.js 15, React, TailwindCSS, Lucide React (Ícones), Recharts (Gráficos).
- **Integração**: Consumo direto das APIs de Contas a Receber e Finanças do Omie.
- **Performance**: Implementação de indexação em memória (Maps) para cruzamento ultra-rápido de grandes volumes de dados e carregamento progressivo para lidar com a paginação da API.

---

## 🚀 Como Utilizar
1. Acesse a aplicação localmente (`npm run dev`).
2. Selecione o **período desejado** (Data Inicial e Final).
3. Defina a **Margem de dias** (Offset) para buscar títulos no Omie próximos à data de pagamento.
4. Clique em **"Reconciliar Dados"**.
5. Utilize os filtros para analisar itens "Faltantes" ou "Pendentes" e realize as ações necessárias.

---

## 📈 Próximos Passos
- [ ] Implementar logs de auditoria para ações de conciliação em lote.
- [ ] Adicionar suporte para múltiplos IDs de conta corrente.
- [ ] Interface para correção manual de vínculos em caso de divergências de centavos.

---
*Documentação gerada automaticamente para o time de Desenvolvimento e Financeiro.*
