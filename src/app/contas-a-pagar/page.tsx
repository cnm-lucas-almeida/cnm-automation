'use client';

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { 
  UploadCloud, CheckCircle2, AlertCircle, Play, 
  Loader2, Search, FileSpreadsheet, ArrowRight, Wallet 
} from 'lucide-react';

type PlanilhaRow = {
  NOMEFORNECEDOR?: string;
  'Nº NF'?: string | number;
  'Dt NF'?: string;
  HISTÓRICO?: string;
  Vencimento?: string;
  PGTO?: string;
  Entrada?: string;
  Saída?: string | number;
  Bancos?: string;
  'Centro de custo'?: string;
  Observação?: string;
  [key: string]: any;
};

type OmieCategoria = { codigo: string; descricao: string; };
type OmieConta = { id_conta_corrente: number; descricao: string; };
type OmieCliente = { codigo_cliente_omie: number; razao_social: string; nome_fantasia: string; cnpj_cpf: string; };

type RowMapping = {
  internal_id: string;
  original: PlanilhaRow;
  
  // Mapeamentos
  fornecedor_id: number | null;
  fornecedor_nome: string | null;
  fornecedor_doc: string | null;
  categoria_codigo: string | null;
  conta_id: number | null;
  
  status: 'PENDENTE' | 'PROCESSANDO' | 'SUCESSO' | 'ERRO' | 'LANCAR_PAGAMENTO';
  mensagem_erro?: string;
  omie_id_gerado?: number;
  
  // Para auto-match
  sugestoes?: OmieCliente[];
  is_duplicate?: boolean;
  duplicados_info?: string;
};

