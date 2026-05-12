import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStart = searchParams.get('dateStart');
    const dateEnd = searchParams.get('dateEnd');
    
    // Fallback params
    const start = dateStart ? `${dateStart} 00:00:00` : '2026-01-01 00:00:00';
    const end = dateEnd ? `${dateEnd} 23:59:59` : '2026-01-31 23:59:59';
    
    const db = await getDbConnection();

    let query = `
      SELECT 
        SQL_CALC_FOUND_ROWS 
        p.*, 
        c.nfs_manual, c.nome as nome_cliente, c.cpfcnpj, c.nome_fantasia, c.tipo_pessoa, 
        u.name as nome_usuario_adicionou, 
        sum(p.valor) as valor, 
        GROUP_CONCAT(fm.parcela SEPARATOR ' e ') AS parcela,
        count(p.id) as total_pgmts,
        GROUP_CONCAT(IFNULL(DATE_FORMAT(fm.data_vencimento, '%d/%m/%Y'), '0') SEPARATOR '<hr>') AS data_vencimento,
        fc.dia_vencimento, fc.id as id_contrato, fct.nome_tipo, v.nome as consultor,
        if (p.id_empresa = 1 , 'FBS','HT') as razao_social, 
        nfs.data_emissao as data_emissao_nfse, nfs.status as statusNfs, nfs.emissor, 
        card.numero_tid_cartao as numero_cartao_tid,
        coalesce(p.grupo_pagamento, p.id) as agg_col, 
        GROUP_CONCAT(fm.id SEPARATOR '<br><hr>') AS idMensalidade,
        GROUP_CONCAT(fm.observacoes_automaticas SEPARATOR ' <hr> ') AS observacoes_automaticas,
        GROUP_CONCAT(IFNULL(DATE_FORMAT(fm.data_cadastro, '%d/%m/%Y'), '0') SEPARATOR '<hr>') AS data_emissao,
        GROUP_CONCAT(IFNULL(REPLACE(fm.valor_total, '.', ','), '0,00') SEPARATOR '<hr>') AS valor_exibicao,
        GROUP_CONCAT(IFNULL(REPLACE(CASE WHEN fda.id IS NOT NULL THEN 0 ELSE fm.valor_multa END, '.', ','), '0,00') SEPARATOR '<hr>') AS valor_multa,
        GROUP_CONCAT(IFNULL(REPLACE(CASE WHEN fda.id IS NOT NULL THEN 0 ELSE fm.valor_juros END, '.', ','), '0,00') SEPARATOR '<hr>') AS valor_juros,
        CASE 
            WHEN c.tipo_pessoa2 = 'IMOB' THEN 'Imobiliária'
            WHEN c.tipo_pessoa2 = 'CORRETOR' THEN 'Corretor'
            WHEN c.tipo_pessoa2 = 'REVENDA_V' THEN 'Revenda Veículos'
            WHEN c.tipo_pessoa2 = 'REVENDA_VF' THEN 'Revenda Veículos PF'
            ELSE '-'
        END AS descricao_tipo_pessoa,
        GROUP_CONCAT(IFNULL(REPLACE(FORMAT(COALESCE(fm.valor_total, 0) + COALESCE(CASE WHEN fda.id IS NOT NULL THEN 0 ELSE fm.valor_juros END, 0) + COALESCE(CASE WHEN fda.id IS NOT NULL THEN 0 ELSE fm.valor_multa END, 0), 2), '.', ','), 'R$ 0,00') SEPARATOR '<br><hr>') AS valor_total_calculado, 
        COALESCE(nfs.numero_nfs, nfs.id) as numero_nfs,
        nfs.id as nfs_internal_id,
        CASE
            WHEN (p.forma_pagamento = 'boleto' AND bo.txid is null) THEN CONCAT(p.forma_pagamento, '-bb')
            WHEN (p.forma_pagamento = 'boleto' AND bo.txid is not null) THEN CONCAT(p.forma_pagamento, '-bsc')
            ELSE p.forma_pagamento
        END as forma_pagamento
      FROM tb_pagamento p
      JOIN tb_cliente c ON c.id = p.id_cliente
      LEFT JOIN tb_sys_user u ON u.id = p.id_usuario_adicionou
      LEFT JOIN tb_financeiro_mensalidade fm ON fm.id = p.id_mensalidade_cliente
      LEFT JOIN tb_financeiro_desconto_acrescimo fda ON fda.id_contrato = fm.id_contrato 
          AND fda.tipo = 2 
          AND DATE_FORMAT(DATE_ADD(STR_TO_DATE(CONCAT(fm.ano_referencia, '-', fm.mes_referencia, '-01'), '%Y-%m-%d'), INTERVAL 1 MONTH), '%Y-%m') = DATE_FORMAT(STR_TO_DATE(CONCAT(fda.ano_referencia, '-', fda.mes_referencia, '-01'), '%Y-%m-%d'), '%Y-%m') 
          AND fm.valor_juros + fm.valor_multa = fda.valor
      LEFT JOIN tb_financeiro_contrato fc ON fm.id_contrato = fc.id
      LEFT JOIN tb_financeiro_contrato_tipo fct ON fct.id = fc.tipo_contrato
      LEFT JOIN tb_vendedor v ON v.id = fc.id_vendedor
      LEFT JOIN tb_nfs nfs ON p.id_nfs = nfs.id
      LEFT JOIN tb_cartao card ON card.id = p.id_cartao
      LEFT JOIN tb_boleto bo ON bo.id = p.id_boleto
      WHERE
        p.deleted = 0
    `;

    const values: any[] = [];
    if (dateStart && dateEnd) {
      query += ` AND p.data_pagamento >= ? AND p.data_pagamento <= ? `;
      values.push(start, end);
    }
    
    const nota = searchParams.get('nota');
    if (nota) {
      query += ` AND nfs.id = ? `;
      values.push(nota);
    }

    const formaPagamento = searchParams.get('formaPagamento');
    if (formaPagamento) {
      query += ` AND p.forma_pagamento = ? `;
      values.push(formaPagamento);
    }

    query += ` GROUP BY agg_col ORDER BY p.id DESC`;

    const [rows] = await db.execute(query, values);
    await db.end();

    return NextResponse.json({
        data: rows,
        period: { start, end },
    });
  } catch (error: any) {
    console.error("Database query error: ", error);
    return NextResponse.json({ error: String(error), stack: error?.stack }, { status: 500 });
  }
}
