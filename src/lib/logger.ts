import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

/**
 * Registra uma entrada de log para auditoria de conciliação.
 * Agora salva em arquivos separados por dia (ex: conciliacoes_2024-04-28.csv).
 */
export async function appendLog(data: {
  id_lancamento: string | number;
  valor: number;
  id_baixa?: string | number;
  status: 'SUCESSO' | 'ERRO';
  mensagem?: string;
  nota?: string;
  documento?: string;
}) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const LOG_FILE = path.join(LOG_DIR, `conciliacoes_${today}.csv`);
    // Garante que a pasta logs existe
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    // Se o arquivo não existe, cria com o cabeçalho
    if (!fs.existsSync(LOG_FILE)) {
      const header = 'Data/Hora,ID Lancamento,Documento,Nota,Valor,ID Baixa,Status,Mensagem\n';
      fs.writeFileSync(LOG_FILE, header, 'utf8');
    }

    const now = new Date().toLocaleString('pt-BR');
    const row = [
      now,
      data.id_lancamento,
      data.documento || '-',
      data.nota || '-',
      data.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      data.id_baixa || '-',
      data.status,
      `"${(data.mensagem || '').replace(/"/g, '""')}"` // Escape quotes for CSV
    ].join(',') + '\n';

    fs.appendFileSync(LOG_FILE, row, 'utf8');
  } catch (error) {
    console.error('Falha ao gravar log de auditoria:', error);
  }
}
