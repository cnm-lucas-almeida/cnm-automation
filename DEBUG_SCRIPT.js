// 🔍 SCRIPT DE DEBUG - Cole no Console do Navegador (F12)
// Isso vai capturar e exibir todos os logs de verificação de duplicidade

// Criar um log buffer para guardar tudo
window.verificarLogs = [];

// Interceptar console.log
const originalLog = console.log;
console.log = function(...args) {
  const message = args.join(' ');
  if (message.includes('[VERIFICAR_DUPLICIDADE]') || message.includes('[VERIFICAR]')) {
    window.verificarLogs.push({
      timestamp: new Date().toLocaleTimeString(),
      message: message,
      full: args
    });
    
    // Mostrar em tempo real
    originalLog(`%c${message}`, 'color: #FF6B6B; font-weight: bold; font-size: 12px;', ...args.slice(1));
  }
  originalLog(...args);
};

// Função para exibir os logs
window.mostrarLogs = () => {
  console.clear();
  console.log('%c=== LOGS DE VERIFICAÇÃO DE DUPLICIDADE ===', 'color: #4ECDC4; font-weight: bold; font-size: 14px;');
  window.verificarLogs.forEach(log => {
    console.log(`%c[${log.timestamp}] ${log.message}`, 'color: #666; font-size: 11px;');
  });
  console.log(`%cTotal de logs: ${window.verificarLogs.length}`, 'color: #4ECDC4; font-weight: bold;');
};

// Função para exportar logs
window.exportarLogs = () => {
  console.log('%c=== LOGS PARA COMPARTILHAR ===', 'color: #FFD93D; font-weight: bold; font-size: 14px;');
  console.log(JSON.stringify(window.verificarLogs, null, 2));
};

console.log('%c✅ Debug Script Carregado! Use mostrarLogs() ou exportarLogs() para ver os registros', 'color: #51CF66; font-weight: bold; font-size: 12px;');
