'use client';

import { useState } from 'react';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import { Search, Loader2, CheckCircle2, AlertCircle, HelpCircle, Filter, X, CreditCard, PieChart as PieChartIcon, TrendingUp, DollarSign, FileSpreadsheet } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import * as XLSX from 'xlsx';

type AdminPayment = {
  id: number;
  data_pagamento: string;
  valor: number;
  cpfcnpj: string;
  numero_nfs: string;
  nome_cliente: string;
  forma_pagamento: string;
};

type OmieTitle = {
  codigo_lancamento_omie: number;
  caminho: string; // ex: "Contas a Receber"
  codigo_cliente_fornecedor: number;
  cpf_cnpj_cliente_fornecedor: string;
  data_vencimento: string;
  valor_documento: number;
  numero_documento_fiscal: string;
  status_titulo: string; // PAGO, ABERTO, ATRASADO
  id_conta_corrente?: number;
};

type ReconciledItem = {
  admin: AdminPayment;
  omie: OmieTitle | null;
  status: 'OK' | 'DIFFERENCE' | 'MISSING_IN_OMIE';
  reason?: string;
  processedInSession?: boolean; // Novo campo para rastrear o que foi feito agora
};

export default function Dashboard() {
  const [dateStart, setDateStart] = useState('2026-01-01');
  const [dateEnd, setDateEnd] = useState('2026-01-31');
  const [daysOffset, setDaysOffset] = useState(30);
  const [notaFiscal, setNotaFiscal] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReconciledItem[] | null>(null);
  const [stats, setStats] = useState({ 
    total: 0, 
    ok: 0, 
    missing: 0, 
    diff: 0,
    reconciled: 0, // Já está RECEBIDO no Omie
    pending: 0,    // Vinculado mas está ABERTO/ATRASADO
    valorTotal: 0,
    valorReconciliado: 0,
    valorPendente: 0,
    valorMissing: 0
  });
  const [conciliatingIds, setConciliatingIds] = useState<Record<number, boolean>>({});
  
  // Estados de carregamento progressivo
  const [loadingStage, setLoadingStage] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [omieProgress, setOmieProgress] = useState({ current: 0, total: 0 });
  const [foundCounts, setFoundCounts] = useState({ admin: 0, omie: 0 });
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 100;

  // Filtros da tabela
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterCliente, setFilterCliente] = useState('');
  const [filterNota, setFilterNota] = useState('');
  const [filterValor, setFilterValor] = useState('');
  const [filterFormaPag, setFilterFormaPag] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkCurrent, setBulkCurrent] = useState(0);

  const hasActiveFilters = filterStatus !== 'ALL' || filterCliente || filterNota || filterValor || filterFormaPag;

  const clearFilters = () => {
    setFilterStatus('ALL');
    setFilterCliente('');
    setFilterNota('');
    setFilterValor('');
    setFilterFormaPag('');
    setCurrentPage(1);
  };

  const PENDING_STATUSES = ['ABERTO', 'VENCIDO', 'ATRASADO', 'RECEBER'];

  // Aplica filtros nos dados carregados
  const filteredData = data ? data.filter(item => {
    if (filterStatus === 'PENDING_CONCILIATION') {
      if (item.status !== 'OK') return false;
      const st = item.omie?.status_titulo?.trim().toUpperCase() || '';
      if (!PENDING_STATUSES.includes(st)) return false;
    } else if (filterStatus !== 'ALL' && item.status !== filterStatus) {
      return false;
    }
    
    if (filterCliente && !item.admin.nome_cliente?.toLowerCase().includes(filterCliente.toLowerCase()) && !item.admin.cpfcnpj?.includes(filterCliente)) return false;
    if (filterNota && !item.admin.numero_nfs?.toString().includes(filterNota)) return false;
    if (filterFormaPag && !item.admin.forma_pagamento?.toLowerCase().includes(filterFormaPag.toLowerCase())) return false;
    if (filterValor) {
      const val = Number(filterValor.replace(',', '.'));
      if (!isNaN(val) && Math.abs(Number(item.admin.valor) - val) >= 0.01) return false;
    }
    return true;
  }) : null;

  const fetchDataAndReconcile = async () => {
    setLoading(true);
    setLoadingStage('Iniciando consulta...');
    setLoadingProgress(5);
    setData(null);
    setCurrentPage(1);
    setFoundCounts({ admin: 0, omie: 0 });
    setOmieProgress({ current: 0, total: 0 });

    try {
      // Build params
      const queryParams: any = { dateStart, dateEnd };
      if (notaFiscal.trim() !== '') queryParams.nota = notaFiscal.trim();
      if (formaPagamento) queryParams.formaPagamento = formaPagamento;

      // 1. Fetch DB Admin
      setLoadingStage('Buscando pagamentos no Banco de Dados Admin...');
      setLoadingProgress(10);
      const adminRes = await axios.get('/api/pagamentos', { params: queryParams });
      const adminPayments: AdminPayment[] = adminRes.data.data;
      setFoundCounts(prev => ({ ...prev, admin: adminPayments.length }));
      setLoadingProgress(20);

      // 2. Fetch Omie Progressively
      setLoadingStage('Sincronizando com a API do Omie...');
      
      const oStart = new Date(dateStart);
      oStart.setDate(oStart.getDate() - daysOffset);
      const oEnd = new Date(dateEnd);
      oEnd.setDate(oEnd.getDate() + daysOffset);
      
      const omieParams = { 
        ...queryParams, 
        dateStart: oStart.toISOString().split('T')[0], 
        dateEnd: oEnd.toISOString().split('T')[0],
        page: 1
      };

      // Buscar página 1 para saber o total
      const firstPageRes = await axios.get('/api/omie/contas-receber', { params: omieParams });
      const totalPages = firstPageRes.data.total_de_paginas || 1;
      let allOmieTitles: OmieTitle[] = firstPageRes.data.conta_receber_cadastro || [];
      
      setOmieProgress({ current: 1, total: totalPages });
      setFoundCounts(prev => ({ ...prev, omie: allOmieTitles.length }));

      for (let p = 2; p <= totalPages; p++) {
        setOmieProgress({ current: p, total: totalPages });
        // Calcular progresso Omie (de 20% a 90%)
        const progress = 20 + ((p / totalPages) * 70);
        setLoadingProgress(progress);
        setLoadingStage(`Baixando dados do Omie (Página ${p} de ${totalPages})...`);

        const pageRes = await axios.get('/api/omie/contas-receber', { 
            params: { ...omieParams, page: p } 
        });
        if (pageRes.data.conta_receber_cadastro) {
            allOmieTitles = allOmieTitles.concat(pageRes.data.conta_receber_cadastro);
            setFoundCounts(prev => ({ ...prev, omie: allOmieTitles.length }));
        }
      }

      // 3. Reconcile
      setLoadingStage('Cruzando e validando informações...');
      setLoadingProgress(95);
      
      const cleanDoc = (doc: string) => doc?.replace(/\D/g, '') || '';

      // OTIMIZAÇÃO: Indexar OmieTitles para busca ultra-rápida (O(1))
      const omieByDoc = new Map<string, OmieTitle[]>();
      const omieByNota = new Map<string, OmieTitle[]>();

      allOmieTitles.forEach(tit => {
        const doc = cleanDoc(tit.cpf_cnpj_cliente_fornecedor);
        const nota = tit.numero_documento_fiscal?.toString().trim();
        
        if (doc) {
          if (!omieByDoc.has(doc)) omieByDoc.set(doc, []);
          omieByDoc.get(doc)!.push(tit);
        }
        if (nota) {
          if (!omieByNota.has(nota)) omieByNota.set(nota, []);
          omieByNota.get(nota)!.push(tit);
        }
      });

      let ok = 0; let missing = 0; let diff = 0;
      let reconciledCount = 0; let pendingCount = 0;
      let vTotal = 0; let vRec = 0; let vPen = 0; let vMis = 0;

      const reconciled: ReconciledItem[] = adminPayments.map((adminPay) => {
        const adminDoc = cleanDoc(adminPay.cpfcnpj);
        const adminVal = Number(adminPay.valor) || 0;
        const adminNota = adminPay.numero_nfs?.toString().trim();
        
        vTotal += adminVal;

        // Buscar candidatos usando os índices
        let candidates: OmieTitle[] = [];
        if (adminDoc && omieByDoc.has(adminDoc)) {
          candidates = candidates.concat(omieByDoc.get(adminDoc)!);
        }
        if (adminNota && omieByNota.has(adminNota)) {
          const notaCandidates = omieByNota.get(adminNota)!;
          notaCandidates.forEach(c => {
            if (!candidates.some(existing => existing.codigo_lancamento_omie === c.codigo_lancamento_omie)) {
              candidates.push(c);
            }
          });
        }

        const match = candidates.find(c => Math.abs(adminVal - (Number(c.valor_documento) || 0)) < 0.05);

        if (!match) {
            missing++;
            vMis += adminVal;
            return { admin: adminPay, omie: null, status: 'MISSING_IN_OMIE', reason: 'Não encontrado no Omie sob os critérios de cruzamento.' };
        }

        ok++;
        const st = match.status_titulo?.trim().toUpperCase() || '';
        if (st === 'RECEBIDO' || st === 'PAGO' || st === 'LIQUIDADO') {
          reconciledCount++;
          vRec += adminVal;
        } else if (PENDING_STATUSES.includes(st)) {
          pendingCount++;
          vPen += adminVal;
        }

        return { admin: adminPay, omie: match, status: 'OK' };
      });

      setStats({ 
        total: adminPayments.length, ok, missing, diff,
        reconciled: reconciledCount,
        pending: pendingCount,
        valorTotal: vTotal,
        valorReconciliado: vRec,
        valorPendente: vPen,
        valorMissing: vMis
      });
      setData(reconciled);
    } catch (error: any) {
      console.error("Failed to reconcile:", error);
      alert(`Erro ao processar dados: ${error.message || 'Erro desconhecido'}.`);
    } finally {
      setLoading(false);
    }
  };

  const handleConciliar = async (item: ReconciledItem, isBulk = false) => {
    if (!item.omie) return false;
    
    const id = item.omie.codigo_lancamento_omie;
    if (!isBulk) setConciliatingIds(prev => ({ ...prev, [id]: true }));

    try {
      // Formatar a data para o padrão Omie (DD/MM/YYYY)
      // Usamos substring(0, 10) para garantir que pegamos apenas YYYY-MM-DD mesmo se vier formato ISO
      const dateParts = item.admin.data_pagamento.substring(0, 10).split('-');
      const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

      const res = await axios.post('/api/omie/conciliar', {
        codigo_lancamento: item.omie.codigo_lancamento_omie,
        valor: item.admin.valor,
        data: formattedDate,
        id_conta_corrente: item.omie.id_conta_corrente || 0,
        nota: item.admin.numero_nfs,
        documento: item.admin.cpfcnpj
      });

      if (res.data.success) {
        // Atualizar o status localmente para refletir a mudança sem precisar recarregar tudo
        setData(prev => prev ? prev.map(it => 
          it.omie?.codigo_lancamento_omie === id 
            ? { ...it, processedInSession: true, omie: { ...it.omie!, status_titulo: 'RECEBIDO' } } 
            : it
        ) : null);

        // Atualizar as estatísticas financeiras locais
        setStats(prev => ({
          ...prev,
          reconciled: prev.reconciled + 1,
          pending: prev.pending - 1,
          valorReconciliado: prev.valorReconciliado + Number(item.admin.valor),
          valorPendente: prev.valorPendente - Number(item.admin.valor)
        }));

        if (!isBulk) alert('Título baixado e conciliado com sucesso no Omie!');
        return true;
      }
    } catch (error: any) {
      console.error("Erro ao conciliar:", error);
      if (!isBulk) alert(`Falha na conciliação: ${error.response?.data?.error || error.message}`);
      return false;
    } finally {
      if (!isBulk) setConciliatingIds(prev => ({ ...prev, [id]: false }));
    }
    return false;
  };

  const handleBulkConciliar = async (itemsToProcess?: ReconciledItem[]) => {
    const items = itemsToProcess || filteredData?.filter(item => 
      selectedIds.has(item.omie?.codigo_lancamento_omie || 0) && 
      item.omie && PENDING_STATUSES.includes(item.omie.status_titulo.trim().toUpperCase())
    );

    if (!items || items.length === 0) return;

    if (!confirm(`Deseja conciliar ${items.length} títulos no Omie agora?`)) return;

    setIsBulkProcessing(true);
    setBulkTotal(items.length);
    setBulkCurrent(0);

    for (const item of items) {
      setBulkCurrent(prev => prev + 1);
      // Pequeno delay para não sobrecarregar
      await new Promise(r => setTimeout(r, 300));
      await handleConciliar(item, true);
    }

    setIsBulkProcessing(false);
    setSelectedIds(new Set());
    alert(`Processamento em lote concluído! ${items.length} títulos processados.`);
  };

  const toggleSelectAll = () => {
    const pageItems = (filteredData || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const pendingPageItems = pageItems.filter(item => 
      item.omie && PENDING_STATUSES.includes(item.omie.status_titulo.trim().toUpperCase())
    );
    
    if (pendingPageItems.length === 0) return;

    const allPageSelected = pendingPageItems.every(item => selectedIds.has(item.omie!.codigo_lancamento_omie));
    const newSelected = new Set(selectedIds);

    if (allPageSelected) {
      // Se já estão todos selecionados na página, desmarcamos apenas os desta página
      pendingPageItems.forEach(item => newSelected.delete(item.omie!.codigo_lancamento_omie));
    } else {
      // Caso contrário, marcamos todos os pendentes da página atual
      pendingPageItems.forEach(item => newSelected.add(item.omie!.codigo_lancamento_omie));
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectItem = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleExportExcel = () => {
    if (!data || data.length === 0) return;

    // Se houver filtros, exportar o que está filtrado. Senão, tudo.
    const itemsToExport = filteredData || data;

    const excelData = itemsToExport.map(item => ({
      'Data Pagamento': item.admin.data_pagamento.substring(0, 10),
      'Cliente': item.admin.nome_cliente,
      'CPF/CNPJ': item.admin.cpfcnpj,
      'Valor (Admin)': Number(item.admin.valor),
      'Nota Fiscal': item.admin.numero_nfs || 'N/A',
      'Forma Pagamento': item.admin.forma_pagamento?.replace(/_/g, ' ').toUpperCase() || 'N/A',
      'Status Conciliação': item.status === 'OK' ? 'Vinculado' : item.status === 'MISSING_IN_OMIE' ? 'Faltante no Omie' : 'Divergente',
      'Código Lançamento Omie': item.omie?.codigo_lancamento_omie || 'NÃO ENCONTRADO',
      'Status no Omie': item.omie?.status_titulo || 'N/A',
      'Valor no Omie': item.omie ? Number(item.omie.valor_documento) : 0,
      'Data Vencimento Omie': item.omie?.data_vencimento || 'N/A',
      'Conciliado nesta Sessão?': item.processedInSession ? 'SIM' : 'NÃO'
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reconciliação");

    // Ajustar largura das colunas
    const wscols = [
      {wch: 15}, {wch: 35}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 20}, {wch: 20}, {wch: 25}, {wch: 15}, {wch: 15}, {wch: 20}, {wch: 25}
    ];
    worksheet['!cols'] = wscols;

    const fileName = `Conciliacao_Omie_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-300">
      
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10 p-6 px-10 flex justify-between items-center backdrop-blur-md bg-white/70">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-blue-500 bg-clip-text text-transparent">Omie Reconciliação Integrada</h1>
          <p className="text-sm text-slate-500 mt-1">Comparação banco Admin x ERP Omie</p>
        </div>

        <div className="flex gap-4 items-center">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Data Inicial</label>
              <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="px-3 py-2 bg-slate-100 border-none rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none transition" />
            </div>
            
            <div className="flex items-center text-slate-300 translate-y-3">até</div>

            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Data Final</label>
              <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="px-3 py-2 bg-slate-100 border-none rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none transition" />
            </div>

            <div className="w-px h-10 bg-slate-200 mx-2 mt-4"></div>

            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Margem (dias)</label>
              <input 
                type="number" 
                value={daysOffset} 
                onChange={e => setDaysOffset(Number(e.target.value))} 
                title="Dias para buscar antes e depois no Omie"
                className="px-3 py-2 bg-slate-100 border-none rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none transition w-20" 
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Nota Fiscal (Opcional)</label>
              <input 
                type="text" 
                placeholder="Ex: 12345" 
                value={notaFiscal} 
                onChange={e => setNotaFiscal(e.target.value)} 
                className="px-3 py-2 bg-slate-100 border-none rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none transition w-32" 
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">Forma Pagamento</label>
              <select
                value={formaPagamento}
                onChange={e => setFormaPagamento(e.target.value)}
                className="px-3 py-2 bg-slate-100 border-none rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none transition"
              >
                <option value="">Todas</option>
                <option value="cartao_credito">💳 Cartão de Crédito</option>
                <option value="cartao_debito">💳 Cartão de Débito</option>
                <option value="pix">⚡ PIX</option>
                <option value="boleto">📄 Boleto</option>
                <option value="dinheiro">💵 Dinheiro</option>
                <option value="transferencia">🏦 Transferência</option>
              </select>
            </div>

            <button  
                onClick={fetchDataAndReconcile}
                disabled={loading}
                className="mt-5 ml-4 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium tracking-wide flex items-center gap-2 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {loading ? 'Consultando...' : 'Reconciliar Dados'}
            </button>
        </div>
      </header>

      {/* DASHBOARD CONTENT */}
      <main className="p-6 md:p-10 w-full max-w-[1800px] mx-auto">
        
        {/* STATS WIDGETS */}
        {data && (
            <div className="flex flex-col gap-8 mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* CARDS SUPERIORES */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col items-start gap-1">
                        <div className="flex items-center gap-2 text-slate-500 mb-2">
                          <TrendingUp className="w-4 h-4" />
                          <span className="font-medium tracking-wide text-xs uppercase">Total em Aberto (Admin)</span>
                        </div>
                        <span className="text-3xl font-bold text-slate-800">R$ {stats.valorTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                        <span className="text-sm text-slate-400">{stats.total} pagamentos identificados</span>
                    </div>

                    <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-2xl p-6 shadow-sm border border-emerald-100 flex flex-col items-start gap-1 relative overflow-hidden">
                        <div className="flex items-center gap-2 text-emerald-700 mb-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="font-medium tracking-wide text-xs uppercase">Já Conciliado no Omie</span>
                        </div>
                        <span className="text-3xl font-bold text-emerald-600">R$ {stats.valorReconciliado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                        <span className="text-sm text-emerald-500/70">{stats.reconciled} títulos liquidados</span>
                        <CheckCircle2 className="absolute -right-4 -bottom-4 w-20 h-20 text-emerald-500/10" />
                    </div>

                    <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-2xl p-6 shadow-sm border border-indigo-100 flex flex-col items-start gap-1 relative overflow-hidden">
                        <div className="flex items-center gap-2 text-indigo-700 mb-2">
                          <DollarSign className="w-4 h-4" />
                          <span className="font-medium tracking-wide text-xs uppercase">Pendente de Conciliação</span>
                        </div>
                        <span className="text-3xl font-bold text-indigo-600">R$ {stats.valorPendente.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                        <span className="text-sm text-indigo-500/70">{stats.pending} títulos aguardando ação</span>
                        <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-indigo-500/10 rounded-full" />
                    </div>

                    <div className="bg-gradient-to-br from-rose-50 to-rose-100/50 rounded-2xl p-6 shadow-sm border border-rose-100 flex flex-col items-start gap-1 relative overflow-hidden">
                        <div className="flex items-center gap-2 text-rose-700 mb-2">
                          <AlertCircle className="w-4 h-4" />
                          <span className="font-medium tracking-wide text-xs uppercase">Ausentes no Omie</span>
                        </div>
                        <span className="text-3xl font-bold text-rose-600">R$ {stats.valorMissing.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                        <span className="text-sm text-rose-500/70">{stats.missing} itens não localizados</span>
                        <AlertCircle className="absolute -right-4 -bottom-4 w-20 h-20 text-rose-500/10" />
                    </div>
                </div>

                {/* ÁREA DE GRÁFICOS */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 lg:col-span-1">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                          <PieChartIcon className="w-5 h-5 text-indigo-500" />
                          Status de Processamento
                        </h3>
                        <div className="h-[250px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={[
                                  { name: 'Conciliado', value: stats.reconciled },
                                  { name: 'Pendente', value: stats.pending },
                                  { name: 'Ausente', value: stats.missing },
                                ]}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                <Cell fill="#10b981" /> {/* emerald-500 */}
                                <Cell fill="#4f46e5" /> {/* indigo-600 */}
                                <Cell fill="#f43f5e" /> {/* rose-500 */}
                              </Pie>
                              <Tooltip 
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              />
                              <Legend verticalAlign="bottom" height={36}/>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-100">
                           <div className="flex justify-between items-center text-sm">
                              <span className="text-slate-500">Progresso Geral</span>
                              <span className="font-bold text-indigo-600">{Math.round((stats.reconciled / (stats.total || 1)) * 100)}%</span>
                           </div>
                           <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden">
                              <div 
                                className="bg-indigo-500 h-full transition-all duration-1000" 
                                style={{ width: `${(stats.reconciled / (stats.total || 1)) * 100}%` }}
                              />
                           </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 lg:col-span-2 flex flex-col justify-center">
                        <div className="flex items-center justify-between mb-8">
                          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            Resumo Financeiro do Período
                          </h3>
                          <span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-semibold text-slate-500 uppercase tracking-tighter">Valores Reais (R$)</span>
                        </div>
                        
                        <div className="space-y-6">
                           <div>
                              <div className="flex justify-between text-sm mb-2">
                                <span className="text-slate-600 font-medium">💰 Já Garantido no Omie</span>
                                <span className="text-emerald-600 font-bold">R$ {stats.valorReconciliado.toLocaleString('pt-BR')}</span>
                              </div>
                              <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden">
                                <div className="bg-emerald-500 h-full" style={{ width: `${(stats.valorReconciliado / (stats.valorTotal || 1)) * 100}%` }} />
                              </div>
                           </div>

                           <div>
                              <div className="flex justify-between text-sm mb-2">
                                <span className="text-slate-600 font-medium">⏳ Pendente de Ação Financeira</span>
                                <span className="text-indigo-600 font-bold">R$ {stats.valorPendente.toLocaleString('pt-BR')}</span>
                              </div>
                              <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden">
                                <div className="bg-indigo-500 h-full" style={{ width: `${(stats.valorPendente / (stats.valorTotal || 1)) * 100}%` }} />
                              </div>
                           </div>

                           <div>
                              <div className="flex justify-between text-sm mb-2">
                                <span className="text-slate-600 font-medium">⚠️ Lacuna de Registro (Ausentes)</span>
                                <span className="text-rose-600 font-bold">R$ {stats.valorMissing.toLocaleString('pt-BR')}</span>
                              </div>
                              <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden">
                                <div className="bg-rose-500 h-full" style={{ width: `${(stats.valorMissing / (stats.valorTotal || 1)) * 100}%` }} />
                              </div>
                           </div>
                        </div>

                        <div className="mt-10 grid grid-cols-2 gap-4">
                           <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                              <span className="text-xs text-slate-400 uppercase font-bold block mb-1">Média por Título</span>
                              <span className="text-xl font-bold text-slate-700">R$ {(stats.valorTotal / (stats.total || 1)).toLocaleString('pt-BR', {maximumFractionDigits: 2})}</span>
                           </div>
                           <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                              <span className="text-xs text-indigo-400 uppercase font-bold block mb-1">Potencial de Conciliação</span>
                              <span className="text-xl font-bold text-indigo-700">R$ {stats.valorPendente.toLocaleString('pt-BR')}</span>
                           </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* TABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {data ? (
                <>
                    {/* FILTROS DA TABELA */}
                    <div className="border-b border-slate-200 bg-slate-50/50 px-6 py-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 text-slate-500 text-sm font-medium">
                          <Filter className="w-4 h-4" />
                          Filtros:
                        </div>

                        <select
                          value={filterStatus}
                          onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none transition"
                        >
                          <option value="ALL">Todos os Status</option>
                          <option value="PENDING_CONCILIATION">⚡ Pendentes de Conciliação</option>
                          <option value="OK">✅ Vinculados (Match)</option>
                          <option value="MISSING_IN_OMIE">❌ Ausentes no Omie</option>
                          <option value="DIFFERENCE">⚠️ Divergências</option>
                        </select>

                        {filterStatus === 'PENDING_CONCILIATION' && (filteredData || []).length > 0 && (
                           <button
                             onClick={() => handleBulkConciliar(filteredData!)}
                             className="ml-2 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition flex items-center gap-2 shadow-sm"
                           >
                              <CheckCircle2 className="w-4 h-4" /> Conciliar Todos os {filteredData!.length} Pendentes
                           </button>
                        )}

                        <input
                          type="text"
                          placeholder="Cliente ou CPF/CNPJ"
                          value={filterCliente}
                          onChange={e => { setFilterCliente(e.target.value); setCurrentPage(1); }}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none transition w-48"
                        />

                        <input
                          type="text"
                          placeholder="Nº Nota Fiscal"
                          value={filterNota}
                          onChange={e => { setFilterNota(e.target.value); setCurrentPage(1); }}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none transition w-36"
                        />

                        <input
                          type="text"
                          placeholder="Valor (ex: 150.00)"
                          value={filterValor}
                          onChange={e => { setFilterValor(e.target.value); setCurrentPage(1); }}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none transition w-36"
                        />

                        <select
                          value={filterFormaPag}
                          onChange={e => { setFilterFormaPag(e.target.value); setCurrentPage(1); }}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 outline-none transition"
                        >
                          <option value="">Todas Formas Pgto</option>
                          <option value="cartao_credito">💳 Cartão Crédito</option>
                          <option value="cartao_debito">💳 Cartão Débito</option>
                          <option value="pix">⚡ PIX</option>
                          <option value="boleto">📄 Boleto</option>
                          <option value="dinheiro">💵 Dinheiro</option>
                          <option value="transferencia">🏦 Transferência</option>
                        </select>

                        {hasActiveFilters && (
                          <button
                            onClick={clearFilters}
                            className="ml-1 px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-sm font-medium hover:bg-rose-100 transition flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" /> Limpar
                          </button>
                        )}

                        <button
                          onClick={handleExportExcel}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow-sm transition-all active:scale-95 flex items-center gap-2"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          Exportar Excel
                        </button>

                        {filteredData && (
                          <span className="ml-auto text-xs text-slate-400">
                            {filteredData.length} de {data.length} registros
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 w-10">
                                      <input 
                                        type="checkbox" 
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        checked={(() => {
                                          const pageItems = (filteredData || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
                                          const pendingPageItems = pageItems.filter(item => 
                                            item.omie && PENDING_STATUSES.includes(item.omie.status_titulo.trim().toUpperCase())
                                          );
                                          return pendingPageItems.length > 0 && pendingPageItems.every(item => selectedIds.has(item.omie!.codigo_lancamento_omie));
                                        })()}
                                        onChange={toggleSelectAll}
                                      />
                                    </th>
                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 font-semibold">Cliente (Admin)</th>
                                    <th className="px-6 py-4 font-semibold">Nota / Documento (Admin)</th>
                                    <th className="px-6 py-4 font-semibold">Forma Pgto</th>
                                    <th className="px-6 py-4 font-semibold">Valor (Admin)</th>
                                    <th className="px-6 py-4 font-semibold border-l border-slate-200">Correspondente Omie</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {(filteredData || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((item, i) => (
                                    <tr key={i} className={`hover:bg-slate-50/70 transition-colors ${selectedIds.has(item.omie?.codigo_lancamento_omie || 0) ? 'bg-indigo-50/30' : ''}`}>
                                        <td className="px-6 py-4">
                                          {item.omie && PENDING_STATUSES.includes(item.omie.status_titulo.trim().toUpperCase()) && (
                                            <input 
                                              type="checkbox" 
                                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                              checked={selectedIds.has(item.omie.codigo_lancamento_omie)}
                                              onChange={() => toggleSelectItem(item.omie!.codigo_lancamento_omie)}
                                            />
                                          )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {item.status === 'OK' && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5"/> Vinculado</span>}
                                            {item.status === 'MISSING_IN_OMIE' && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700"><AlertCircle className="w-3.5 h-3.5"/> Faltante</span>}
                                            {item.status === 'DIFFERENCE' && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><HelpCircle className="w-3.5 h-3.5"/> Divergência</span>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-slate-800">{item.admin.nome_cliente || 'Sem nome'}</div>
                                            <div className="text-xs text-slate-400 mt-0.5">{item.admin.cpfcnpj}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-slate-600">NF: {item.admin.numero_nfs || 'N/A'}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                                              item.admin.forma_pagamento?.includes('cartao') ? 'bg-violet-100 text-violet-700' :
                                              item.admin.forma_pagamento === 'pix' ? 'bg-teal-100 text-teal-700' :
                                              item.admin.forma_pagamento?.includes('boleto') ? 'bg-amber-100 text-amber-700' :
                                              item.admin.forma_pagamento === 'dinheiro' ? 'bg-green-100 text-green-700' :
                                              item.admin.forma_pagamento === 'transferencia' ? 'bg-blue-100 text-blue-700' :
                                              'bg-slate-100 text-slate-600'
                                            }`}>
                                              {item.admin.forma_pagamento?.includes('cartao') && <CreditCard className="w-3 h-3" />}
                                              {item.admin.forma_pagamento ? item.admin.forma_pagamento.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-slate-700">R$ {Number(item.admin.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
                                        </td>
                                        <td className="px-6 py-4 border-l border-slate-100 bg-slate-50/30">
                                            {item.omie ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="font-medium text-slate-800">Cód: {item.omie.codigo_lancamento_omie} <span className="text-slate-400 font-normal">({item.omie.status_titulo})</span></div>
                                                    <div className="text-xs text-slate-500">Val: R$ {item.omie.valor_documento?.toLocaleString('pt-BR', {minimumFractionDigits:2})} | Venc: {item.omie.data_vencimento}</div>
                                                    
                                                    {/* BOTÃO DE CONCILIAR */}
                                                    {PENDING_STATUSES.includes(item.omie.status_titulo.trim().toUpperCase()) && (
                                                      <button
                                                        onClick={() => handleConciliar(item)}
                                                        disabled={conciliatingIds[item.omie.codigo_lancamento_omie]}
                                                        className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-600 rounded-lg text-sm font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                                      >
                                                        {conciliatingIds[item.omie.codigo_lancamento_omie] ? (
                                                          <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                          <CheckCircle2 className="w-4 h-4" />
                                                        )}
                                                        {conciliatingIds[item.omie.codigo_lancamento_omie] ? 'Processando...' : 'Baixar e Conciliar'}
                                                      </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 italic text-xs">Nenhum título equivalente no Omie</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {(filteredData || []).length === 0 && (
                            <div className="p-12 text-center text-slate-500">
                              {hasActiveFilters ? 'Nenhum resultado encontrado com os filtros aplicados.' : 'Nenhum pagamento encontrado para o período.'}
                            </div>
                        )}
                    </div>
                    
                    {/* PAGINATION CONTROLS */}
                    {filteredData && filteredData.length > itemsPerPage && (
                        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 flex items-center justify-between">
                            <span className="text-sm text-slate-500">
                                Mostrando <span className="font-medium text-slate-800">{(currentPage - 1) * itemsPerPage + 1}</span> a <span className="font-medium text-slate-800">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> de <span className="font-medium text-slate-800">{filteredData.length}</span> resultados
                            </span>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                >
                                    Anterior
                                </button>
                                <button 
                                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredData.length / itemsPerPage), p + 1))}
                                    disabled={currentPage === Math.ceil(filteredData.length / itemsPerPage)}
                                    className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 bg-white hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                >
                                    Próxima
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="p-20 flex flex-col items-center justify-center text-slate-400 gap-4">
                    {loading ? (
                        <>
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                            <span>Buscando e cruzando pagamentos...</span>
                        </>
                    ) : (
                        <>
                            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                                <Search className="w-6 h-6 text-slate-300" />
                            </div>
                            <span className="text-lg font-medium text-slate-500">Selecione as datas para começar a validação</span>
                            <span className="text-sm">Os dados serão buscados diretamente no seu BD do Admin e na conta Omie.</span>
                        </>
                    )}
                </div>
            )}
        </div>

      </main>

      {/* FLOATING ACTION BAR FOR BULK ACTIONS */}
      {selectedIds.size > 0 && !isBulkProcessing && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-8 py-4 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-8 animate-in slide-in-from-bottom-10">
          <div className="flex flex-col">
            <span className="text-xs text-slate-400 uppercase font-bold tracking-widest">Selecionados</span>
            <span className="text-lg font-bold">{selectedIds.size} títulos para conciliar</span>
          </div>
          <div className="h-10 w-px bg-slate-700"></div>
          <div className="flex gap-4">
             <button 
                onClick={() => setSelectedIds(new Set())}
                className="px-4 py-2 text-sm font-medium hover:text-slate-300 transition"
             >
                Cancelar
             </button>
             <button 
                onClick={() => handleBulkConciliar()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition active:scale-95"
             >
                <CheckCircle2 className="w-5 h-5" /> Conciliar Agora no Omie
             </button>
          </div>
        </div>
      )}

      {/* PROGRESS OVERLAY FOR BULK PROCESSING */}
      {isBulkProcessing && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6">
           <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
              <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-6" />
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Conciliando em Lote</h2>
              <p className="text-slate-500 mb-8">Processando títulos no Omie. Por favor, não feche esta aba.</p>
              
              <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden mb-4">
                 <div 
                   className="bg-indigo-600 h-full transition-all duration-300" 
                   style={{ width: `${(bulkCurrent / bulkTotal) * 100}%` }}
                 />
              </div>
              
              <div className="flex justify-between w-full text-sm font-bold">
                 <span className="text-slate-400">{bulkCurrent} de {bulkTotal}</span>
                 <span className="text-indigo-600">{Math.round((bulkCurrent / bulkTotal) * 100)}%</span>
              </div>
           </div>
        </div>
      )}

      {/* NEW PROGRESSIVE LOADING OVERLAY */}
      {loading && (
        <div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="bg-white rounded-[2rem] p-12 max-w-xl w-full shadow-2xl flex flex-col items-center text-center relative overflow-hidden border border-slate-200">
              {/* Background Glow */}
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/10 blur-[80px] rounded-full"></div>
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-blue-500/10 blur-[80px] rounded-full"></div>

              <div className="relative mb-8">
                <div className="absolute inset-0 bg-indigo-100 rounded-full animate-ping opacity-25"></div>
                <div className="relative bg-white p-4 rounded-full shadow-lg border border-indigo-50">
                   <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                </div>
              </div>

              <h2 className="text-3xl font-black text-slate-800 mb-4 tracking-tight">Sincronizando Dados</h2>
              
              <div className="flex items-center gap-2 mb-8 bg-slate-50 px-4 py-2 rounded-full border border-slate-100">
                 <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
                 <p className="text-slate-600 font-semibold text-sm">{loadingStage}</p>
              </div>

              {/* Progress Bar Container */}
              <div className="w-full space-y-3 mb-10">
                 <div className="w-full bg-slate-100 h-6 rounded-full p-1 border border-slate-200">
                    <div 
                      className="bg-gradient-to-r from-indigo-600 to-blue-500 h-full rounded-full transition-all duration-500 relative" 
                      style={{ width: `${loadingProgress}%` }}
                    >
                       <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                    </div>
                 </div>
                 <div className="flex justify-between items-center text-xs px-2">
                    <span className="text-slate-400 font-bold uppercase tracking-widest">Progresso do Sistema</span>
                    <span className="text-indigo-600 font-black text-lg">{Math.round(loadingProgress)}%</span>
                 </div>
              </div>

              {/* Counter Stats */}
              <div className="grid grid-cols-2 gap-6 w-full">
                 <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-black uppercase block mb-1">Admin Payments</span>
                    <span className="text-2xl font-black text-slate-800">{foundCounts.admin}</span>
                 </div>
                 <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                    <span className="text-[10px] text-indigo-400 font-black uppercase block mb-1">Omie Titles</span>
                    <span className="text-2xl font-black text-indigo-700">{foundCounts.omie}</span>
                 </div>
              </div>

              {omieProgress.total > 0 && (
                <p className="mt-8 text-xs text-slate-400 font-medium">
                  Processando página <span className="text-indigo-600 font-bold">{omieProgress.current}</span> de <span className="font-bold">{omieProgress.total}</span> do ERP Omie
                </p>
              )}
           </div>
        </div>
      )}

    </div>
  );
}
