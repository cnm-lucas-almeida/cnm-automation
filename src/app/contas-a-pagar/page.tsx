'use client';

import { Fragment, useState, useEffect, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { 
  UploadCloud, CheckCircle2, AlertCircle, Play, 
  Loader2, Search, FileSpreadsheet, Wallet, Trash2, ChevronDown, ChevronUp
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

type RowValidation = {
  valor: number;
  valorValido: boolean;
  vencimentoValido: boolean;
  pagamentoValido: boolean;
  fornecedorLocalizado: boolean;
  hasErrors: boolean;
  canImport: boolean;
};

type StatusDisplay = {
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  title: string;
  description: string;
  monoLine?: string;
  detailLines?: string[];
};

type WorkflowSteps = {
  importarPlanilha: boolean;
  buscarFornecedores: boolean;
  buscarCategoria: boolean;
  buscarDepartamento: boolean;
  buscarBanco: boolean;
  finalizandoListando: boolean;
};

const INITIAL_WORKFLOW_STEPS: WorkflowSteps = {
  importarPlanilha: false,
  buscarFornecedores: false,
  buscarCategoria: false,
  buscarDepartamento: false,
  buscarBanco: false,
  finalizandoListando: false,
};

const STORAGE_KEY = 'omie-validator:contas-a-pagar:rows';

function ChavesNaMaoLogo({ className = 'h-9 w-auto' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 478 70" fill="none" aria-label="Chaves na Mão">
      <path fill="#2a2a2f" d="M426.614 15.67c2.938 0 4.134 2.317 6.314 2.317 1.196 0 2.125-.683 2.339-2.214h3.483c-.598 4.159-2.991 6.165-6.144 6.165-2.938 0-4.135-2.37-6.314-2.37-1.197 0-2.126.735-2.34 2.266h-3.483c.599-4.159 2.992-6.164 6.145-6.164zM312.438 38.171v19.807h-7.647V40.177c0-1.233-.303-2.35-.909-3.353a6.61 6.61 0 00-2.444-2.413c-1.003-.606-2.121-.91-3.354-.91-1.232 0-2.361.304-3.384.91a6.679 6.679 0 00-2.413 2.413c-.585 1.003-.878 2.12-.878 3.353v17.8h-7.647l-.031-31.339h7.647l.031 2.79a11.55 11.55 0 013.824-2.664c1.483-.669 3.081-1.003 4.794-1.003 2.278 0 4.357.564 6.237 1.692a12.452 12.452 0 014.481 4.482c1.129 1.86 1.693 3.938 1.693 6.236zM339.819 26.638h7.647v31.34h-7.647l-.345-3.886a10.262 10.262 0 01-3.416 3.416c-1.399.856-3.06 1.284-4.983 1.284-2.319 0-4.492-.438-6.518-1.316a17.132 17.132 0 01-5.359-3.635 17.401 17.401 0 01-3.604-5.36c-.857-2.026-1.285-4.199-1.285-6.518 0-2.235.407-4.335 1.222-6.299a16.313 16.313 0 018.618-8.65c1.943-.835 4.033-1.253 6.268-1.253 2.069 0 3.918.46 5.547 1.379 1.651.92 3.051 2.09 4.2 3.51l-.345-4.012zm-8.932 24.79c1.63 0 3.072-.408 4.325-1.222 1.254-.815 2.236-1.912 2.946-3.291.71-1.4 1.066-2.935 1.066-4.607 0-1.692-.356-3.228-1.066-4.607-.71-1.4-1.703-2.507-2.977-3.322-1.254-.815-2.685-1.222-4.294-1.222-1.608 0-3.081.418-4.418 1.254a9.194 9.194 0 00-3.166 3.29c-.773 1.38-1.159 2.915-1.159 4.607 0 1.692.397 3.228 1.191 4.607a9.199 9.199 0 003.165 3.29 8.271 8.271 0 004.387 1.223zM360.224 57.978v-31.34h7.647v2.79a11.555 11.555 0 013.823-2.664c1.484-.669 3.082-1.003 4.795-1.003 2.173 0 4.168.512 5.986 1.536 1.839 1.023 3.301 2.392 4.388 4.105 1.107-1.713 2.569-3.082 4.387-4.105 1.818-1.024 3.813-1.536 5.986-1.536 2.298 0 4.377.564 6.236 1.692a12.447 12.447 0 014.482 4.482c1.128 1.86 1.692 3.938 1.692 6.236v19.807H402v-17.77a6.3 6.3 0 00-.909-3.322 6.681 6.681 0 00-2.382-2.444c-.982-.627-2.089-.94-3.322-.94s-2.351.303-3.353.909a6.843 6.843 0 00-2.382 2.381c-.606 1.003-.909 2.142-.909 3.416v17.77h-7.647v-17.77c0-1.274-.292-2.413-.877-3.416a6.51 6.51 0 00-2.382-2.381c-1.003-.606-2.121-.91-3.353-.91a6.14 6.14 0 00-3.322.94 6.926 6.926 0 00-2.413 2.445c-.585 1.003-.878 2.11-.878 3.322v17.77h-7.647zM437.062 26.638h7.647v31.34h-7.647l-.344-3.886a10.28 10.28 0 01-3.416 3.416c-1.4.856-3.061 1.284-4.983 1.284-2.319 0-4.492-.438-6.519-1.316a17.132 17.132 0 01-5.359-3.635 17.42 17.42 0 01-3.604-5.36c-.857-2.026-1.285-4.199-1.285-6.518 0-2.235.408-4.335 1.222-6.299a16.317 16.317 0 018.619-8.65c1.943-.835 4.032-1.253 6.268-1.253 2.068 0 3.917.46 5.547 1.379 1.65.92 3.05 2.09 4.199 3.51l-.345-4.012zm-8.931 24.79c1.629 0 3.071-.408 4.324-1.222 1.254-.815 2.236-1.912 2.946-3.291.711-1.4 1.066-2.935 1.066-4.607 0-1.692-.355-3.228-1.066-4.607-.71-1.4-1.702-2.507-2.977-3.322-1.253-.815-2.685-1.222-4.293-1.222-1.609 0-3.082.418-4.419 1.254a9.191 9.191 0 00-3.165 3.29c-.774 1.38-1.16 2.915-1.16 4.607 0 1.692.397 3.228 1.191 4.607a9.199 9.199 0 003.165 3.29 8.275 8.275 0 004.388 1.223zM462.251 58.792c-2.883 0-5.516-.741-7.898-2.224-2.361-1.484-4.251-3.469-5.672-5.955-1.4-2.507-2.1-5.276-2.1-8.305 0-2.298.408-4.44 1.222-6.425.815-2.005 1.933-3.76 3.354-5.265a15.723 15.723 0 015.014-3.572c1.901-.857 3.928-1.285 6.08-1.285 2.883 0 5.505.742 7.866 2.225 2.382 1.483 4.273 3.479 5.672 5.986 1.421 2.507 2.131 5.286 2.131 8.336 0 2.277-.407 4.409-1.222 6.393a16.99 16.99 0 01-3.384 5.265 15.606 15.606 0 01-4.983 3.542c-1.881.856-3.907 1.284-6.08 1.284zm0-7.646c1.525 0 2.893-.408 4.105-1.223a8.52 8.52 0 002.852-3.227c.71-1.338 1.066-2.8 1.066-4.388 0-1.63-.366-3.113-1.097-4.45-.711-1.358-1.682-2.434-2.915-3.228a7.036 7.036 0 00-4.011-1.222c-1.504 0-2.863.407-4.074 1.222-1.212.815-2.173 1.901-2.884 3.26-.71 1.357-1.065 2.83-1.065 4.418 0 1.65.366 3.144 1.097 4.482.731 1.337 1.703 2.402 2.914 3.196a7.411 7.411 0 004.012 1.16zM107.826 48.545l6.894 3.729a16.435 16.435 0 01-5.421 4.732c-2.173 1.191-4.545 1.786-7.114 1.786-2.884 0-5.516-.741-7.898-2.224-2.36-1.484-4.252-3.469-5.672-5.955-1.4-2.507-2.1-5.276-2.1-8.305 0-2.298.407-4.44 1.222-6.425.815-2.005 1.933-3.76 3.353-5.265a15.727 15.727 0 015.015-3.572c1.9-.857 3.928-1.285 6.08-1.285 2.569 0 4.941.595 7.114 1.786a16.156 16.156 0 015.421 4.795l-6.894 3.698a7.671 7.671 0 00-2.602-1.943 7.092 7.092 0 00-3.039-.69c-1.505 0-2.863.419-4.075 1.254-1.211.815-2.172 1.901-2.883 3.26-.71 1.337-1.065 2.8-1.065 4.387 0 1.567.355 3.03 1.065 4.388.71 1.337 1.672 2.413 2.883 3.227 1.212.815 2.57 1.223 4.075 1.223 1.086 0 2.12-.23 3.102-.69a8.222 8.222 0 002.539-1.911zM146.194 38.171v19.807h-7.647V40.177c0-1.233-.303-2.35-.909-3.353a6.61 6.61 0 00-2.444-2.413c-1.003-.606-2.121-.91-3.354-.91-1.232 0-2.361.304-3.384.91a6.671 6.671 0 00-2.413 2.413c-.585 1.003-.878 2.12-.878 3.353v17.8h-7.647l-.031-47.008h7.647l.031 18.459a11.555 11.555 0 013.823-2.664c1.484-.669 3.082-1.003 4.795-1.003 2.278 0 4.357.564 6.237 1.692a12.452 12.452 0 014.481 4.482c1.129 1.86 1.693 3.938 1.693 6.236zM173.575 26.638h7.647v31.34h-7.647l-.345-3.886a10.262 10.262 0 01-3.416 3.416c-1.4.856-3.061 1.284-4.983 1.284-2.319 0-4.492-.438-6.518-1.316a17.132 17.132 0 01-5.359-3.635 17.401 17.401 0 01-3.604-5.36c-.857-2.026-1.285-4.199-1.285-6.518 0-2.235.407-4.335 1.222-6.299a16.313 16.313 0 018.618-8.65c1.943-.835 4.033-1.253 6.268-1.253 2.069 0 3.918.46 5.547 1.379 1.651.92 3.051 2.09 4.2 3.51l-.345-4.012zm-8.932 24.79c1.63 0 3.072-.408 4.325-1.222 1.254-.815 2.236-1.912 2.946-3.291.71-1.4 1.066-2.935 1.066-4.607 0-1.692-.356-3.228-1.066-4.607-.71-1.4-1.703-2.507-2.977-3.322-1.254-.815-2.685-1.222-4.294-1.222-1.608 0-3.081.418-4.419 1.254a9.2 9.2 0 00-3.165 3.29c-.773 1.38-1.159 2.915-1.159 4.607 0 1.692.397 3.228 1.191 4.607a9.19 9.19 0 003.165 3.29 8.271 8.271 0 004.387 1.223zM203.516 57.978h-9.872l-11.407-31.37h8.148l8.211 22.563 8.18-22.564h8.148l-11.408 31.37zM230.242 58.792c-2.883 0-5.515-.741-7.897-2.224-2.361-1.484-4.252-3.48-5.673-5.986-1.399-2.508-2.099-5.276-2.099-8.305 0-2.278.407-4.409 1.222-6.394.815-2.005 1.933-3.76 3.353-5.265a15.727 15.727 0 015.015-3.572c1.901-.857 3.927-1.285 6.079-1.285 2.445 0 4.68.522 6.707 1.567a15.243 15.243 0 015.202 4.23c1.421 1.797 2.455 3.845 3.103 6.143.648 2.298.794 4.701.439 7.208h-22.909a9.298 9.298 0 001.441 3.166 7.675 7.675 0 002.539 2.225c1.023.543 2.183.825 3.478.846 1.338.02 2.549-.293 3.636-.94a8.5 8.5 0 002.758-2.696l7.803 1.818c-1.274 2.779-3.176 5.056-5.704 6.832-2.528 1.755-5.359 2.633-8.493 2.633zm-7.709-19.618h15.419a7.957 7.957 0 00-1.473-3.385 8.25 8.25 0 00-2.727-2.444 7.088 7.088 0 00-3.51-.909 6.915 6.915 0 00-3.478.909 8.335 8.335 0 00-2.727 2.413 8.852 8.852 0 00-1.504 3.416zM258.401 58.542a17.341 17.341 0 01-4.732-.972 14.02 14.02 0 01-4.011-2.288 9.804 9.804 0 01-2.696-3.447l6.456-2.758c.251.418.658.867 1.223 1.348.564.46 1.232.846 2.005 1.16.794.313 1.661.47 2.601.47.794 0 1.546-.105 2.257-.314.731-.23 1.316-.574 1.755-1.034.459-.46.689-1.055.689-1.786 0-.773-.271-1.369-.815-1.787-.522-.438-1.19-.762-2.005-.971a65.646 65.646 0 00-2.319-.627 22.777 22.777 0 01-5.547-1.849c-1.693-.836-3.061-1.912-4.106-3.228-1.024-1.337-1.536-2.946-1.536-4.826 0-2.069.544-3.855 1.63-5.36 1.107-1.503 2.539-2.663 4.294-3.478 1.776-.815 3.687-1.222 5.735-1.222 2.486 0 4.763.522 6.832 1.567 2.089 1.024 3.74 2.476 4.951 4.356l-6.048 3.573a5.025 5.025 0 00-1.222-1.38 6.647 6.647 0 00-1.787-1.065 6.054 6.054 0 00-2.099-.501c-.941-.042-1.797.042-2.57.25-.773.21-1.4.565-1.881 1.066-.459.502-.689 1.17-.689 2.006 0 .794.313 1.39.94 1.786.627.376 1.379.669 2.256.878.899.209 1.755.438 2.57.69a31.055 31.055 0 015.171 2.224c1.63.878 2.936 1.954 3.918 3.228.982 1.275 1.452 2.8 1.41 4.576 0 2.026-.606 3.802-1.818 5.327-1.212 1.505-2.778 2.654-4.701 3.448-1.901.794-3.938 1.107-6.111.94z"></path>
      <path fill="#FF0D36" d="M42.807 30.997c-.949.31-1.96.23-2.846-.222a3.715 3.715 0 01-2.03-3.138 3.74 3.74 0 002.03 3.528 3.694 3.694 0 002.846.222 3.716 3.716 0 002.172-1.853 3.83 3.83 0 00.4-1.88 3.627 3.627 0 01-.4 1.49 3.715 3.715 0 01-2.172 1.853z"></path>
      <path fill="#FF0D36" d="M57.755 0h-45.51C5.479 0 0 5.48 0 12.245v45.51C0 64.513 5.48 70 12.245 70h45.51C64.513 70 70 64.52 70 57.755v-45.51C70 5.488 64.52 0 57.755 0zM38.977 43.764l-4.575 10.25a.344.344 0 01-.151.168c-.843.559-1.95.727-3.06.488a4.9 4.9 0 01-1.019-.337c-1.41-.638-2.402-1.853-2.571-3.165a.38.38 0 01.036-.222l4.45-9.957c.063-.133.195-.221.364-.248a.68.68 0 01.496.124c.692.479 1.366.86 2.049 1.18.062.026.115.044.177.061.089.027.177.063.266.098.204.08.399.15.603.213l.124.044h.027v.009a13.6 13.6 0 002.243.559c.177.008.363.132.47.283.106.151.133.32.062.461l.009-.009zm12.51-10.932c-2.793 5.489-9.514 7.678-15.002 4.886a11.018 11.018 0 01-3.697-3.077L18.68 39.225a.473.473 0 01-.248.009.494.494 0 01-.257-.142.486.486 0 01-.098-.506l3.201-7.837a.467.467 0 01.302-.275l8.848-2.873c.027-1.65.373-3.307 1.17-4.877 2.794-5.488 9.514-7.678 15.003-4.885 5.488 2.793 7.678 9.514 4.885 15.002v-.009z"></path>
      <path fill="#FF0D36" d="M43.348 24.507a3.947 3.947 0 00-.922-.328 3.742 3.742 0 00-1.924.106 3.715 3.715 0 00-2.572 3.343c.018.328.071.647.178.966.31.949.966 1.72 1.853 2.172a3.694 3.694 0 002.846.222 3.716 3.716 0 002.571-3.343 3.731 3.731 0 00-2.03-3.147v.009z"></path>
    </svg>
  );
}

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
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowSteps>(INITIAL_WORKFLOW_STEPS);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
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
    setWorkflowSteps(INITIAL_WORKFLOW_STEPS);
    setExpandedRows({});
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
      setExpandedRows({});
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
    let updatedRows = rowsToMatch.map(r => ({ ...r }));
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

      setWorkflowSteps(prev => ({
        ...prev,
        buscarFornecedores: true,
        buscarCategoria: true,
        buscarDepartamento: true,
        buscarBanco: true,
      }));

      return updatedRows;
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

  const formatCurrencyBRL = (value: any) => {
    const amount = parseCurrencyValue(value);
    if (!Number.isFinite(amount)) return String(value ?? 'N/A');

    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(amount);
  };

  const getPagamentoResumoLinhas = (row: RowMapping, pagamento: OmiePagamentoVinculado) => {
    const vencimento = pagamento.vencimento || formatExcelDate(row.original.Vencimento) || 'N/A';
    const documento = pagamento.numero_documento || pagamento.nf || row.original['Nº NF'] || 'N/A';
    const parcela = pagamento.parcela || 'N/A';
    const valorTitulo = formatCurrencyBRL(row.original.Saída);
    const valorBaixa = formatCurrencyBRL(pagamento.valor);
    const dataBaixa = pagamento.data_pagamento || formatExcelDate(row.original.PGTO) || 'N/A';
    const blocoPagamento = pagamento.estaPago
      ? `Pagamento ${pagamento.codigo} - Baixa ${dataBaixa} - Valor ${valorBaixa}`
      : `Pagamento ${pagamento.codigo} - Sem baixa - Valor ${valorBaixa}`;

    return [
      `Doc ${documento} - Parcela ${parcela} - Vencimento ${vencimento} - Valor ${valorTitulo} | ${blocoPagamento}`
    ];
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

  const getRowValidation = (row: RowMapping): RowValidation => {
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

  const getStatusDisplay = (row: RowMapping, validation: RowValidation): StatusDisplay => {
    if (validation.hasErrors || row.status === 'ERRO') {
      return {
        tone: 'danger',
        title: 'ERRO',
        description: row.mensagem_erro || 'Valor, vencimento ou data de pagamento inválidos.',
        monoLine: row.duplicados_info
      };
    }

    if (row.status === 'PROCESSANDO') {
      return {
        tone: 'info',
        title: 'Processando',
        description: 'Enviando os dados para o Omie.'
      };
    }

    if (row.status === 'SUCESSO') {
      return {
        tone: 'success',
        title: 'Importado',
        description: row.omie_id_gerado
          ? `Título e baixa processados no Omie. ID ${row.omie_id_gerado}.`
          : 'Título e baixa processados no Omie.',
        monoLine: row.omie_id_gerado ? `ID ${row.omie_id_gerado}` : undefined
      };
    }

    if (row.status === 'JA_CADASTRADO') {
      const detalhesPagamento = row.pagamentos_vinculados?.[0]
        ? getPagamentoResumoLinhas(row, row.pagamentos_vinculados[0])
        : [];

      return {
        tone: 'success',
        title: 'Cadastrado',
        description: 'Título já possui baixa no Omie. Nenhuma ação será executada.',
        detailLines: detalhesPagamento
      };
    }

    if (row.status === 'LANCAR_PAGAMENTO') {
      const detalhesPagamento = row.pagamentos_vinculados?.[0]
        ? getPagamentoResumoLinhas(row, row.pagamentos_vinculados[0])
        : [];

      return {
        tone: 'warning',
        title: 'Baixar',
        description: 'Título cadastrado no Omie sem baixa. Será atualizada a baixa.',
        detailLines: detalhesPagamento
      };
    }

    return {
      tone: 'neutral',
      title: 'Pendente',
      description: row.acao_importacao === 'ATUALIZAR'
        ? 'Título localizado. Aguardando atualização do cadastro.'
        : 'Registro pronto para importação.'
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

  const hasRowDetail = (row: RowMapping) => {
    const validation = getRowValidation(row);
    const statusDisplay = getStatusDisplay(row, validation);

    return Boolean(
      statusDisplay.description ||
      statusDisplay.monoLine ||
      statusDisplay.detailLines?.length ||
      row.status === 'ERRO' ||
      row.status === 'LANCAR_PAGAMENTO' ||
      (row.status === 'PENDENTE' && !isNoopRow(row))
    );
  };

  const expandableRowIds = rows.filter(hasRowDetail).map(r => r.internal_id);
  const hasExpandableRows = expandableRowIds.length > 0;
  const areAllRowsExpanded = hasExpandableRows && expandableRowIds.every(id => expandedRows[id]);

  const toggleRowExpanded = (rowId: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [rowId]: !prev[rowId]
    }));
  };

  const toggleAllExpandedRows = () => {
    if (!hasExpandableRows) return;

    const nextExpanded = !areAllRowsExpanded;
    setExpandedRows(Object.fromEntries(expandableRowIds.map(id => [id, nextExpanded])));
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
  const renderCheckpointItem = (step: number, label: string, done: boolean) => (
    <div className="flex items-center gap-2" key={label}>
      {done ? (
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
      ) : (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#ffccd6] bg-[#fff0f2] text-[10px] font-bold text-[#d30a2f]">
          {step}
        </span>
      )}
      <span className={done ? 'font-semibold text-emerald-700' : ''}>{label}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#f8fafc_12%,#f8fafc_100%)] text-slate-800 font-sans pb-20">
      {isMatchingOverlayVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-indigo-100 bg-white p-8 shadow-2xl">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Buscando no Omie</h2>
                <p className="text-sm text-slate-500">Os fornecedores e pagamentos vinculados estão sendo validados.</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
                <span>Item em validação</span>
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
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur-md">
        <div className="flex flex-col gap-4 px-6 py-4 md:px-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-5 lg:gap-8">
              <div className="shrink-0">
                <ChavesNaMaoLogo className="h-8 w-auto md:h-9" />
              </div>
              <div className="flex-1 text-left lg:text-center">
                <div className="mx-auto w-fit max-w-full">
                  <h1 className="text-2xl font-bold text-slate-900">Importação de Contas a Pagar</h1>
                  <p className="text-sm text-slate-500">Integração de pagamentos retroativos com o Omie</p>
                </div>
              </div>
            </div>

            {rows.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {hasStoredRows && (
                  <button
                    onClick={limparDadosLocais}
                    disabled={isProcessing}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2"><Trash2 className="h-4 w-4" /> Limpar dados</span>
                  </button>
                )}

                <button
                  onClick={() => autoMatchFornecedores()}
                  disabled={isProcessing || selectedRows.length === 0}
                  className="rounded-xl border border-[#ffccd6] bg-[#fff0f2] px-4 py-2 text-sm font-bold text-[#d30a2f] shadow-sm transition-all hover:bg-[#ffe2e8] disabled:opacity-50"
                >
                  <span className="flex items-center gap-2"><Search className="h-4 w-4" /> Buscar no Omie</span>
                </button>

                <button
                  onClick={processarImportacao}
                  disabled={!isReady || isProcessing}
                  className="rounded-xl bg-[#ff0d36] px-6 py-2 text-sm font-bold text-white shadow-md transition-all hover:bg-[#d90b2f] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">{isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{isProcessing ? 'Processando...' : 'Integrar'}</span>
                </button>

                <button
                  onClick={gerarLogCSV}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Baixar Log CSV</span>
                </button>

                {hasExpandableRows && (
                  <button
                    onClick={toggleAllExpandedRows}
                    disabled={isProcessing}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2">
                      {areAllRowsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {areAllRowsExpanded ? 'Ocultar Todos' : 'Exibir Todos'}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

        </div>
      </header>

      <main className="p-6 md:p-10 w-full max-w-full mx-auto">
        
        {/* WIZARD STEP 1 */}
        {rows.length === 0 && (
           <div className="mx-auto mt-14 max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                 <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
                   <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#fff_0%,#fff6f7_100%)] p-10 lg:border-b-0 lg:border-r">
                     <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#ffccd6] bg-white px-4 py-2 text-sm font-semibold text-[#d30a2f]">
                       <span className="h-2 w-2 rounded-full bg-[#ff0d36]" /> Importação financeira
                     </div>
                     <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#fff0f2] text-[#ff0d36] shadow-sm">
                        <UploadCloud className="h-10 w-10" />
                     </div>
                     <h2 className="mb-3 text-3xl font-bold text-slate-900">Importe sua planilha</h2>
                     <p className="mb-8 max-w-xl text-slate-500">Selecione o arquivo Excel com as contas a pagar retroativas para iniciar o mapeamento, consultar o Omie e preparar a integração.</p>

                     <div className="space-y-4">
                       <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Checkpoints</div>

                       <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                         <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                           <CheckCircle2 className="h-4 w-4 text-[#ff0d36]" /> Busca automática de fornecedores
                         </div>
                         <div className="mt-3 space-y-2 text-sm text-slate-600">
                           {renderCheckpointItem(1, 'Importar planilha', workflowSteps.importarPlanilha)}
                           {renderCheckpointItem(2, 'Buscar Fornecedores no Omie', workflowSteps.buscarFornecedores)}
                         </div>
                       </div>
                     </div>
                   </div>

                   <div className="flex flex-col justify-center bg-slate-50 p-10">
                     <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                       <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Painel</div>
                       <div className="mt-2 text-lg font-bold text-slate-900">Validação guiada</div>
                       <div className="mt-1 text-sm text-slate-500">Fluxo inspirado na navegação limpa do Chaves na Mão, com foco em leitura rápida e ação direta.</div>
                     </div>
                 
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
                   <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                     {metadataWarning && (
                       <div className="w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                         {metadataWarning}
                       </div>
                     )}
                     <div className="flex flex-col items-start w-full max-w-xs">
                        <label className="text-xs font-semibold text-slate-500 uppercase mb-1">Senha da planilha (se houver)</label>
                        <input 
                          type="text" 
                          value={planilhaPassword} 
                          onChange={(e) => setPlanilhaPassword(e.target.value)}
                          placeholder="Ex: 123456"
                          className="w-full px-4 py-2 bg-slate-100 border-none rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none transition text-center"
                        />
                     </div>
                     <label className="cursor-pointer rounded-xl bg-[#ff0d36] px-8 py-3 font-bold text-white shadow-lg transition hover:bg-[#d90b2f] hover:shadow-[#ff0d36]/30">
                       Selecionar arquivo
                       <input type="file" multiple accept=".xlsx, .csv" className="hidden" onChange={handleFileUpload} />
                     </label>
                   </div>
                 )}
                   </div>
                 </div>
              </div>
           </div>
        )}

        {/* WIZARD STEP 2 & 3 */}
        {rows.length > 0 && (
           <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm animate-in fade-in">
             <div className="flex items-center justify-between border-b border-slate-100 bg-[linear-gradient(135deg,#ffffff_0%,#fff7f8_100%)] p-6">
                <div>
                  <h3 className="font-bold text-slate-700">Mapeamento de Dados ({rows.length} registros encontrados)</h3>
                  {metadataWarning && (
                    <div className="mt-1 text-xs text-amber-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3"/> {metadataWarning}
                    </div>
                  )}
                </div>
                {!isReady && <span className="text-amber-600 text-sm font-medium flex items-center gap-1"><AlertCircle className="w-4 h-4"/> Selecione registros válidos e preencha os campos vazios para liberar a importação.</span>}
                {isReady && <span className="text-emerald-600 text-sm font-medium flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/> {rowsProcessaveisSelecionadas.length} registro(s) pronto(s) para processamento.</span>}
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
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {rows.map(row => {
                       const validation = getRowValidation(row);
                       const statusDisplay = getStatusDisplay(row, validation);
                       const showDetailRow = Boolean(
                         statusDisplay.description ||
                         statusDisplay.monoLine ||
                         statusDisplay.detailLines?.length ||
                         row.status === 'ERRO' ||
                         row.status === 'LANCAR_PAGAMENTO' ||
                         (row.status === 'PENDENTE' && !isNoopRow(row))
                       );
                       const isDetailExpanded = Boolean(expandedRows[row.internal_id]);
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
                       <Fragment key={row.internal_id}>
                       <tr key={`${row.internal_id}-main`} className={`${rowColorClass} ${rowSelectionClass}`}>
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
                           <div className="flex items-center gap-2">
                             <div className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-bold text-[11px] ${
                               statusDisplay.tone === 'success'
                                 ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                 : statusDisplay.tone === 'warning'
                                   ? 'bg-amber-50 border-amber-200 text-amber-700'
                                   : statusDisplay.tone === 'info'
                                     ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                     : statusDisplay.tone === 'danger'
                                       ? 'bg-rose-50 border-rose-200 text-rose-700'
                                       : 'bg-slate-50 border-slate-200 text-slate-600'
                             }`}>
                               {row.status === 'PROCESSANDO' ? (
                                 <Loader2 className="w-3.5 h-3.5 animate-spin" />
                               ) : statusDisplay.tone === 'danger' ? (
                                 <AlertCircle className="w-3.5 h-3.5" />
                               ) : (
                                 <CheckCircle2 className="w-3.5 h-3.5" />
                               )}
                               {statusDisplay.title}
                             </div>
                             {showDetailRow && (
                               <button
                                 type="button"
                                 onClick={() => toggleRowExpanded(row.internal_id)}
                                 className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                                 aria-label={isDetailExpanded ? 'Ocultar detalhes' : 'Exibir detalhes'}
                                 title={isDetailExpanded ? 'Ocultar detalhes' : 'Exibir detalhes'}
                               >
                                 {isDetailExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                               </button>
                             )}
                           </div>
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

                         {/* REMOVED DUPLICATE VALOR FROM END */}
                       </tr>
                       {showDetailRow && isDetailExpanded && (
                         <tr key={`${row.internal_id}-detail`} className={`${rowColorClass} ${rowSelectionClass}`}>
                           <td className="px-4 pb-4"></td>
                           <td colSpan={9} className="px-4 pb-4 pt-0">
                             <div className={`rounded-lg border px-3 py-2 flex flex-col gap-1 ${
                               statusDisplay.tone === 'success'
                                 ? 'bg-emerald-50/70 border-emerald-200'
                                 : statusDisplay.tone === 'warning'
                                   ? 'bg-amber-50/70 border-amber-200'
                                   : statusDisplay.tone === 'info'
                                     ? 'bg-indigo-50/70 border-indigo-200'
                                     : statusDisplay.tone === 'danger'
                                       ? 'bg-rose-50/70 border-rose-200'
                                       : 'bg-slate-50 border-slate-200'
                             }`}>
                               {statusDisplay.description && (
                                 <p className={`text-[11px] leading-tight ${
                                   statusDisplay.tone === 'success'
                                     ? 'text-emerald-700'
                                     : statusDisplay.tone === 'warning'
                                       ? 'text-amber-700'
                                       : statusDisplay.tone === 'info'
                                         ? 'text-indigo-700'
                                         : statusDisplay.tone === 'danger'
                                           ? 'text-rose-700'
                                           : 'text-slate-600'
                                 }`}>
                                   {statusDisplay.description}
                                 </p>
                               )}
                               {statusDisplay.monoLine && (
                                 <p className={`text-[10px] font-mono ${
                                   statusDisplay.tone === 'success'
                                     ? 'text-emerald-600'
                                     : statusDisplay.tone === 'warning'
                                       ? 'text-amber-600'
                                       : statusDisplay.tone === 'info'
                                         ? 'text-indigo-600'
                                         : statusDisplay.tone === 'danger'
                                           ? 'text-rose-600'
                                           : 'text-slate-500'
                                 }`}>
                                   {statusDisplay.monoLine}
                                 </p>
                               )}
                               {statusDisplay.detailLines?.map(line => (
                                 <p key={`${row.internal_id}-${line}`} className="text-[10px] text-slate-600 leading-tight">
                                   {line}
                                 </p>
                               ))}
                               {row.status === 'LANCAR_PAGAMENTO' && (
                                 <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                   <button
                                     onClick={() => lancarSomentePagamento(row)}
                                     disabled={!isSelected || !validation.canImport || !row.conta_id || !row.categoria_codigo || !row.departamento_codigo}
                                     className="flex items-center justify-center gap-1 px-2 py-1.5 bg-amber-500 text-white rounded font-bold text-[11px] hover:bg-amber-600 transition disabled:opacity-30 disabled:cursor-not-allowed shadow-sm hover:shadow-md w-fit"
                                   >
                                     <Play className="w-3 h-3" /> Atualizar Baixa
                                   </button>
                                 </div>
                               )}
                               {row.status === 'ERRO' && !row.is_duplicate && row.status !== 'SUCESSO' && (
                                 <div className="mt-2">
                                   <button 
                                     onClick={() => row.acao_importacao === 'ATUALIZAR' && getLinkedOmieId(row)
                                       ? atualizarCadastroExistente(row)
                                       : processarLinha(row)
                                     }
                                     className="text-[11px] bg-rose-100 text-rose-600 px-2 py-1 rounded hover:bg-rose-200 transition font-semibold"
                                   >
                                     Tentar Novamente
                                   </button>
                                 </div>
                               )}
                               {row.status === 'PENDENTE' && !isNoopRow(row) && (
                                 <div className="mt-2">
                                   <button
                                     onClick={() => row.acao_importacao === 'ATUALIZAR' && getLinkedOmieId(row)
                                       ? atualizarCadastroExistente(row)
                                       : processarLinha(row)
                                     }
                                     disabled={!isSelected || !validation.canImport || !row.categoria_codigo || !row.departamento_codigo || !row.conta_id}
                                     className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold hover:bg-indigo-600 hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed w-fit"
                                   >
                                     <Play className="w-3 h-3" /> {row.acao_importacao === 'ATUALIZAR' ? 'Atualizar cadastro' : 'Importar'}
                                   </button>
                                 </div>
                               )}
                             </div>
                           </td>
                         </tr>
                       )}
                       </Fragment>
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
