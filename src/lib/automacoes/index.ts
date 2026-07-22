import { getMetasPool } from '@/lib/db-metas';

export type StatusAutomacao = 'ativo' | 'planejado' | 'pausado';

export type Automacao = {
  id: number;
  iniciativa: string;
  descricao: string | null;
  setor: string;
  sistema: string;
  salarioImpostos: number;
  horasMes: number;
  horasManualMes: number;
  horasManualDia: number | null;
  colaboradores: number;
  status: StatusAutomacao;
  responsavel: string | null;
  custoHora: number;
  ganhoPorPessoa: number;
  ganhoTotalMensal: number;
  ganhoHorasMensal: number;
  ganhoTotalAnual: number;
  ganhoHorasAnual: number;
  createdAt: string;
  updatedAt: string;
};

function mapRow(r: any): Automacao {
  const salarioImpostos = Number(r.salario_impostos);
  const horasMes = Number(r.horas_mes);
  const horasManualMes = Number(r.horas_manual_mes);
  const colaboradores = Number(r.colaboradores);

  const custoHora = horasMes > 0 ? salarioImpostos / horasMes : 0;
  const ganhoPorPessoa = custoHora * horasManualMes;
  const ganhoTotalMensal = ganhoPorPessoa * colaboradores;
  const ganhoHorasMensal = horasManualMes * colaboradores;

  return {
    id: r.id,
    iniciativa: r.iniciativa,
    descricao: r.descricao,
    setor: r.setor,
    sistema: r.sistema,
    salarioImpostos,
    horasMes,
    horasManualMes,
    horasManualDia: r.horas_manual_dia !== null && r.horas_manual_dia !== undefined ? Number(r.horas_manual_dia) : null,
    colaboradores,
    status: r.status,
    responsavel: r.responsavel,
    custoHora,
    ganhoPorPessoa,
    ganhoTotalMensal,
    ganhoHorasMensal,
    ganhoTotalAnual: ganhoTotalMensal * 12,
    ganhoHorasAnual: ganhoHorasMensal * 12,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listarAutomacoes(): Promise<Automacao[]> {
  const pool = getMetasPool();
  const { rows } = await pool.query('SELECT * FROM automacoes_iniciativas ORDER BY setor, iniciativa');
  return rows.map(mapRow);
}

export type SalvarAutomacaoInput = {
  iniciativa: string;
  descricao: string | null;
  setor: string;
  sistema: string;
  salarioImpostos: number;
  horasMes: number;
  horasManualMes: number;
  horasManualDia: number | null;
  colaboradores: number;
  status: StatusAutomacao;
  responsavel: string | null;
};

export async function criarAutomacao(input: SalvarAutomacaoInput): Promise<Automacao> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `INSERT INTO automacoes_iniciativas
       (iniciativa, descricao, setor, sistema, salario_impostos, horas_mes, horas_manual_mes, horas_manual_dia, colaboradores, status, responsavel)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      input.iniciativa,
      input.descricao,
      input.setor,
      input.sistema,
      input.salarioImpostos,
      input.horasMes,
      input.horasManualMes,
      input.horasManualDia,
      input.colaboradores,
      input.status,
      input.responsavel,
    ]
  );
  return mapRow(rows[0]);
}

export async function atualizarAutomacao(id: number, input: SalvarAutomacaoInput): Promise<Automacao | null> {
  const pool = getMetasPool();
  const { rows } = await pool.query(
    `UPDATE automacoes_iniciativas
     SET iniciativa = $1, descricao = $2, setor = $3, sistema = $4, salario_impostos = $5, horas_mes = $6,
         horas_manual_mes = $7, horas_manual_dia = $8, colaboradores = $9, status = $10, responsavel = $11, updated_at = now()
     WHERE id = $12
     RETURNING *`,
    [
      input.iniciativa,
      input.descricao,
      input.setor,
      input.sistema,
      input.salarioImpostos,
      input.horasMes,
      input.horasManualMes,
      input.horasManualDia,
      input.colaboradores,
      input.status,
      input.responsavel,
      id,
    ]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function excluirAutomacao(id: number): Promise<boolean> {
  const pool = getMetasPool();
  const { rowCount } = await pool.query('DELETE FROM automacoes_iniciativas WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
