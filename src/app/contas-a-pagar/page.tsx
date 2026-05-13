'use client';

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { 
  UploadCloud, CheckCircle2, AlertCircle, Play, 
  Loader2, Search, FileSpreadsheet, Wallet, Trash2
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
type OmieDepartamento = { codigo: string; descricao: string; };
type OmieCliente = { codigo_cliente_omie: number; razao_social: string; nome_fantasia: string; cnpj_cpf: string; };
type OmiePagamentoVinculado = {
  codigo: number;
  status: string;
  valor: string | number;
  vencimento: string;
  nf?: string;
  numero_documento?: string | number;
  parcela?: string | number;
  categoria_codigo?: string | null;
  departamento_codigo?: string | null;
  departamento_nome?: string | null;
  conta_id?: number | null;
  data_pagamento?: string | null;
  estaAberto?: boolean;
  estaPago?: boolean;
};

type RowMapping = {
  internal_id: string;
  original: PlanilhaRow;
  
  // Mapeamentos
  fornecedor_id: number | null;
  fornecedor_nome: string | null;
  fornecedor_doc: string | null;
  categoria_codigo: string | null;
  departamento_codigo: string | null;
  conta_id: number | null;
  
  status: 'PENDENTE' | 'PROCESSANDO' | 'SUCESSO' | 'ERRO' | 'LANCAR_PAGAMENTO' | 'JA_CADASTRADO';
  mensagem_erro?: string;
  omie_id_gerado?: number;
  
  // Para auto-match
  sugestoes?: OmieCliente[];
  is_duplicate?: boolean;
  duplicados_info?: string;
  pagamentos_vinculados?: OmiePagamentoVinculado[];
  acao_importacao?: 'ATUALIZAR' | 'INSERIR' | 'REVISAR' | 'JA_CADASTRADO';
  selecionado?: boolean;
};

const STORAGE_KEY = 'omie-validator:contas-a-pagar:rows';

const normalizeStoredRows = (storedRows: RowMapping[]) => storedRows.map(row => ({
  ...row,
  status: row.status === 'PROCESSANDO' ? 'PENDENTE' as const : row.status,
  pagamentos_vinculados: row.pagamentos_vinculados || [],
  acao_importacao: row.acao_importacao || ((row.pagamentos_vinculados || []).length > 0 ? 'ATUALIZAR' : 'INSERIR'),
  departamento_codigo: row.departamento_codigo || null,
  selecionado: row.selecionado ?? true
}));

export default function ContasAPagar() {
  const [rows, setRows] = useState<RowMapping[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMatchingOverlayVisible, setIsMatchingOverlayVisible] = useState(false);
  const [planilhaPassword, setPlanilhaPassword] = useState('031007');
  const hasHydratedRows = useRef(false);
  const [hasStoredRows, setHasStoredRows] = useState(false);
  
  const [categorias, setCategorias] = useState<OmieCategoria[]>([]);
  const [contas, setContas] = useState<OmieConta[]>([]);
  const [departamentos, setDepartamentos] = useState<OmieDepartamento[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [metadataWarning, setMetadataWarning] = useState<string | null>(null);

  // Controle do Autocomplete de Fornecedor
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<OmieCliente[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSearchRow, setActiveSearchRow] = useState<string | null>(null);
  const [matchProgress, setMatchProgress] = useState({ current: 0, total: 0 });
  const [currentMatchItem, setCurrentMatchItem] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      const storedRows = Array.isArray(parsed?.rows) ? parsed.rows : [];
      if (storedRows.length > 0) {
        setRows(normalizeStoredRows(storedRows));
        setHasStoredRows(true);
      }
    } catch (error) {
      console.warn('Não foi possível restaurar os dados locais da planilha.', error);
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      hasHydratedRows.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasHydratedRows.current || rows.length === 0) return;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        rows
      }));
      setHasStoredRows(true);
    } catch (error) {
      console.warn('Não foi possível salvar os dados locais da planilha.', error);
    }
  }, [rows]);

  useEffect(() => {
    async function loadMetadata() {
      const withTimeout = <T,>(promise: Promise<T>, label: string, timeoutMs = 15000): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            window.setTimeout(() => reject(new Error(`Tempo excedido ao carregar ${label}`)), timeoutMs);
          })
        ]);
      };

      try {
        const [catResult, contResult, depResult] = await Promise.allSettled([
          withTimeout(axios.get('/api/omie/categorias'), 'categorias', 45000),
          withTimeout(axios.get('/api/omie/contas-correntes'), 'contas correntes'),
          withTimeout(axios.get('/api/omie/departamentos'), 'departamentos')
        ]);

        const falhas: string[] = [];

        if (catResult.status === 'fulfilled') {
          const allCategorias = catResult.value.data.categoria_cadastro || [];
          const categoriasLimpidas = allCategorias
            .map((c: any) => ({
              codigo: String(c.codigo || c.codigo_categoria || ''),
              descricao: String(c.descricao || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
            }))
            .filter((c: OmieCategoria) =>
              c.codigo &&
              c.descricao &&
              !c.descricao.toLowerCase().includes('disponível') &&
              !c.descricao.toLowerCase().includes('disponivel')
            )
            .sort((a: OmieCategoria, b: OmieCategoria) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
          setCategorias(categoriasLimpidas);
        } else {
          falhas.push('categorias');
          console.error('Erro ao carregar categorias', catResult.reason);
        }

        if (contResult.status === 'fulfilled') {
          const allContas = contResult.value.data.ListarContasCorrentes || [];
          const contasMapeadas = allContas.map((c: any) => ({
            id_conta_corrente: c.nCodCC,
            descricao: c.descricao
          }));
          setContas(contasMapeadas);
        } else {
          falhas.push('contas correntes');
          console.error('Erro ao carregar contas correntes', contResult.reason);
        }

        if (depResult.status === 'fulfilled') {
          const allDepartamentos = depResult.value.data.departamentos || [];
          const departamentosMapeados = allDepartamentos
            .filter((d: any) => d.inativo !== 'S' && d.nivel_totalizador !== 'S')
            .map((d: any) => ({
              codigo: String(d.codigo || d.cCodDep || d.codInt || d.codigo_departamento || ''),
              descricao: d.descricao || d.cDesDep || d.nome || ''
            }))
            .filter((d: OmieDepartamento) => d.codigo && d.descricao)
            .sort((a: OmieDepartamento, b: OmieDepartamento) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
          setDepartamentos(departamentosMapeados);
        } else {
          falhas.push('departamentos');
          console.error('Erro ao carregar departamentos', depResult.reason);
        }

        setMetadataWarning(falhas.length > 0 ? `Não foi possível carregar: ${falhas.join(', ')}. A importação foi liberada, mas esses campos podem precisar de atualização manual ou nova tentativa.` : null);
      } catch (error) {
        console.error("Erro ao carregar categorias, contas ou departamentos", error);
        setMetadataWarning('Não foi possível carregar as configurações do Omie. A importação foi liberada, mas alguns campos podem ficar vazios.');
      } finally {
        setIsLoadingMetadata(false);
      }
    }
    loadMetadata();
  }, []);

  const limparDadosLocais = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setRows([]);
    setHasStoredRows(false);
    setSearchTerm('');
    setSearchResults([]);
    setActiveSearchRow(null);
    setMatchProgress({ current: 0, total: 0 });
  };

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
              departamento_codigo: null,
              conta_id: preConta,
              status: 'PENDENTE',
              pagamentos_vinculados: [],
              acao_importacao: 'INSERIR',
              selecionado: true
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

  const montarVinculoPagamento = (duplicados: OmiePagamentoVinculado[], resumo: any, valorPlanilha?: number): Partial<RowMapping> => {
    const lancamentoPrincipal = duplicados.find(d => d.estaPago || d.estaAberto) || duplicados[0] || null;
    const categoriaSincronizada = lancamentoPrincipal?.categoria_codigo ?? null;
    const departamentoSincronizado = lancamentoPrincipal?.departamento_codigo ?? null;
    const contaSincronizada = lancamentoPrincipal?.conta_id ?? null;

    if (duplicados.length === 0) {
      return {
        pagamentos_vinculados: [],
        acao_importacao: 'INSERIR',
        is_duplicate: false,
        duplicados_info: undefined,
        mensagem_erro: undefined,
        omie_id_gerado: undefined,
        status: 'PENDENTE'
      };
    }

    if (Number.isFinite(valorPlanilha)) {
      const tituloComValorDivergente = duplicados.find(d => {
        const valorOmie = parseCurrencyValue(d.valor);
        return !Number.isFinite(valorOmie) || Math.abs(valorOmie - Number(valorPlanilha)) > 0.01;
      });

      if (tituloComValorDivergente) {
        const valorOmie = parseCurrencyValue(tituloComValorDivergente.valor);
        return {
          pagamentos_vinculados: duplicados,
          categoria_codigo: categoriaSincronizada,
          departamento_codigo: departamentoSincronizado,
          conta_id: contaSincronizada,
          acao_importacao: 'REVISAR',
          is_duplicate: true,
          status: 'ERRO',
          mensagem_erro: `Valor divergente do título localizado no Omie. Planilha: R$ ${Number(valorPlanilha).toFixed(2)} | Omie: R$ ${Number.isFinite(valorOmie) ? valorOmie.toFixed(2) : tituloComValorDivergente.valor}`,
          duplicados_info: `[VALOR DIVERGENTE] ID ${tituloComValorDivergente.codigo}`
        };
      }
    }

    if (resumo.tem_pago && !resumo.tem_em_aberto) {
      const detalhes = duplicados
        .map((d: any) => `ID ${d.codigo} (${d.status}) - Vto: ${d.vencimento}`)
        .join(' | ');

      return {
        pagamentos_vinculados: duplicados,
        categoria_codigo: categoriaSincronizada,
        departamento_codigo: departamentoSincronizado,
        conta_id: contaSincronizada,
        omie_id_gerado: lancamentoPrincipal?.codigo,
        acao_importacao: 'JA_CADASTRADO',
        is_duplicate: true,
        status: 'JA_CADASTRADO',
        mensagem_erro: `✓ TÍTULO JÁ CADASTRADO E BAIXADO NO OMIE\n\n${detalhes}\n\nNenhuma ação será executada para este registro.`,
        duplicados_info: `[PAGO] ${duplicados.map((d: any) => `ID ${d.codigo}`).join(', ')}`
      };
    }

    if (resumo.tem_em_aberto) {
      const lancamentoEmAberto = duplicados.find((d: any) => d.estaAberto);
      if (lancamentoEmAberto) {
        const detalhes = `ID ${lancamentoEmAberto.codigo} - Valor: R$ ${lancamentoEmAberto.valor} - Vto: ${lancamentoEmAberto.vencimento} - Status: ${lancamentoEmAberto.status}`;

        return {
          pagamentos_vinculados: duplicados,
          categoria_codigo: categoriaSincronizada,
          departamento_codigo: departamentoSincronizado,
          conta_id: contaSincronizada,
          acao_importacao: 'ATUALIZAR',
          is_duplicate: true,
          status: 'LANCAR_PAGAMENTO',
          omie_id_gerado: lancamentoEmAberto.codigo,
          mensagem_erro: `✓ TÍTULO JÁ CADASTRADO NO OMIE\n\n${detalhes}\n\nClique em "Atualizar Baixa" para registrar o pagamento de acordo com a data da planilha.`,
          duplicados_info: `[${lancamentoEmAberto.status}] ID ${lancamentoEmAberto.codigo}`
        };
      }
    }

    return {
      pagamentos_vinculados: duplicados,
      categoria_codigo: categoriaSincronizada,
      departamento_codigo: departamentoSincronizado,
      conta_id: contaSincronizada,
      omie_id_gerado: lancamentoPrincipal?.codigo,
      acao_importacao: 'ATUALIZAR',
      is_duplicate: true,
      duplicados_info: duplicados.map((d: any) => `ID ${d.codigo}`).join(', ')
    };
  };

  const buscarVinculoPagamento = async (row: RowMapping, codigoCliente: number): Promise<Partial<RowMapping>> => {
    const dataVencimento = formatExcelDate(row.original.Vencimento);
    const valorNumerico = parseCurrencyValue(row.original.Saída);
    const numeroNF = row.original['Nº NF'] || undefined;

    const res = await axios.get('/api/omie/contas-pagar/verificar', {
      params: {
        codigo_cliente: codigoCliente,
        valor: valorNumerico,
        data_vencimento: dataVencimento,
        ...(numeroNF && { numero_nf: numeroNF })
      }
    });

    const duplicados = res.data.duplicados || [];
    const resumo = res.data.resumo || {};
    return montarVinculoPagamento(duplicados, resumo, valorNumerico);
  };

  const verificarDuplicidade = async (row: RowMapping, codigoCliente: number) => {
    try {
      if (getRowValidation(row).hasErrors) return;

      const vinculo = await buscarVinculoPagamento(row, codigoCliente);
      setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { ...r, ...vinculo } : r));
    } catch (e) {
      console.warn("Falha ao verificar duplicidade", e);
    }
  };

  const autoMatchFornecedores = async (targetRows?: RowMapping[]) => {
    setIsProcessing(true);
    setIsMatchingOverlayVisible(true);
    const rowsToMatch = Array.isArray(targetRows) ? targetRows : rows;
    const selectedIds = new Set(rowsToMatch.filter(r => r.selecionado ?? true).map(r => r.internal_id));
    let updatedRows = rows.map(r => ({ ...r }));
    const uniqueNames = Array.from(new Set(
      updatedRows.filter(r => selectedIds.has(r.internal_id) && !r.fornecedor_id && r.original.NOMEFORNECEDOR)
          .map(r => r.original.NOMEFORNECEDOR!)
    ));

    try {
      setMatchProgress({ current: 0, total: uniqueNames.length });

      for (let i = 0; i < uniqueNames.length; i++) {
        const name = uniqueNames[i];
        setCurrentMatchItem(name);
        setMatchProgress({ current: i + 1, total: uniqueNames.length });
        try {
          const res = await axios.get('/api/omie/clientes', { params: { termo: name } });
          const results: OmieCliente[] = res.data.clientes_cadastro || [];

          if (results.length === 1) {
            // Match único! Vincula todo mundo com esse nome
            const cli = results[0];
            updatedRows = updatedRows.map(r => {
              if (selectedIds.has(r.internal_id) && r.original.NOMEFORNECEDOR === name && !r.fornecedor_id) {
                return {
                  ...r,
                  fornecedor_id: cli.codigo_cliente_omie,
                  fornecedor_nome: cli.razao_social || cli.nome_fantasia,
                  fornecedor_doc: cli.cnpj_cpf,
                  sugestoes: []
                };
              }
              return r;
            });
          } else if (results.length > 1) {
            // Múltiplos encontrados, guardar sugestões para facilitar
            updatedRows = updatedRows.map(r => {
              if (selectedIds.has(r.internal_id) && r.original.NOMEFORNECEDOR === name && !r.fornecedor_id) {
                return { ...r, sugestoes: results };
              }
              return r;
            });
          }
          setRows(updatedRows);
        } catch (e) {
          console.error("Erro no auto-match para " + name, e);
        }
        // Pequeno delay para respeitar rate limits se houver muitos nomes
        await new Promise(r => setTimeout(r, 100));
      }

      const rowsComFornecedor = updatedRows.filter(r =>
        selectedIds.has(r.internal_id) &&
        r.fornecedor_id &&
        !getRowValidation(r).hasErrors
      );
      setMatchProgress({ current: 0, total: rowsComFornecedor.length });

      for (let i = 0; i < rowsComFornecedor.length; i++) {
        const row = rowsComFornecedor[i];
        setCurrentMatchItem(row.original.NOMEFORNECEDOR || `Registro ${i + 1}`);
        setMatchProgress({ current: i + 1, total: rowsComFornecedor.length });

        try {
          const vinculo = await buscarVinculoPagamento(row, row.fornecedor_id!);
          updatedRows = updatedRows.map(r => r.internal_id === row.internal_id ? { ...r, ...vinculo } : r);
          setRows(updatedRows);
        } catch (e) {
          console.warn("Falha ao buscar pagamento vinculado para " + row.original.NOMEFORNECEDOR, e);
        }

        await new Promise(r => setTimeout(r, 100));
      }
    } finally {
      setIsProcessing(false);
      setIsMatchingOverlayVisible(false);
      setCurrentMatchItem(null);
      setMatchProgress({ current: 0, total: 0 });
    }
  };

  const selecionarFornecedor = (rowId: string, cli: OmieCliente) => {
    const targetRow = rows.find(pr => pr.internal_id === rowId);
    const sameNameRows = targetRow
      ? rows.filter(r => r.internal_id !== rowId && r.original.NOMEFORNECEDOR === targetRow.original.NOMEFORNECEDOR)
      : [];
    const shouldReplicate = sameNameRows.length > 0
      ? window.confirm(`Vincular "${cli.razao_social || cli.nome_fantasia}" aos outros ${sameNameRows.length} registro(s) com o fornecedor "${targetRow?.original.NOMEFORNECEDOR}"?`)
      : false;
    const shouldUpdateRow = (row: RowMapping) => (
      row.internal_id === rowId ||
      Boolean(shouldReplicate && targetRow && row.original.NOMEFORNECEDOR === targetRow.original.NOMEFORNECEDOR)
    );
    const rowsToVerify = rows.filter(shouldUpdateRow).map(r => prepararLinhaAposEdicaoManual(r, {
      fornecedor_id: cli.codigo_cliente_omie,
      fornecedor_nome: cli.razao_social || cli.nome_fantasia,
      fornecedor_doc: cli.cnpj_cpf,
      sugestoes: []
    }));

    setRows(prev => {
      const updated = prev.map(r => {
        if (shouldUpdateRow(r)) {
          return prepararLinhaAposEdicaoManual(r, {
            fornecedor_id: cli.codigo_cliente_omie,
            fornecedor_nome: cli.razao_social || cli.nome_fantasia,
            fornecedor_doc: cli.cnpj_cpf,
            sugestoes: []
          });
        }
        return r;
      });
      return updated;
    });
    setActiveSearchRow(null);
    setSearchTerm('');
    rowsToVerify.forEach(row => {
      if (!getLinkedOmieId(row)) {
        verificarDuplicidade(row, cli.codigo_cliente_omie);
      }
    });
  };

  const atualizarValor = (rowId: string, novoValor: string) => {
    setRows(prev => prev.map(r => r.internal_id === rowId ? {
      ...r,
      original: { ...r.original, Saída: novoValor },
      pagamentos_vinculados: [],
      acao_importacao: 'INSERIR',
      is_duplicate: false,
      duplicados_info: undefined,
      omie_id_gerado: undefined,
      mensagem_erro: r.is_duplicate ? undefined : r.mensagem_erro,
      status: r.status === 'LANCAR_PAGAMENTO' || r.is_duplicate ? 'PENDENTE' : r.status,
      selecionado: Number.isFinite(parseCurrencyValue(novoValor)) && parseCurrencyValue(novoValor) > 0 ? r.selecionado : false
    } : r));
  };

  const toggleSelecionado = (rowId: string) => {
    setRows(prev => prev.map(r => {
      if (r.internal_id !== rowId) return r;
      if (getRowValidation(r).hasErrors || r.status === 'ERRO') return { ...r, selecionado: false };

      return {
        ...r,
        selecionado: !(r.selecionado ?? true)
      };
    }));
  };

  const recuperarStatusAposAtualizacaoManual = (row: RowMapping) => {
    const erroPorCamposObrigatorios = row.status === 'ERRO' && (row.mensagem_erro || '').includes('Faltam dados obrigatórios');

    if (!erroPorCamposObrigatorios) {
      return {
        status: row.status,
        mensagem_erro: row.mensagem_erro,
      };
    }

    return {
      status: row.omie_id_gerado || row.acao_importacao === 'ATUALIZAR' ? 'LANCAR_PAGAMENTO' as const : 'PENDENTE' as const,
      mensagem_erro: undefined,
    };
  };

  const getLinkedOmieId = (row: RowMapping) => row.omie_id_gerado || row.pagamentos_vinculados?.[0]?.codigo || undefined;

  const prepararLinhaAposEdicaoManual = (row: RowMapping, updates: Partial<RowMapping>): RowMapping => {
    const linkedOmieId = getLinkedOmieId({ ...row, ...updates } as RowMapping);
    const deveAtualizarRegistroExistente = Boolean(
      linkedOmieId ||
      row.status === 'SUCESSO' ||
      row.status === 'JA_CADASTRADO' ||
      row.acao_importacao === 'ATUALIZAR' ||
      row.acao_importacao === 'JA_CADASTRADO'
    );

    if (deveAtualizarRegistroExistente) {
      return {
        ...row,
        ...updates,
        omie_id_gerado: linkedOmieId,
        acao_importacao: 'ATUALIZAR',
        status: row.status === 'LANCAR_PAGAMENTO' ? 'LANCAR_PAGAMENTO' : 'PENDENTE',
        mensagem_erro: undefined,
      };
    }

    return {
      ...row,
      ...updates,
      ...recuperarStatusAposAtualizacaoManual(row)
    };
  };

  const toggleSelecionarTodos = () => {
    const selectableRows = rows.filter(r => !getRowValidation(r).hasErrors && r.status !== 'ERRO');
    const allSelected = selectableRows.length > 0 && selectableRows.every(r => r.selecionado ?? true);
    setRows(prev => prev.map(r => ({
      ...r,
      selecionado: getRowValidation(r).hasErrors || r.status === 'ERRO' ? false : !allSelected
    })));
  };

  const atualizarCategoria = (rowId: string, categoriaCodigo: string) => {
    const targetRow = rows.find(r => r.internal_id === rowId);
    const sameFornecedorRows = targetRow
      ? rows.filter(r =>
          r.internal_id !== rowId &&
          r.fornecedor_id &&
          targetRow.fornecedor_id &&
          r.fornecedor_id === targetRow.fornecedor_id
        )
      : [];
    const shouldReplicate = sameFornecedorRows.length > 0
      ? window.confirm(`Atualizar a categoria dos outros ${sameFornecedorRows.length} registro(s) vinculados ao mesmo fornecedor?`)
      : false;

    setRows(prev => prev.map(r => {
      const mesmoFornecedor = Boolean(
        shouldReplicate &&
        targetRow?.fornecedor_id &&
        r.fornecedor_id === targetRow.fornecedor_id
      );

      if (r.internal_id === rowId || mesmoFornecedor) {
        return prepararLinhaAposEdicaoManual(r, { categoria_codigo: categoriaCodigo });
      }

      return r;
    }));
  };

  const atualizarDepartamento = (rowId: string, departamentoCodigo: string) => {
    const targetRow = rows.find(r => r.internal_id === rowId);
    const sameFornecedorRows = targetRow
      ? rows.filter(r =>
          r.internal_id !== rowId &&
          r.fornecedor_id &&
          targetRow.fornecedor_id &&
          r.fornecedor_id === targetRow.fornecedor_id
        )
      : [];
    const shouldReplicate = sameFornecedorRows.length > 0
      ? window.confirm(`Atualizar o departamento dos outros ${sameFornecedorRows.length} registro(s) vinculados ao mesmo fornecedor?`)
      : false;

    setRows(prev => prev.map(r => {
      const mesmoFornecedor = Boolean(
        shouldReplicate &&
        targetRow?.fornecedor_id &&
        r.fornecedor_id === targetRow.fornecedor_id
      );

      if (r.internal_id === rowId || mesmoFornecedor) {
        return prepararLinhaAposEdicaoManual(r, { departamento_codigo: departamentoCodigo });
      }

      return r;
    }));
  };

  const parseCurrencyValue = (value: any) => {
    if (typeof value === 'number') return value;

    const sanitized = String(value || '').replace(/[^\d.,-]/g, '').trim();
    if (!sanitized) return NaN;

    const lastComma = sanitized.lastIndexOf(',');
    const lastDot = sanitized.lastIndexOf('.');
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const normalized = sanitized
      .replace(decimalSeparator === ',' ? /\./g : /,/g, '')
      .replace(decimalSeparator, '.');

    return Number(normalized);
  };

  const atualizarContaCorrente = (rowId: string, contaId: number | null) => {
    setRows(prev => prev.map(r => r.internal_id === rowId
      ? prepararLinhaAposEdicaoManual(r, { conta_id: contaId })
      : r
    ));
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

    // Caso o Excel envie como string com barras
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
                const first = Number(parts[0]);
                const second = Number(parts[1]);
                // Aceita DD/MM/YYYY quando o primeiro campo não pode ser mês; senão mantém M/D/YYYY.
                if (first > 12 && second <= 12) {
                    day = parts[0].padStart(2, '0');
                    month = parts[1].padStart(2, '0');
                } else {
                    month = parts[0].padStart(2, '0');
                    day = parts[1].padStart(2, '0');
                }
                year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            }
            return `${day}/${month}/${year}`;
        }
    }
    return String(excelDate);
  };

  const isValidDateValue = (excelDate: any) => {
    const formatted = formatExcelDate(excelDate);
    const match = formatted.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return false;

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  };

  const getRowValidation = (row: RowMapping) => {
    const valor = parseCurrencyValue(row.original.Saída);
    const valorValido = Number.isFinite(valor) && valor > 0;
    const vencimentoValido = isValidDateValue(row.original.Vencimento);
    const pagamentoValido = isValidDateValue(row.original.PGTO);
    const fornecedorLocalizado = Boolean(row.fornecedor_id);

    return {
      valor,
      valorValido,
      vencimentoValido,
      pagamentoValido,
      fornecedorLocalizado,
      hasErrors: !valorValido || !vencimentoValido || !pagamentoValido,
      canImport: fornecedorLocalizado && valorValido && vencimentoValido && pagamentoValido
    };
  };

  const isNoopRow = (row: RowMapping) => row.status === 'JA_CADASTRADO' || row.acao_importacao === 'JA_CADASTRADO';

  const escapeCsv = (value: any) => {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  };

  const baixarCsvTexto = (filename: string, data: Record<string, any>[]) => {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csv = [
      headers.map(escapeCsv).join(','),
      ...data.map(row => headers.map(header => escapeCsv(row[header])).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const processarLinha = async (row: RowMapping) => {
    if (row.status === 'SUCESSO' || isNoopRow(row)) return null;

    const validation = getRowValidation(row);
    if (validation.hasErrors) {
       setRows(prev => prev.map(r => r.internal_id === row.internal_id ? {
         ...r,
         status: 'ERRO',
         mensagem_erro: 'Valor, vencimento ou data de pagamento inválidos.'
       } : r));
       return null;
    }
    
    // Validar campos obrigatórios
    if (!row.fornecedor_id || !row.categoria_codigo || !row.departamento_codigo || !row.conta_id) {
       setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { 
         ...r, 
         status: 'ERRO', 
         mensagem_erro: 'Faltam dados obrigatórios (Fornecedor, Categoria, Departamento ou Banco)'
       } : r));
       return null;
    }

    setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { ...r, status: 'PROCESSANDO' } : r));

    try {
      const valorNumerico = validation.valor;

      const dataVencimento = formatExcelDate(row.original.Vencimento);
      const dataPagamento = formatExcelDate(row.original.PGTO);

      const payload = {
        id_externo: row.internal_id,
        codigo_fornecedor: row.fornecedor_id,
        codigo_categoria: row.categoria_codigo,
        codigo_departamento: row.departamento_codigo,
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
        const realizado = {
          acao: 'Inserido título e baixa',
          fornecedor: row.fornecedor_nome || row.original.NOMEFORNECEDOR || '',
          valor: valorNumerico,
          vencimento: dataVencimento,
          pagamento: dataPagamento,
          departamento: row.departamento_codigo,
          codigo_lancamento_omie: res.data.codigo_lancamento_omie,
          codigo_baixa: res.data.codigo_baixa || '',
          documento: row.original['Nº NF'] || row.internal_id,
          parcela: '1'
        };

        setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { 
          ...r, 
          status: 'SUCESSO', 
          omie_id_gerado: res.data.codigo_lancamento_omie,
          acao_importacao: 'INSERIR',
          pagamentos_vinculados: [{
            codigo: res.data.codigo_lancamento_omie,
            status: 'INSERIDO',
            valor: row.original.Saída || valorNumerico,
            vencimento: dataVencimento,
            nf: row.original['Nº NF'] ? String(row.original['Nº NF']) : undefined,
            numero_documento: row.original['Nº NF'] || row.internal_id,
            parcela: '1',
            categoria_codigo: row.categoria_codigo,
            departamento_codigo: row.departamento_codigo,
            data_pagamento: dataPagamento
          }]
        } : r));
        return realizado;
      }
    } catch (err: any) {
      setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { 
        ...r, 
        status: 'ERRO', 
        mensagem_erro: err.response?.data?.error || err.message 
      } : r));
    }
    return null;
  };

  const atualizarCadastroExistente = async (row: RowMapping) => {
    const codigoLancamentoOmie = getLinkedOmieId(row);
    if (!codigoLancamentoOmie) return null;

    const validation = getRowValidation(row);
    if (validation.hasErrors) {
      setRows(prev => prev.map(r => r.internal_id === row.internal_id ? {
        ...r,
        status: 'ERRO',
        mensagem_erro: 'Valor, vencimento ou data de pagamento inválidos.'
      } : r));
      return null;
    }

    if (!row.fornecedor_id || !row.categoria_codigo || !row.departamento_codigo || !row.conta_id) {
      setRows(prev => prev.map(r => r.internal_id === row.internal_id ? {
        ...r,
        status: 'ERRO',
        mensagem_erro: 'Faltam dados obrigatórios para atualização (Fornecedor, Categoria, Departamento ou Banco)'
      } : r));
      return null;
    }

    setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { ...r, status: 'PROCESSANDO' } : r));

    try {
      const valorNumerico = validation.valor;
      const dataVencimento = formatExcelDate(row.original.Vencimento);
      const dataPagamento = formatExcelDate(row.original.PGTO);

      const res = await axios.post('/api/omie/contas-pagar/atualizar', {
        codigo_lancamento_omie: codigoLancamentoOmie,
        codigo_fornecedor: row.fornecedor_id,
        codigo_categoria: row.categoria_codigo,
        codigo_departamento: row.departamento_codigo,
        codigo_conta_corrente: row.conta_id,
        valor: valorNumerico,
        data_vencimento: dataVencimento,
        data_pagamento: dataPagamento,
        observacao: row.original.Observação || ''
      });

      if (res.data.success) {
        const realizado = {
          acao: 'Atualizado cadastro',
          fornecedor: row.fornecedor_nome || row.original.NOMEFORNECEDOR || '',
          valor: valorNumerico,
          vencimento: dataVencimento,
          pagamento: dataPagamento,
          departamento: row.departamento_codigo,
          codigo_lancamento_omie: codigoLancamentoOmie,
          codigo_baixa: '',
          documento: row.pagamentos_vinculados?.[0]?.numero_documento || row.original['Nº NF'] || '',
          parcela: row.pagamentos_vinculados?.[0]?.parcela || ''
        };

        setRows(prev => prev.map(r => r.internal_id === row.internal_id ? {
          ...r,
          status: 'SUCESSO',
          acao_importacao: 'ATUALIZAR',
          omie_id_gerado: codigoLancamentoOmie,
          mensagem_erro: undefined,
        } : r));
        return realizado;
      }
    } catch (err: any) {
      setRows(prev => prev.map(r => r.internal_id === row.internal_id ? {
        ...r,
        status: 'ERRO',
        mensagem_erro: err.response?.data?.error || err.message
      } : r));
    }

    return null;
  };

  const lancarSomentePagamento = async (row: RowMapping) => {
    if (row.status === 'SUCESSO' || isNoopRow(row)) return null;

    const validation = getRowValidation(row);
    if (validation.hasErrors) {
       setRows(prev => prev.map(r => r.internal_id === row.internal_id ? {
         ...r,
         status: 'LANCAR_PAGAMENTO',
         mensagem_erro: 'Valor, vencimento ou data de pagamento inválidos.'
       } : r));
       return null;
    }
    
    if (!row.omie_id_gerado || !row.conta_id || !row.categoria_codigo || !row.departamento_codigo) {
       setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { 
         ...r, 
         status: 'ERRO', 
         mensagem_erro: 'Faltam dados obrigatórios para baixa (ID Omie, Categoria, Departamento ou Banco)'
       } : r));
       return null;
    }

    setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { ...r, status: 'PROCESSANDO' } : r));

    try {
      const valorNumerico = validation.valor;
      const dataVencimento = formatExcelDate(row.original.Vencimento);
      const dataPagamento = formatExcelDate(row.original.PGTO);

      const payload = {
        codigo_lancamento_omie: row.omie_id_gerado,
        codigo_conta_corrente: row.conta_id,
        codigo_categoria: row.categoria_codigo,
        codigo_departamento: row.departamento_codigo,
        codigo_fornecedor: row.fornecedor_id,
        data_vencimento: dataVencimento,
        valor: valorNumerico,
        data_pagamento: dataPagamento,
        observacao: "Baixa avulsa automática via Omie Validator"
      };

      const res = await axios.post('/api/omie/contas-pagar/pagar', payload);
      
      if (res.data.success) {
        const realizado = {
          acao: 'Atualizada baixa',
          fornecedor: row.fornecedor_nome || row.original.NOMEFORNECEDOR || '',
          valor: valorNumerico,
          vencimento: dataVencimento,
          pagamento: dataPagamento,
          departamento: row.departamento_codigo,
          codigo_lancamento_omie: row.omie_id_gerado,
          codigo_baixa: res.data.codigo_baixa || '',
          documento: row.pagamentos_vinculados?.[0]?.numero_documento || row.original['Nº NF'] || '',
          parcela: row.pagamentos_vinculados?.[0]?.parcela || ''
        };

        setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { 
          ...r, 
          status: 'SUCESSO',
          acao_importacao: 'ATUALIZAR'
        } : r));
        return realizado;
      }
    } catch (err: any) {
      setRows(prev => prev.map(r => r.internal_id === row.internal_id ? { 
        ...r, 
        status: 'LANCAR_PAGAMENTO', 
        mensagem_erro: err.response?.data?.error || err.message 
      } : r));
    }
    return null;
  };

  const processarImportacao = async () => {
    setIsProcessing(true);
    const rowsSelecionadas = rows.filter(row => row.selecionado ?? true);
    const realizados: Record<string, any>[] = [];

    for (const row of rowsSelecionadas) {
      if (row.status === 'ERRO' || row.acao_importacao === 'REVISAR' || isNoopRow(row)) {
        continue;
      }
      let realizado = null;
      if (row.status === 'LANCAR_PAGAMENTO') {
        realizado = await lancarSomentePagamento(row);
      } else if (row.acao_importacao === 'ATUALIZAR' && getLinkedOmieId(row)) {
        realizado = await atualizarCadastroExistente(row);
      } else {
        realizado = await processarLinha(row);
      }
      if (realizado) {
        realizados.push(realizado);
      }
      await new Promise(res => setTimeout(res, 300));
    }
    setIsProcessing(false);

    if (realizados.length > 0) {
      baixarCsvTexto(`Realizados_ContasPagar_${new Date().getTime()}.csv`, realizados);
    }
  };

  const gerarLogCSV = () => {
    const csvData = rows.map(r => ({
      'Fornecedor Planilha': r.original.NOMEFORNECEDOR,
      'NF': r.original['Nº NF'],
      'Valor Planilha': r.original.Saída,
      'Fornecedor Omie ID': r.fornecedor_id || '',
      'Fornecedor Omie Nome': r.fornecedor_nome || '',
      'Categoria Omie': r.categoria_codigo || '',
      'Departamento Omie': r.departamento_codigo || '',
      'Conta Corrente Omie ID': r.conta_id || '',
      'Pagamentos Vinculados': (r.pagamentos_vinculados || []).map(p => `ID ${p.codigo} (${p.status})`).join(' | '),
      'Documento Omie': (r.pagamentos_vinculados || []).map(p => p.numero_documento || '').filter(Boolean).join(' | '),
      'Parcela Omie': (r.pagamentos_vinculados || []).map(p => p.parcela || '').filter(Boolean).join(' | '),
      'Ação': r.acao_importacao || '',
      'Selecionado': (r.selecionado ?? true) ? 'Sim' : 'Não',
      'Status': r.status,
      'Mensagem Erro': r.mensagem_erro || '',
      'ID Gerado Omie': r.omie_id_gerado || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(csvData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Log");
    XLSX.writeFile(workbook, `Log_Importacao_ContasPagar_${new Date().getTime()}.csv`);
  };

  const selectedRows = rows.filter(r => (r.selecionado ?? true) && !getRowValidation(r).hasErrors && r.status !== 'ERRO');
  const rowsProcessaveisSelecionadas = selectedRows.filter(r =>
    !isNoopRow(r) &&
    r.status !== 'SUCESSO' &&
    r.status !== 'ERRO' &&
    r.acao_importacao !== 'REVISAR'
  );
  const totalItensImportados = rows.length;
  const totalConcluidos = rows.filter(isNoopRow).length;
  const totalProcessados = rows.filter(r => r.status === 'SUCESSO').length;
  const totalAtualizaveis = rows.filter(r =>
    !isNoopRow(r) &&
    r.status !== 'SUCESSO' &&
    (r.acao_importacao === 'ATUALIZAR' || r.status === 'LANCAR_PAGAMENTO')
  ).length;
  const totalItensNovos = Math.max(totalItensImportados - totalAtualizaveis - totalProcessados - totalConcluidos, 0);
  const totalErros = rows.filter(r => r.status === 'ERRO').length;
  const rowsComPendencias = rows.filter(r => {
    const validation = getRowValidation(r);
    return validation.hasErrors || !validation.fornecedorLocalizado || !r.categoria_codigo || !r.departamento_codigo;
  });
  const isReady = rowsProcessaveisSelecionadas.length > 0 && rowsProcessaveisSelecionadas.every(r =>
    getRowValidation(r).canImport &&
    r.fornecedor_id &&
    r.categoria_codigo &&
    r.departamento_codigo &&
    r.conta_id &&
    r.status !== 'ERRO' &&
    r.acao_importacao !== 'REVISAR'
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-20">
      {isMatchingOverlayVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-indigo-100 bg-white p-8 shadow-2xl">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Buscando no Omie</h2>
                <p className="text-sm text-slate-500">Os fornecedores e pagamentos vinculados estao sendo validados.</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
                <span>Item em validacao</span>
                <span>{matchProgress.current} de {matchProgress.total}</span>
              </div>
              <div className="mt-3 text-base font-bold text-slate-900 break-words">
                {currentMatchItem || 'Preparando processamento...'}
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${matchProgress.total > 0 ? (matchProgress.current / matchProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      
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
            {hasStoredRows && (
              <button
                onClick={limparDadosLocais}
                disabled={isProcessing}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" /> Limpar Dados
              </button>
            )}

            <button
              onClick={() => autoMatchFornecedores()}
              disabled={isProcessing || selectedRows.length === 0}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2"
            >
              <Search className="w-4 h-4" /> Buscar Omie
            </button>

            <button
              onClick={processarImportacao}
              disabled={!isReady || isProcessing}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isProcessing ? 'Processando...' : 'Integrar'}
            </button>

            <button
              onClick={gerarLogCSV}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" /> Baixar Log CSV
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
                     {metadataWarning && (
                       <div className="w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                         {metadataWarning}
                       </div>
                     )}
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
                <div>
                  <h3 className="font-bold text-slate-700">Mapeamento de Dados ({rows.length} registros encontrados)</h3>
                  {metadataWarning && (
                    <div className="mt-1 text-xs text-amber-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3"/> {metadataWarning}
                    </div>
                  )}
                </div>
                {!isReady && <span className="text-amber-600 text-sm font-medium flex items-center gap-1"><AlertCircle className="w-4 h-4"/> Selecione registros válidos e preencha os campos vazios para liberar a importação.</span>}
                {isReady && <span className="text-emerald-600 text-sm font-medium flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/> {rowsProcessaveisSelecionadas.length} registro(s) pronto(s) para processamento!</span>}
              </div>

              {/* RESUMO VISUAL */}
              {rows.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4 p-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                  <div className="bg-white rounded-lg p-3 border-l-4 border-indigo-500 shadow-sm">
                    <div className="text-xs text-slate-500 font-semibold uppercase">Itens importados</div>
                    <div className="text-2xl font-bold text-indigo-600 mt-1">{totalItensImportados}</div>
                    <div className="text-xs text-slate-400 mt-1">Total da planilha</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border-l-4 border-sky-500 shadow-sm">
                    <div className="text-xs text-slate-500 font-semibold uppercase">Itens novos</div>
                    <div className="text-2xl font-bold text-sky-600 mt-1">{totalItensNovos}</div>
                    <div className="text-xs text-slate-400 mt-1">Para inserir</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border-l-4 border-amber-500 shadow-sm">
                    <div className="text-xs text-slate-500 font-semibold uppercase">Atualizáveis</div>
                    <div className="text-2xl font-bold text-amber-600 mt-1">{totalAtualizaveis}</div>
                    <div className="text-xs text-slate-400 mt-1">Baixa/título existente</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border-l-4 border-emerald-500 shadow-sm">
                    <div className="text-xs text-slate-500 font-semibold uppercase">Processados</div>
                    <div className="text-2xl font-bold text-emerald-600 mt-1">{totalProcessados}</div>
                    <div className="text-xs text-slate-400 mt-1">Finalizados com sucesso</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border-l-4 border-teal-500 shadow-sm">
                    <div className="text-xs text-slate-500 font-semibold uppercase">Concluídos</div>
                    <div className="text-2xl font-bold text-teal-600 mt-1">{totalConcluidos}</div>
                    <div className="text-xs text-slate-400 mt-1">Nada a fazer</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border-l-4 border-rose-500 shadow-sm">
                    <div className="text-xs text-slate-500 font-semibold uppercase">Pendências</div>
                    <div className="text-2xl font-bold text-rose-600 mt-1">{rowsComPendencias.length}</div>
                    <div className="text-xs text-slate-400 mt-1">Em todos os itens</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border-l-4 border-rose-500 shadow-sm">
                    <div className="text-xs text-slate-500 font-semibold uppercase">Erros</div>
                    <div className="text-2xl font-bold text-rose-600 mt-1">{totalErros}</div>
                    <div className="text-xs text-slate-400 mt-1">Em todos os itens</div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                 <table className="w-full text-left text-[11px]">
                   <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase text-[10px] tracking-wider">
                     <tr>
                       <th className="px-4 py-3 font-semibold text-center">
	                         <input
	                           type="checkbox"
	                           checked={rows.some(r => !getRowValidation(r).hasErrors && r.status !== 'ERRO') && rows.filter(r => !getRowValidation(r).hasErrors && r.status !== 'ERRO').every(r => r.selecionado ?? true)}
	                           onChange={toggleSelecionarTodos}
	                           disabled={isProcessing}
                           className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                           aria-label="Selecionar todos os registros"
                         />
                       </th>
                       <th className="px-4 py-3 font-semibold">Status</th>
                       <th className="px-4 py-3 font-semibold">Fornecedor</th>
                       <th className="px-4 py-3 font-semibold">Histórico</th>
                       <th className="px-4 py-3 font-semibold">Valor</th>
                       <th className="px-4 py-3 font-semibold text-center">Venc.</th>
                       <th className="px-4 py-3 font-semibold text-center">PGTO</th>
                       <th className="px-4 py-3 font-semibold text-indigo-600">Omie: Categoria</th>
                       <th className="px-4 py-3 font-semibold text-indigo-600">Omie: Departamento</th>
                       <th className="px-4 py-3 font-semibold text-indigo-600">Omie: Banco</th>
                       <th className="px-4 py-3 font-semibold text-indigo-600">Omie: Pagamentos</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {rows.map(row => {
                       const validation = getRowValidation(row);
                       const valorErrorClass = validation.valorValido
                         ? 'bg-slate-100 border-transparent focus-within:border-indigo-400'
                         : 'bg-rose-50 border-rose-300 focus-within:border-rose-500';
                       const dateErrorClass = 'bg-rose-50 text-rose-700 border border-rose-200 rounded-md';
                       const fornecedorWarningClass = !validation.fornecedorLocalizado
                         ? 'bg-amber-50 text-amber-700 border border-amber-200 rounded-md'
                         : '';
	                       const hasDataErrors = validation.hasErrors;
	                       const canSelectRow = !hasDataErrors && row.status !== 'ERRO';
	                       const isSelected = canSelectRow && (row.selecionado ?? true);
                       const rowColorClass = hasDataErrors || row.status === 'ERRO'
	                         ? 'bg-rose-100 hover:bg-rose-100'
                         : !validation.fornecedorLocalizado
                           ? 'bg-amber-50 hover:bg-amber-100'
                           : 'hover:bg-slate-50/50';
                       const rowSelectionClass = !canSelectRow || isSelected ? '' : 'opacity-55';

                       return (
                       <tr key={row.internal_id} className={`${rowColorClass} ${rowSelectionClass}`}>
                         <td className="px-4 py-4 text-center align-top">
	                           <input
	                             type="checkbox"
	                             checked={isSelected}
	                             onChange={() => toggleSelecionado(row.internal_id)}
	                             disabled={isProcessing || !canSelectRow}
	                             className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                             aria-label={`Selecionar registro ${row.original.NOMEFORNECEDOR || row.internal_id}`}
                           />
                         </td>
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
                           {row.status === 'JA_CADASTRADO' && (
                             <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex flex-col gap-1">
                               <div className="text-emerald-700 font-bold text-xs flex items-center gap-1">
                                 <CheckCircle2 className="w-4 h-4"/> Já Cadastrado
                               </div>
                               <p className="text-[11px] text-emerald-600 leading-tight">
                                 Título já possui baixa no Omie. Nenhuma ação será executada.
                               </p>
                               {row.duplicados_info && (
                                 <p className="text-[10px] text-emerald-500 font-mono mt-1 bg-white/50 px-1.5 py-0.5 rounded">
                                   {row.duplicados_info}
                                 </p>
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
                                    Será atualizada a baixa.
                                  </p>
                                  {row.duplicados_info && (
                                    <p className="text-[10px] text-amber-500 font-mono mt-1 bg-white/50 px-1.5 py-0.5 rounded">
                                      {row.duplicados_info}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => lancarSomentePagamento(row)}
                                  disabled={!isSelected || !validation.canImport || !row.conta_id || !row.categoria_codigo || !row.departamento_codigo}
                                  className="flex items-center justify-center gap-1 px-2 py-1.5 bg-amber-500 text-white rounded font-bold text-[11px] hover:bg-amber-600 transition disabled:opacity-30 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                                >
                                  <Play className="w-3 h-3" /> Atualizar Baixa
                                </button>
                              </div>
                            )}
                            {row.status === 'ERRO' && (
                              <div className="flex flex-col gap-2">
	                                {row.is_duplicate ? (
	                                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 flex flex-col gap-1">
	                                    <div className="text-rose-700 font-bold text-xs flex items-center gap-1">
	                                      <AlertCircle className="w-4 h-4"/> Revisar
	                                    </div>
	                                    <p className="text-[11px] text-rose-600 leading-tight">
	                                      {row.mensagem_erro || 'O vínculo encontrado no Omie precisa de revisão.'}
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
                                    onClick={() => row.acao_importacao === 'ATUALIZAR' && getLinkedOmieId(row)
                                      ? atualizarCadastroExistente(row)
                                      : processarLinha(row)
                                    }
                                    className="text-[11px] bg-rose-100 text-rose-600 px-2 py-1 rounded hover:bg-rose-200 transition font-semibold"
                                  >
                                    Tentar Novamente
                                  </button>
                                )}
                              </div>
                            )}
                            {row.status === 'PENDENTE' && !isNoopRow(row) && (
                              <button
                                onClick={() => row.acao_importacao === 'ATUALIZAR' && getLinkedOmieId(row)
                                  ? atualizarCadastroExistente(row)
                                  : processarLinha(row)
                                }
                                disabled={!isSelected || !validation.canImport || !row.categoria_codigo || !row.departamento_codigo || !row.conta_id}
                                className="mt-1 flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold hover:bg-indigo-600 hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Play className="w-3 h-3" /> {row.acao_importacao === 'ATUALIZAR' ? 'Atualizar Cadastro' : 'Importar'}
                              </button>
                            )}
                         </td>

                         {/* PLANILHA: NOME */}
                         <td className={`px-4 py-4 font-medium ${validation.fornecedorLocalizado ? 'text-slate-700' : 'text-amber-700'}`}>
                           <div className="min-w-[260px] space-y-3">
                             <div>
                               <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Fornecedor</div>
                               <div className={validation.fornecedorLocalizado ? 'mt-1' : 'mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1'}>
                                 {row.original.NOMEFORNECEDOR || '-'}
                                 {!validation.fornecedorLocalizado && (
                                   <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                                     Fornecedor não localizado
                                   </div>
                                 )}
                               </div>
                             </div>

                             <div>
                               <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">OMIE: FORNECEDOR</div>
                               <div className="relative">
                                 {row.status !== 'PENDENTE' && row.status !== 'ERRO' && row.status !== 'LANCAR_PAGAMENTO' && row.status !== 'JA_CADASTRADO' && row.status !== 'SUCESSO' ? (
                                    <div className="flex flex-col">
                                      <div className="text-[11px] font-semibold text-slate-800">{row.fornecedor_nome}</div>
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
                                             className={`w-full pl-8 pr-3 py-1.5 text-[11px] focus:ring-2 focus:ring-indigo-400 outline-none ${!validation.fornecedorLocalizado ? 'bg-amber-50 border border-amber-200 rounded-md text-amber-800' : 'bg-slate-100 border border-slate-200 rounded-md'}`}
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
                                                     className="w-full text-left px-3 py-2 text-[11px] hover:bg-indigo-50 hover:text-indigo-700 rounded-md transition flex flex-col"
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
                                           className={`flex items-center justify-between w-full px-3 py-1.5 text-[11px] cursor-pointer group ${fornecedorWarningClass || 'bg-indigo-50 border border-indigo-100 rounded-md'}`}
                                           onClick={() => setActiveSearchRow(row.internal_id)}
                                         >
                                           <span className="font-semibold text-indigo-800 truncate max-w-[150px]" title={row.fornecedor_nome!}>{row.fornecedor_nome}</span>
                                           <span className="text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition">Alterar</span>
                                         </div>
                                       )}
                                    </div>
                                 )}
                              </div>
                             </div>
                           </div>
                         </td>

                         {/* HISTORICO */}
                         <td className="px-4 py-4 text-xs text-slate-500 max-w-[300px] truncate" title={row.original.HISTÓRICO}>
                           {row.original.HISTÓRICO || '-'}
                         </td>

                         {/* VALOR */}
                         <td className="px-4 py-4 font-bold text-slate-800 whitespace-nowrap">
                           <div className={`flex items-center gap-1 px-2 py-1 rounded border transition-all ${valorErrorClass}`}>
                             <span className={`text-xs ${validation.valorValido ? 'text-slate-400' : 'text-rose-500'}`}>R$</span>
                             <input 
                               type="text"
                               className={`bg-transparent outline-none w-24 text-[11px] font-bold ${validation.valorValido ? 'text-slate-800' : 'text-rose-700'}`}
                               value={String(row.original.Saída || "").replace('R$', '').trim()}
                               onChange={(e) => atualizarValor(row.internal_id, e.target.value)}
                             />
                           </div>
                           {!validation.valorValido && (
                             <div className="mt-1 text-[10px] font-semibold text-rose-600">Valor inválido</div>
                           )}
                         </td>

                         {/* VENCIMENTO */}
                         <td className="px-4 py-4 text-xs text-slate-500 whitespace-nowrap text-center">
                           <span className={`inline-flex px-2 py-1 ${validation.vencimentoValido ? '' : dateErrorClass}`}>
                             {formatExcelDate(row.original.Vencimento) || 'Inválido'}
                           </span>
                         </td>

                         {/* PGTO */}
                         <td className="px-4 py-4 text-xs text-indigo-600 font-semibold whitespace-nowrap text-center">
                           <span className={`inline-flex px-2 py-1 ${validation.pagamentoValido ? '' : dateErrorClass}`}>
                             {formatExcelDate(row.original.PGTO) || 'Inválido'}
                           </span>
                         </td>

                         {/* OMIE: CATEGORIA */}
                         <td className="px-4 py-4 w-80">
                            <select
                              disabled={row.status !== 'PENDENTE' && row.status !== 'ERRO' && row.status !== 'LANCAR_PAGAMENTO' && row.status !== 'JA_CADASTRADO' && row.status !== 'SUCESSO'}
                              value={row.categoria_codigo || ''}
                              onChange={(e) => {
                                atualizarCategoria(row.internal_id, e.target.value);
                              }}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-md text-[11px] focus:ring-2 focus:ring-indigo-400 outline-none disabled:bg-slate-50 disabled:text-slate-500"
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

                         {/* OMIE: DEPARTAMENTO */}
                         <td className="px-4 py-4 w-80">
                            <select
                              disabled={row.status !== 'PENDENTE' && row.status !== 'ERRO' && row.status !== 'LANCAR_PAGAMENTO' && row.status !== 'JA_CADASTRADO' && row.status !== 'SUCESSO'}
                              value={row.departamento_codigo || ''}
                              onChange={(e) => {
                                atualizarDepartamento(row.internal_id, e.target.value);
                              }}
                              className={`w-full px-2 py-1.5 bg-white border rounded-md text-[11px] focus:ring-2 focus:ring-indigo-400 outline-none disabled:bg-slate-50 disabled:text-slate-500 ${row.departamento_codigo ? 'border-slate-200' : 'border-amber-300 bg-amber-50 text-amber-800'}`}
                            >
                               <option value="">Selecione...</option>
                               {departamentos.map(dep => (
                                 <option key={dep.codigo} value={dep.codigo}>
                                   {dep.descricao} ({dep.codigo})
                                 </option>
                               ))}
                            </select>
                            {!row.departamento_codigo && (
                              <div className="mt-1 text-[10px] font-semibold text-amber-600">Departamento obrigatório</div>
                            )}
                         </td>

                         {/* OMIE: CONTA CORRENTE */}
                         <td className="px-4 py-4 w-64">
                            <select
                              disabled={row.status !== 'PENDENTE' && row.status !== 'ERRO' && row.status !== 'LANCAR_PAGAMENTO' && row.status !== 'JA_CADASTRADO' && row.status !== 'SUCESSO'}
                              value={row.conta_id || ''}
                              onChange={(e) => {
                                const value = e.target.value ? Number(e.target.value) : null;
                                atualizarContaCorrente(row.internal_id, value);
                              }}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-md text-[11px] focus:ring-2 focus:ring-indigo-400 outline-none disabled:bg-slate-50 disabled:text-slate-500"
                            >
                               <option value="">Selecione...</option>
                               {contas.map(c => (
                                 <option key={c.id_conta_corrente} value={c.id_conta_corrente}>
                                   {c.descricao}
                                 </option>
                               ))}
                            </select>
                         </td>

                         {/* OMIE: PAGAMENTOS VINCULADOS */}
                         <td className="px-4 py-4 min-w-[180px]">
                           {(row.pagamentos_vinculados || []).length > 0 ? (
                             <div className="flex flex-col gap-1">
                               {row.pagamentos_vinculados!.map(pgto => (
                                 <div key={pgto.codigo} className="rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1">
                                   <div className="text-xs font-bold text-indigo-700">ID {pgto.codigo}</div>
                                   <div className="text-[10px] text-slate-500">
                                     {pgto.status} - R$ {pgto.valor} - Vto {pgto.vencimento}
                                   </div>
                                   <div className="text-[10px] text-slate-500">
                                     Doc {pgto.numero_documento || pgto.nf || 'N/A'} - Parcela {pgto.parcela || 'N/A'}
                                   </div>
                                   <div className="text-[10px] text-slate-500">
                                     Dep {pgto.departamento_nome || pgto.departamento_codigo || 'N/A'}
                                   </div>
                                 </div>
                               ))}
                             </div>
                           ) : (
                             <span className="text-xs text-slate-400">Nenhum vínculo</span>
                           )}
                         </td>

                         {/* REMOVED DUPLICATE VALOR FROM END */}
                       </tr>
                       );
                     })}
                   </tbody>
                 </table>
              </div>
           </div>
        )}

      </main>
    </div>
  );
}
