// Constantes client-safe (sem import de getDbConnection/mysql2) — importáveis
// direto de Client Components. Não importar isso de dentro de index.ts pro
// mesmo caminho reverso; index.ts que importa daqui, nunca o contrário.

export type TipoFechamento = 'MENSAL' | 'SEMANAL' | 'RESCISAO';

// Mapa confirmado em application/models/vendedor_user_model.php (constantes PERFIL_*).
// Perfil 7 aparece em dados reais de produção sem constante mapeada no admin — residual/desconhecido.
export const PERFIL_LABEL: Record<number, string> = {
  0: 'Vendedor',
  1: 'Gestor',
  2: 'Assistente',
  3: 'Atendente',
  4: 'Treinador',
  5: 'SDR',
  6: 'Representante Comercial',
};

export function perfilLabel(perfil: number): string {
  return PERFIL_LABEL[perfil] ?? `Perfil ${perfil}`;
}