export default function ContasAPagar() {
  const [rows, setRows] = useState<RowMapping[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [planilhaPassword, setPlanilhaPassword] = useState('031007');
  
  const [categorias, setCategorias] = useState<OmieCategoria[]>([]);
  const [contas, setContas] = useState<OmieConta[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  // Controle do Autocomplete de Fornecedor
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<OmieCliente[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSearchRow, setActiveSearchRow] = useState<string | null>(null);
  const [matchProgress, setMatchProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    async function loadMetadata() {
      try {
        const [catRes, contRes] = await Promise.all([
          axios.get('/api/omie/categorias'),
          axios.get('/api/omie/contas-correntes')
        ]);
        const allCategorias = catRes.data.categoria_cadastro || [];
        const categoriasLimpidas = allCategorias.filter((c: OmieCategoria) => 
            !c.descricao.toLowerCase().includes('disponível') && 
            !c.descricao.toLowerCase().includes('disponivel')
        ).map((c: OmieCategoria) => ({
            ...c,
            descricao: c.descricao.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        }));
        setCategorias(categoriasLimpidas);
        const allContas = contRes.data.ListarContasCorrentes || [];
        const contasMapeadas = allContas.map((c: any) => ({
            id_conta_corrente: c.nCodCC,
            descricao: c.descricao
        }));
        setContas(contasMapeadas);
      } catch (error) {
        console.error("Erro ao carregar categorias ou contas", error);
      } finally {
        setIsLoadingMetadata(false);
      }
    }
    loadMetadata();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const processFile = async (file: File): Promise<RowMapping[]> => {
      try {
        const dataArray = await file.arrayBuffer();
        const pwd = planilhaPassword?.trim();
        const wb = XLSX.read(dataArray, { type: 'array', password: pwd || undefined });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const dataRaw = XLSX.utils.sheet_to_json<any>(ws);
        
        // Limpeza de espaços extras nos nomes das colunas (ex: "Saída " -> "Saída")
        const data = dataRaw.map(row => {
          const cleaned: any = {};
          Object.keys(row).forEach(key => {
            cleaned[key.trim()] = row[key];
          });
          return cleaned;
        });


        const rowsRaw = data.filter(r => {
          // Busca flexível: aceita variações de nome
          const temFornecedor = r.NOMEFORNECEDOR || r.FORNECEDOR || r.Nome || r['NOME DO FORNECEDOR'];
          const temSaida = r.Saída || r.SAIDA || r.Valor || r.VALOR || r.Saida;
          return temFornecedor || temSaida;
        });

        if (data.length > 0 && rowsRaw.length === 0) {
          const colunasEncontradas = Object.keys(data[0]).join(', ');
          console.warn('Colunas encontradas na planilha:', colunasEncontradas);
          alert(`Nenhum dado encontrado com as colunas esperadas.\n\nColunas detectadas no arquivo: ${colunasEncontradas}\n\nCertifique-se de que a planilha tem as colunas 'NOMEFORNECEDOR' e 'Saída'.`);
        }

        return rowsRaw.map((r, index) => {
            // Normalização dos campos para o nosso padrão interno
            const normalizedRow: PlanilhaRow = {
              ...r,
              NOMEFORNECEDOR: r.NOMEFORNECEDOR || r.FORNECEDOR || r.Nome || r['NOME DO FORNECEDOR'],
              Saída: r.Saída || r.SAIDA || r.Valor || r.VALOR || r.Saida,
              Vencimento: r.Vencimento || r.VENCIMENTO || r.Data || r.DATA || r['Data Vencimento'],
              PGTO: r.PGTO || r.Pagamento || r.PAGAMENTO || r['Data Pagamento'],
              HISTÓRICO: r.HISTÓRICO || r.HISTORICO || r.Historico || r.Descrição
            };

            let preConta = null;
            if (normalizedRow.Bancos) {
               const lowerBancos = String(normalizedRow.Bancos).toLowerCase();
               const achou = contas.find(c => c.descricao.toLowerCase().includes(lowerBancos));
               if (achou) preConta = achou.id_conta_corrente;
            }
            const uniqueStr = `${index}-${normalizedRow.NOMEFORNECEDOR}-${normalizedRow.Vencimento}-${normalizedRow.Saída}`;
            const internalId = btoa(unescape(encodeURIComponent(uniqueStr))).substring(0, 16);

            return {
              internal_id: internalId,
              original: normalizedRow,
              fornecedor_id: null,
              fornecedor_nome: null,
              fornecedor_doc: null,
              categoria_codigo: null,
              conta_id: preConta,
              status: 'PENDENTE'
            };
        });
      } catch (error: any) {
        throw new Error(`Erro no arquivo ${file.name}: ${error.message}${planilhaPassword ? ' (usando senha fornecida)' : ''}`);
      }
    };

    setIsProcessing(true);
    try {
      const results = await Promise.all(files.map(processFile));
      let initialRows = results.flat();
      
      // Realizar o vínculo automático ANTES de mostrar a tabela
      const uniqueNames = Array.from(new Set(
        initialRows.filter(r => r.original.NOMEFORNECEDOR).map(r => r.original.NOMEFORNECEDOR!)
      ));

      setMatchProgress({ current: 0, total: uniqueNames.length });

      // Mapa para guardar resultados e evitar buscas repetidas
      const matchMap = new Map<string, { id: number | null, nome: string | null, doc?: string | null, sugestoes?: OmieCliente[] }>();

      for (let i = 0; i < uniqueNames.length; i++) {
        const name = uniqueNames[i];
        setMatchProgress(prev => ({ ...prev, current: i + 1 }));
        try {
          let res = await axios.get('/api/omie/clientes', { params: { termo: name } });
          let results: OmieCliente[] = res.data.clientes_cadastro || [];
          
          // Fallback: Se não achou nada com o nome completo, tenta apenas com a primeira palavra
          if (results.length === 0) {
            const firstWord = name.split(' ')[0];
            if (firstWord && firstWord.length > 2) {
              const fallbackRes = await axios.get('/api/omie/clientes', { params: { termo: firstWord } });
              results = fallbackRes.data.clientes_cadastro || [];
            }
          }
          
          if (results.length === 1) {
            matchMap.set(name, { 
              id: results[0].codigo_cliente_omie, 
              nome: results[0].razao_social || results[0].nome_fantasia,
              doc: results[0].cnpj_cpf
            });
          } else if (results.length > 1) {
            matchMap.set(name, { id: null, nome: null, doc: null, sugestoes: results });
          }
        } catch (e) {
          console.warn("Falha ao buscar fornecedor automaticamente: " + name);
        }
        // Delay para rate limit
        await new Promise(r => setTimeout(r, 100));
      }

      // Aplicar os resultados encontrados nas linhas
      const finalRows = initialRows.map(r => {
        const match = r.original.NOMEFORNECEDOR ? matchMap.get(r.original.NOMEFORNECEDOR) : null;
        if (match) {
          return {
            ...r,
            fornecedor_id: match.id,
            fornecedor_nome: match.nome,
            fornecedor_doc: match.doc || null,
            sugestoes: match.sugestoes || []
          };
        }
        return r;
      });

      setRows(finalRows);
    } catch (error: any) {
      alert("Erro no processamento: " + error.message);
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  const handleSearchFornecedor = async (termo: string) => {
    setSearchTerm(termo);
    if (termo.length < 3) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await axios.get('/api/omie/clientes', { params: { termo } });
      setSearchResults(res.data.clientes_cadastro || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const verificarDuplicidade = async (row: RowMapping, codigoCliente: number) => {
    try {
      const dataVencimento = formatExcelDate(row.original.Vencimento);
      const valString = String(row.original.Saída || "0").replace(/[^\d.,-]/g, '').replace(',', '.');
      const valorNumerico = parseFloat(valString);
      const numeroNF = row.original['Nº NF'] || undefined;

      // Log detalhado de conversão
      console.log(`[VERIFICAR_DUPLICIDADE] Conversão de valor:`, {
        original: row.original.Saída,
        valString,
        valorNumerico,
        tipo: typeof valorNumerico,
        ehValido: !isNaN(valorNumerico)
      });

      console.log(`[VERIFICAR_DUPLICIDADE] Iniciando verificação:`, {
        fornecedor: row.original.NOMEFORNECEDOR,
        codigoCliente,
        valorNumerico,
        dataVencimento,
        numeroNF
      });

      const res = await axios.get('/api/omie/contas-pagar/verificar', {
        params: {
          codigo_cliente: codigoCliente,
          valor: valorNumerico,
          data_vencimento: dataVencimento,
          ...(numeroNF && { numero_nf: numeroNF })
        }
      });

      console.log(`[VERIFICAR_DUPLICIDADE] Resposta recebida:`, {
        exists: res.data.exists,
        totalDuplicados: res.data.duplicados?.length || 0,
        resumo: res.data.resumo,
        duplicados: res.data.duplicados,
        debug: res.data.debug
      });

      // Se tem debug, mostrar todas as contas do cliente
      if (res.data.debug && res.data.debug.contas_analisadas) {
        console.warn(`[VERIFICAR_DUPLICIDADE] DEBUG - Todas as ${res.data.debug.total_contas_cliente} contas encontradas para o cliente:`, res.data.debug.contas_analisadas);
      }

      if (res.data.exists && res.data.duplicados && res.data.duplicados.length > 0) {
        const duplicados = res.data.duplicados;
        const resumo = res.data.resumo;

        // Se todos estão pagos, é um erro
        if (resumo.tem_pago && !resumo.tem_em_aberto) {
          const detalhes = duplicados
            .map((d: any) => `ID ${d.codigo} (${d.status}) - Vto: ${d.vencimento}`)
            .join(' | ');
          
          setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { 
            ...r, 
            is_duplicate: true,
            status: 'ERRO' as any, 
            mensagem_erro: `⚠️ DUPLICADO E PAGO NO OMIE\n\nTítulos já pagos encontrados:\n${detalhes}\n\nNão é possível lançar novamente um título já liquidado.`,
            duplicados_info: `[PAGO] ${duplicados.map((d: any) => `ID ${d.codigo}`).join(', ')}`
          } : r));
        } 
        // Se há algum em aberto, offereça a opção de lançar apenas o pagamento
        else if (resumo.tem_em_aberto) {
          const lancamentoEmAberto = duplicados.find((d: any) => d.estaAberto);
          if (lancamentoEmAberto) {
            const detalhes = `ID ${lancamentoEmAberto.codigo} - Valor: R$ ${lancamentoEmAberto.valor} - Vto: ${lancamentoEmAberto.vencimento} - Status: ${lancamentoEmAberto.status}`;
            
            setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { 
              ...r, 
              is_duplicate: true,
              status: 'LANCAR_PAGAMENTO' as any, 
              omie_id_gerado: lancamentoEmAberto.codigo,
              mensagem_erro: `✓ TÍTULO JÁ CADASTRADO NO OMIE\n\n${detalhes}\n\nClique em "Lançar PGTO" para registrar o pagamento de acordo com a data da planilha.`,
              duplicados_info: `[${lancamentoEmAberto.status}] ID ${lancamentoEmAberto.codigo}`
            } : r));
          }
        }
      }
    } catch (e) {
      console.warn("Falha ao verificar duplicidade", e);
    }
  };

  const autoMatchFornecedores = async (targetRows?: RowMapping[]) => {
    setIsProcessing(true);
    const rowsToMatch = targetRows || rows;
    const uniqueNames = Array.from(new Set(
      rowsToMatch.filter(r => !r.fornecedor_id && r.original.NOMEFORNECEDOR)
          .map(r => r.original.NOMEFORNECEDOR!)
    ));

    for (const name of uniqueNames) {
      try {
        const res = await axios.get('/api/omie/clientes', { params: { termo: name } });
        const results: OmieCliente[] = res.data.clientes_cadastro || [];
        
        if (results.length === 1) {
          // Match único! Vincula todo mundo com esse nome
          const cli = results[0];
          setRows(prev => {
            const updated = prev.map(r => {
              if (r.original.NOMEFORNECEDOR === name && !r.fornecedor_id) {
                const updatedRow = {
                  ...r,
                  fornecedor_id: cli.codigo_cliente_omie,
                  fornecedor_nome: cli.razao_social || cli.nome_fantasia,
                  fornecedor_doc: cli.cnpj_cpf
                };
                // Disparar verificação de duplicidade de forma assíncrona
                verificarDuplicidade(updatedRow, cli.codigo_cliente_omie);
                return updatedRow;
              }
              return r;
            });
            return updated;
          });
        } else if (results.length > 1) {
          // Múltiplos encontrados, guardar sugestões para facilitar
          setRows(prev => prev.map(r => {
            if (r.original.NOMEFORNECEDOR === name && !r.fornecedor_id) {
              return { ...r, sugestoes: results };
            }
            return r;
          }));
        }
      } catch (e) {
        console.error("Erro no auto-match para " + name, e);
      }
      // Pequeno delay para respeitar rate limits se houver muitos nomes
      await new Promise(r => setTimeout(r, 100));
    }
    setIsProcessing(false);
  };

  const selecionarFornecedor = (rowId: string, cli: OmieCliente) => {
    setRows(prev => {
      const targetRow = prev.find(pr => pr.internal_id === rowId);
      const updated = prev.map(r => {
        // Auto-replicar para fornecedores com o mesmo nome exato na planilha
        if (r.internal_id === rowId || (targetRow && r.original.NOMEFORNECEDOR === targetRow.original.NOMEFORNECEDOR)) {
          const updatedRow = {
            ...r,
            fornecedor_id: cli.codigo_cliente_omie,
            fornecedor_nome: cli.razao_social || cli.nome_fantasia,
            fornecedor_doc: cli.cnpj_cpf,
            sugestoes: []
          };
          // Disparar verificação
          verificarDuplicidade(updatedRow, cli.codigo_cliente_omie);
          return updatedRow;
        }
        return r;
      });
      return updated;
    });
    setActiveSearchRow(null);
    setSearchTerm('');
  };

  const atualizarValor = (rowId: string, novoValor: string) => {
    setRows(prev => prev.map(r => r.internal_id === rowId ? {
      ...r,
      original: { ...r.original, Saída: novoValor }
    } : r));
  };

  const formatExcelDate = (excelDate: any) => {
    if (!excelDate) return "";
    
    // Caso o Excel envie como número (Serial Date)
    if (typeof excelDate === 'number') {
      // Excel conta dias desde 30/12/1899. 25569 é o ajuste para Unix Epoch (1970)
      const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
      const day = String(date.getUTCDate()).padStart(2, '0');
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const year = date.getUTCFullYear();
      return `${day}/${month}/${year}`;
    }

    // Caso o Excel envie como string "M/D/YYYY" ou "MM/DD/YYYY"
    if (typeof excelDate === 'string' && excelDate.includes('/')) {
        const parts = excelDate.split('/');
        if (parts.length === 3) {
            let day, month, year;
            if (parts[0].length === 4) {
                // YYYY/MM/DD
                year = parts[0];
                month = parts[1].padStart(2, '0');
                day = parts[2].padStart(2, '0');
            } else {
                // Interpretando como Mês/Dia/Ano conforme solicitado
                month = parts[0].padStart(2, '0');
                day = parts[1].padStart(2, '0');
                year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            }
            return `${day}/${month}/${year}`;
        }
    }
    return String(excelDate);
  };

  const processarLinha = async (row: RowMapping) => {
    if (row.status === 'SUCESSO') return;
    
    // Validar campos obrigatórios
    if (!row.fornecedor_id || !row.categoria_codigo || !row.conta_id) {
       setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { 
         ...r, 
         status: 'ERRO', 
         mensagem_erro: 'Faltam dados obrigatórios (Fornecedor, Categoria ou Banco)' 
       } : r));
       return;
    }

    setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { ...r, status: 'PROCESSANDO' } : r));

    try {
      const valString = String(row.original.Saída || "0").replace(/[^\d.,-]/g, '').replace(',', '.');
      const valorNumerico = parseFloat(valString);

      const dataVencimento = formatExcelDate(row.original.Vencimento);
      const dataPagamento = formatExcelDate(row.original.PGTO);

      const payload = {
        id_externo: row.internal_id,
        codigo_fornecedor: row.fornecedor_id,
        codigo_categoria: row.categoria_codigo,
        id_conta_corrente: row.conta_id,
        valor: valorNumerico,
        data_vencimento: dataVencimento,
        data_pagamento: dataPagamento,
        historico: row.original.HISTÓRICO || "Planilha Retroativa",
        numero_nf: row.original['Nº NF'] || "",
        observacao: row.original.Observação || ""
      };

      const res = await axios.post('/api/omie/contas-pagar', payload);
      
      if (res.data.success) {
        setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { 
          ...r, 
          status: 'SUCESSO', 
          omie_id_gerado: res.data.codigo_lancamento_omie 
        } : r));
      }
    } catch (err: any) {
      setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { 
        ...r, 
        status: 'ERRO', 
        mensagem_erro: err.response?.data?.error || err.message 
      } : r));
    }
  };

  const lancarSomentePagamento = async (row: RowMapping) => {
    if (row.status === 'SUCESSO') return;
    
    if (!row.omie_id_gerado || !row.conta_id) {
       setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { 
         ...r, 
         status: 'ERRO', 
         mensagem_erro: 'Faltam dados obrigatórios para baixa (ID Omie ou Banco)' 
       } : r));
       return;
    }

    setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { ...r, status: 'PROCESSANDO' } : r));

    try {
      const valString = String(row.original.Saída || "0").replace(/[^\d.,-]/g, '').replace(',', '.');
      const valorNumerico = parseFloat(valString);
      const dataPagamento = formatExcelDate(row.original.PGTO);

      const payload = {
        codigo_lancamento_omie: row.omie_id_gerado,
        codigo_conta_corrente: row.conta_id,
        valor: valorNumerico,
        data_pagamento: dataPagamento,
        observacao: "Baixa avulsa automática via Omie Validator"
      };

      const res = await axios.post('/api/omie/contas-pagar/pagar', payload);
      
      if (res.data.success) {
        setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { 
          ...r, 
          status: 'SUCESSO' 
        } : r));
      }
    } catch (err: any) {
      setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { 
        ...r, 
        status: 'LANCAR_PAGAMENTO', 
        mensagem_erro: err.response?.data?.error || err.message 
      } : r));
    }
  };

  const processarImportacao = async () => {
    setIsProcessing(true);
    for (const row of rows) {
      if (row.status === 'LANCAR_PAGAMENTO') {
        await lancarSomentePagamento(row);
      } else {
        await processarLinha(row);
      }
      await new Promise(res => setTimeout(res, 300));
    }
    setIsProcessing(false);
  };

  const gerarLogCSV = () => {
    const csvData = rows.map(r => ({
      'Fornecedor Planilha': r.original.NOMEFORNECEDOR,
      'NF': r.original['Nº NF'],
      'Valor Planilha': r.original.Saída,
      'Fornecedor Omie ID': r.fornecedor_id || '',
      'Fornecedor Omie Nome': r.fornecedor_nome || '',
      'Categoria Omie': r.categoria_codigo || '',
      'Conta Corrente Omie ID': r.conta_id || '',
      'Status': r.status,
      'Mensagem Erro': r.mensagem_erro || '',
      'ID Gerado Omie': r.omie_id_gerado || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(csvData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Log");
    XLSX.writeFile(workbook, `Log_Importacao_ContasPagar_${new Date().getTime()}.csv`);
  };

  const isReady = rows.length > 0 && rows.every(r => r.fornecedor_id && r.categoria_codigo && r.conta_id);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-20">
      
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 shadow-sm p-6 px-10 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md bg-white/70">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-blue-500 bg-clip-text text-transparent">Importação Contas a Pagar</h1>
            <p className="text-sm text-slate-500 mt-1">Integração de pagamentos retroativos com o Omie</p>
          </div>
        </div>
        
        {rows.length > 0 && (
          <div className="flex gap-3">
            <button
              onClick={autoMatchFornecedores}
              disabled={isProcessing || rows.length === 0}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2"
            >
              <Search className="w-4 h-4" /> Vincular Automaticamente
            </button>

            <button
              onClick={gerarLogCSV}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" /> Baixar Log CSV
            </button>

            <button
              onClick={processarImportacao}
              disabled={!isReady || isProcessing}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isProcessing ? 'Processando...' : 'Iniciar Importação'}
            </button>
          </div>
        )}
      </header>

      <main className="p-6 md:p-10 w-full max-w-full mx-auto">
        
        {/* WIZARD STEP 1 */}
        {rows.length === 0 && (
           <div className="max-w-2xl mx-auto mt-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white border border-slate-200 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center text-center">
                 <div className="w-20 h-20 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-6">
                    <UploadCloud className="w-10 h-10" />
                 </div>
                 <h2 className="text-2xl font-bold text-slate-800 mb-2">Importe sua Planilha</h2>
                 <p className="text-slate-500 mb-8 max-w-md">Selecione o arquivo Excel (.xlsx) contendo as contas a pagar retroativas para iniciar o processo de mapeamento e integração.</p>
                 
                 {isLoadingMetadata || (isProcessing && rows.length === 0) ? (
                   <div className="flex flex-col items-center gap-4 text-indigo-500">
                     <Loader2 className="w-10 h-10 animate-spin" />
                     <span className="font-medium text-lg animate-pulse">
                        {isProcessing ? `Vinculando fornecedores: ${matchProgress.current} de ${matchProgress.total}` : "Carregando configurações do Omie..."}
                     </span>
                     {isProcessing && (
                       <div className="w-full max-w-xs bg-slate-200 h-2 rounded-full overflow-hidden mt-2">
                          <div 
                            className="bg-indigo-500 h-full transition-all duration-300" 
                            style={{ width: `${(matchProgress.current / matchProgress.total) * 100}%` }}
                          />
                       </div>
                     )}
                     {isProcessing && <p className="text-sm text-slate-400">Isso pode levar alguns segundos dependendo da quantidade de registros.</p>}
                   </div>
                 ) : (
                   <div className="flex flex-col items-center gap-4">
                     <div className="flex flex-col items-start w-full max-w-xs">
                        <label className="text-xs font-semibold text-slate-500 uppercase mb-1">Senha da Planilha (se houver)</label>
                        <input 
                          type="text" 
                          value={planilhaPassword} 
                          onChange={(e) => setPlanilhaPassword(e.target.value)}
                          placeholder="Ex: 123456"
                          className="w-full px-4 py-2 bg-slate-100 border-none rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none transition text-center"
                        />
                     </div>
                     <label className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl cursor-pointer hover:bg-indigo-700 transition shadow-lg hover:shadow-indigo-500/30">
                       Selecionar Arquivo
                       <input type="file" multiple accept=".xlsx, .csv" className="hidden" onChange={handleFileUpload} />
                     </label>
                   </div>
                 )}
              </div>
           </div>
        )}

        {/* WIZARD STEP 2 & 3 */}
        {rows.length > 0 && (
           <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden animate-in fade-in">
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-slate-700">Mapeamento de Dados ({rows.length} registros encontrados)</h3>
                {!isReady && <span className="text-amber-600 text-sm font-medium flex items-center gap-1"><AlertCircle className="w-4 h-4"/> Preencha os campos vazios para liberar a importação.</span>}
                {isReady && <span className="text-emerald-600 text-sm font-medium flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/> Tudo pronto para importação!</span>}
              </div>

              {/* RESUMO VISUAL */}
              {rows.length > 0 && (
                <div className="grid grid-cols-4 gap-4 p-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                  <div className="bg-white rounded-lg p-3 border-l-4 border-indigo-500 shadow-sm">
                    <div className="text-xs text-slate-500 font-semibold uppercase">Novos</div>
                    <div className="text-2xl font-bold text-indigo-600 mt-1">{rows.filter(r => r.status === 'PENDENTE').length}</div>
                    <div className="text-xs text-slate-400 mt-1">Aguardando importação</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border-l-4 border-amber-500 shadow-sm">
                    <div className="text-xs text-slate-500 font-semibold uppercase">Já Cadastrados</div>
                    <div className="text-2xl font-bold text-amber-600 mt-1">{rows.filter(r => r.status === 'LANCAR_PAGAMENTO').length}</div>
                    <div className="text-xs text-slate-400 mt-1">Aguardando pagamento</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border-l-4 border-emerald-500 shadow-sm">
                    <div className="text-xs text-slate-500 font-semibold uppercase">Processados</div>
                    <div className="text-2xl font-bold text-emerald-600 mt-1">{rows.filter(r => r.status === 'SUCESSO').length}</div>
                    <div className="text-xs text-slate-400 mt-1">Finalizados com sucesso</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border-l-4 border-rose-500 shadow-sm">
                    <div className="text-xs text-slate-500 font-semibold uppercase">Erros</div>
                    <div className="text-2xl font-bold text-rose-600 mt-1">{rows.filter(r => r.status === 'ERRO').length}</div>
                    <div className="text-xs text-slate-400 mt-1">Requerem revisão</div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm">
                   <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase text-xs tracking-wider">
                     <tr>
                       <th className="px-4 py-3 font-semibold">Status</th>
                       <th className="px-4 py-3 font-semibold">Fornecedor</th>
                       <th className="px-4 py-3 font-semibold">Histórico</th>
                       <th className="px-4 py-3 font-semibold">Valor</th>
                       <th className="px-4 py-3 font-semibold text-center">Venc.</th>
                       <th className="px-4 py-3 font-semibold text-center">PGTO</th>
                       <th className="px-4 py-3 font-semibold text-indigo-600">Omie: Fornecedor</th>
                       <th className="px-4 py-3 font-semibold text-indigo-600">Omie: Categoria</th>
                       <th className="px-4 py-3 font-semibold text-indigo-600">Omie: Banco</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {rows.map(row => (
                       <tr key={row.internal_id} className="hover:bg-slate-50/50">
                         {/* STATUS */}
                         <td className="px-4 py-4">
                           {row.status === 'PENDENTE' && <span className="text-slate-400 font-medium">Pendente</span>}
                           {row.status === 'PROCESSANDO' && <span className="text-indigo-500 font-medium flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Processando</span>}
                           {row.status === 'SUCESSO' && (
                             <div className="flex flex-col gap-1">
                               <span className="text-emerald-600 font-bold flex items-center gap-1">
                                 <CheckCircle2 className="w-4 h-4"/> Sucesso
                               </span>
                               {row.omie_id_gerado && (
                                 <span className="text-[10px] font-mono text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded w-fit">
                                   ID: {row.omie_id_gerado}
                                 </span>
                               )}
                             </div>
                           )}
                            {row.status === 'LANCAR_PAGAMENTO' && (
                              <div className="flex flex-col gap-2">
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 flex flex-col gap-1">
                                  <div className="text-amber-700 font-bold text-xs flex items-center gap-1">
                                    <CheckCircle2 className="w-4 h-4"/> Já Cadastrado
                                  </div>
                                  <p className="text-[11px] text-amber-600 leading-tight">
                                    Título encontrado em aberto no Omie. <br/>
                                    Falta lançar o pagamento.
                                  </p>
                                  {row.duplicados_info && (
                                    <p className="text-[10px] text-amber-500 font-mono mt-1 bg-white/50 px-1.5 py-0.5 rounded">
                                      {row.duplicados_info}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => lancarSomentePagamento(row)}
                                  disabled={!row.conta_id}
                                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-amber-500 text-white rounded font-bold text-[11px] hover:bg-amber-600 transition disabled:opacity-30 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                                >
                                  <Play className="w-3 h-3" /> Lançar Pagamento
                                </button>
                              </div>
                            )}
                            {row.status === 'ERRO' && (
                              <div className="flex flex-col gap-2">
                                {row.is_duplicate ? (
                                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 flex flex-col gap-1">
                                    <div className="text-rose-700 font-bold text-xs flex items-center gap-1">
                                      <AlertCircle className="w-4 h-4"/> Duplicado e Pago
                                    </div>
                                    <p className="text-[11px] text-rose-600 leading-tight">
                                      Não é possível lançar novamente um título que já está liquidado no Omie.
                                    </p>
                                    {row.duplicados_info && (
                                      <p className="text-[10px] text-rose-500 font-mono mt-1 bg-white/50 px-1.5 py-0.5 rounded">
                                        {row.duplicados_info}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 flex flex-col gap-1">
                                    <div className="text-rose-700 font-bold text-xs flex items-center gap-1">
                                      <AlertCircle className="w-4 h-4"/> Erro
                                    </div>
                                    <p className="text-[11px] text-rose-600 leading-tight">
                                      {row.mensagem_erro || 'Ocorreu um erro ao processar este registro.'}
                                    </p>
                                  </div>
                                )}
                                {!row.is_duplicate && row.status !== 'SUCESSO' && (
                                  <button 
                                    onClick={() => processarLinha(row)}
                                    className="text-[11px] bg-rose-100 text-rose-600 px-2 py-1 rounded hover:bg-rose-200 transition font-semibold"
                                  >
                                    Tentar Novamente
                                  </button>
                                )}
                              </div>
                            )}
                            {row.status === 'PENDENTE' && (
                              <button
                                onClick={() => processarLinha(row)}
                                disabled={!row.fornecedor_id || !row.categoria_codigo || !row.conta_id}
                                className="mt-1 flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold hover:bg-indigo-600 hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Play className="w-3 h-3" /> Importar
                              </button>
                            )}
                         </td>

                         {/* PLANILHA: NOME */}
                         <td className="px-4 py-4 font-medium text-slate-700">
                           {row.original.NOMEFORNECEDOR || '-'}
                         </td>

                         {/* HISTORICO */}
                         <td className="px-4 py-4 text-xs text-slate-500 max-w-[300px] truncate" title={row.original.HISTÓRICO}>
                           {row.original.HISTÓRICO || '-'}
                         </td>

                         {/* VALOR */}
                         <td className="px-4 py-4 font-bold text-slate-800 whitespace-nowrap">
                           <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded border border-transparent focus-within:border-indigo-400 transition-all">
                             <span className="text-slate-400 text-xs">R$</span>
                             <input 
                               type="text"
                               className="bg-transparent outline-none w-24 text-sm font-bold"
                               value={String(row.original.Saída || "").replace('R$', '').trim()}
                               onChange={(e) => atualizarValor(row.internal_id, e.target.value)}
                             />
                           </div>
                         </td>

                         {/* VENCIMENTO */}
                         <td className="px-4 py-4 text-xs text-slate-500 whitespace-nowrap text-center">
                           {formatExcelDate(row.original.Vencimento)}
                         </td>

                         {/* PGTO */}
                         <td className="px-4 py-4 text-xs text-indigo-600 font-semibold whitespace-nowrap text-center">
                           {formatExcelDate(row.original.PGTO)}
                         </td>

                         {/* OMIE: FORNECEDOR (AUTOCOMPLETE) */}
                         <td className="px-4 py-4 relative">
                            {row.status !== 'PENDENTE' && row.status !== 'ERRO' && row.status !== 'LANCAR_PAGAMENTO' ? (
                               <div className="flex flex-col">
                                 <div className="text-sm font-semibold text-slate-800">{row.fornecedor_nome}</div>
                                 {row.fornecedor_doc && <div className="text-[10px] text-slate-400 font-mono">Doc: {row.fornecedor_doc}</div>}
                               </div>
                            ) : (
                               <div className="relative">
                                  {!row.fornecedor_id || activeSearchRow === row.internal_id ? (
                                    <div className="relative">
                                      <Search className="w-4 h-4 text-slate-400 absolute left-2 top-2" />
                                      <input 
                                        type="text"
                                        placeholder="Buscar no Omie..."
                                        className="w-full pl-8 pr-3 py-1.5 bg-slate-100 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                                        onFocus={() => setActiveSearchRow(row.internal_id)}
                                        onChange={(e) => handleSearchFornecedor(e.target.value)}
                                        value={activeSearchRow === row.internal_id ? searchTerm : (row.fornecedor_nome || '')}
                                      />
                                      
                                      {/* RESULTADOS DA BUSCA OU SUGESTÕES */}
                                      {activeSearchRow === row.internal_id && (searchResults.length > 0 || (row.sugestoes || []).length > 0) && (
                                        <div className="absolute top-full mt-1 left-0 w-[300px] max-h-60 overflow-y-auto bg-white border border-slate-200 shadow-xl rounded-lg z-50 p-1">
                                           {(searchResults.length > 0 ? searchResults : row.sugestoes!).map(cli => (
                                              <button
                                                key={cli.codigo_cliente_omie}
                                                className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 rounded-md transition flex flex-col"
                                                onClick={() => selecionarFornecedor(row.internal_id, cli)}
                                              >
                                                <span className="font-semibold">{cli.razao_social || cli.nome_fantasia}</span>
                                                <span className="text-xs text-slate-400">Doc: {cli.cnpj_cpf}</span>
                                              </button>
                                           ))}
                                        </div>
                                      )}
                                      
                                      {activeSearchRow === row.internal_id && isSearching && (
                                        <div className="absolute right-2 top-2 text-indigo-500"><Loader2 className="w-4 h-4 animate-spin"/></div>
                                      )}

                                      {/* BOTÃO PARA FECHAR A BUSCA */}
                                      {activeSearchRow === row.internal_id && (
                                         <div className="fixed inset-0 z-40" onClick={() => { setActiveSearchRow(null); setSearchTerm(''); }} />
                                      )}
                                    </div>
                                  ) : (
                                    <div 
                                      className="flex items-center justify-between w-full px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-md text-sm cursor-pointer group"
                                      onClick={() => setActiveSearchRow(row.internal_id)}
                                    >
                                      <span className="font-semibold text-indigo-800 truncate max-w-[150px]" title={row.fornecedor_nome!}>{row.fornecedor_nome}</span>
                                      <span className="text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition">Alterar</span>
                                    </div>
                                  )}
                               </div>
                            )}
                         </td>

                         {/* OMIE: CATEGORIA */}
                         <td className="px-4 py-4 w-80">
                            <select
                              disabled={row.status !== 'PENDENTE' && row.status !== 'ERRO' && row.status !== 'LANCAR_PAGAMENTO'}
                              value={row.categoria_codigo || ''}
                              onChange={(e) => {
                                // Aplicação individual
                                setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { ...r, categoria_codigo: e.target.value } : r));
                              }}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-400 outline-none disabled:bg-slate-50 disabled:text-slate-500"
                            >
                               <option value="">Selecione...</option>
                               {categorias.map(cat => {
                                 const codigo = cat.codigo || (cat as any).codigo_categoria;
                                 return (
                                   <option key={codigo} value={codigo}>
                                     {cat.descricao} ({codigo})
                                   </option>
                                 );
                               })}
                            </select>
                         </td>

                         {/* OMIE: CONTA CORRENTE */}
                         <td className="px-4 py-4 w-64">
                            <select
                              disabled={row.status !== 'PENDENTE' && row.status !== 'ERRO' && row.status !== 'LANCAR_PAGAMENTO'}
                              value={row.conta_id || ''}
                              onChange={(e) => {
                                setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { ...r, conta_id: Number(e.target.value) } : r));
                              }}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-400 outline-none disabled:bg-slate-50 disabled:text-slate-500"
                            >
                               <option value="">Selecione...</option>
                               {contas.map(c => (
                                 <option key={c.id_conta_corrente} value={c.id_conta_corrente}>
                                   {c.descricao}
                                 </option>
                               ))}
                            </select>
                         </td>

                         {/* REMOVED DUPLICATE VALOR FROM END */}
                       </tr>
                     ))}
                   </tbody>
                 </table>
              </div>
           </div>
        )}

      </main>
    </div>
  );
}
