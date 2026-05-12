# 🔍 Guia de Debug - Validação de Contas a Pagar

## Problema: Títulos não são encontrados como duplicados

Você carregou um título que já existe no Omie, mas o sistema não detecta como duplicado.

---

## ✅ Passos para Debugar

### 1. Abra as Ferramentas de Desenvolvedor
```
Windows/Linux: Pressione F12
Mac: Cmd + Option + I
```

### 2. Vá para a Aba "Console"
- Você verá todos os logs da aplicação ali

### 3. Tente Novamente
- Recarregue a página (F5)
- Faça upload do arquivo ou vincule o fornecedor novamente
- Na aba Console, você verá logs começando com `[VERIFICAR_DUPLICIDADE]`

### 4. Procure pelos Logs
Os logs aparecerão assim no console:

```
[VERIFICAR_DUPLICIDADE] Conversão de valor: {
  original: "64.58",
  valString: "64.58",
  valorNumerico: 64.58,
  tipo: "number",
  ehValido: true
}

[VERIFICAR_DUPLICIDADE] Iniciando verificação: {
  fornecedor: "Procob",
  codigoCliente: 12345,
  valorNumerico: 64.58,
  dataVencimento: "01/01/2026",
  numeroNF: undefined
}

[VERIFICAR_DUPLICIDADE] Resposta recebida: {
  exists: false,
  totalDuplicados: 0,
  resumo: {...},
  duplicados: [],
  debug: {
    total_contas_cliente: 5,
    contas_analisadas: [
      { codigo: 123, valor: 100.00, vencimento: "01/02/2026", status: "ABERTO" },
      { codigo: 124, valor: 64.58, vencimento: "01/01/2026", status: "ABERTO" }
    ]
  }
}
```

---

## 🔍 Checklist de Debug

### O cliente foi encontrado?
```
✓ Se totalDuplicados > 0: SIM, encontrou
✗ Se totalDuplicados === 0: Verificar debug.contas_analisadas
  └─ Se for vazio: Cliente não existe ou código está errado
  └─ Se tiver dados: O problema é nos critérios de valor/data
```

### Critérios de Matching

Para ser considerado duplicado, TODOS estes critérios devem passar:

| Critério | O Que Esperar | Como Verificar |
|----------|------|---------|
| **Valor** | ± R$ 0,01 | `contas_analisadas[].valor` próximo de `valorNumerico` |
| **Data** | ± 3 dias | `contas_analisadas[].vencimento` próximo de `dataVencimento` |
| **Status** | ABERTO ou PAGO | `contas_analisadas[].status` |

### Exemplo de Análise:

```
Você enviou:
  Valor: 64.58
  Data: 01/01/2026

API encontrou:
  [1] Valor: 100.00, Data: 01/02/2026 → ✗ Valor errado
  [2] Valor: 64.58, Data: 01/01/2026 → ✓ DEVERIA FAZER MATCH!
  [3] Valor: 64.50, Data: 02/01/2026 → ✓ Dentro de margem e data!
```

---

## 🆘 Problemas Comuns

### "debug.contas_analisadas vazio"
**Significado**: O cliente não foi encontrado no Omie ou o `codigo_cliente` está errado

**Solução**:
1. Verifique se o fornecedor está vinculado corretamente
2. Abra o Omie e procure manualmente pelo fornecedor
3. Anote o ID do cliente no Omie
4. Crie um console.log no código para verificar o ID que está sendo enviado

```javascript
// Cole no console:
console.log("Clientes com debug:", window.verificarLogs.filter(l => l.message.includes('debug')));
```

### "totalDuplicados === 0, mas vejo contas na lista"
**Significado**: As contas existem, mas não passam nos critérios

**Solução**:
1. Compare manualmente:
   - Valor da planilha com valor do Omie (diferença deve ser ≤ R$ 0,01)
   - Data da planilha com data do Omie (diferença deve ser ≤ 3 dias)

2. Se a diferença for maior, você pode:
   - Ajustar a margem no código (trocar `0.01` por `0.10` para R$ 0,10, por exemplo)
   - Ajustar a janela de dias (trocar `3` por `5` para ± 5 dias)

### "Valor com formatação errada"
**Exemplos**:
- Planilha: `"R$ 64,58"` → Precisa virar `64.58`
- Planilha: `"64,58"` (vírgula) → Precisa virar `64.58`

**O código já trata isso**, mas se ainda houver problema, os logs mostrarão:
```
[VERIFICAR_DUPLICIDADE] Conversão de valor: {
  original: "R$ 64,58",
  valString: "64.58",
  valorNumerico: 64.58,  ← Isso é o que será usado
}
```

---

## 📋 Informações para Compartilhar

Se precisar de ajuda, compartilhe estes dados:

### 1. Copie os Logs
```javascript
// Cole no console:
window.exportarLogs()
// Copie todo o JSON que aparecer
```

### 2. Screenshots Úteis
- Screenshot do registro na sua aplicação
- Screenshot do registro no Omie
- Screenshot do console mostrando os logs

### 3. Informações do Título
```
Planilha:
  Fornecedor: [nome]
  Valor: [R$ XXX,XX]
  Vencimento: [DD/MM/YYYY]
  Código do Cliente no Omie: [número]

Omie (manual):
  Status: [ABERTO/PAGO/ATRASADO]
  Valor: [R$ XXX,XX]
  Vencimento: [DD/MM/YYYY]
  Código do Cliente: [número]
```

---

## 🚀 Próximos Passos

### Se encontrou o problema:
1. Ajuste os critérios no código
2. Teste novamente
3. Tudo funcionando? → Sucesso! 🎉

### Se ainda não funciona:
1. Compartilhe os logs (use `exportarLogs()`)
2. Compartilhe as screenshots
3. Inclua as informações do título
4. Vamos investigar juntos!

---

## 💡 Dica Extra: Auto-Refresh dos Logs

Cole isso no console para monitorar em tempo real:

```javascript
setInterval(() => {
  if (window.verificarLogs.length > 0) {
    const ultimoLog = window.verificarLogs[window.verificarLogs.length - 1];
    console.log(`%c[${ultimoLog.timestamp}] ${ultimoLog.message}`, 'color: #4ECDC4; font-weight: bold;');
  }
}, 500);
```

Isso vai mostrar cada novo log conforme chega!

---

Precisa de mais ajuda? Abra os DevTools (F12) e vamos debugar juntos! 🔍
