'use client';

import { useState, useEffect, useCallback, useRef, type UIEvent, type RefObject } from 'react';
import axios from 'axios';
import {
  Loader2, AlertTriangle, Wallet, TrendingUp, MinusCircle, Upload, Plus, X, Users, Pencil, Calculator,
} from 'lucide-react';
import { formatCurrencyBRL, formatNumberBR } from '@/lib/format';
import { PercentInput } from '@/components/ui/PercentInput';
import type { FolhaColaborador, OverrideSalario, FolhaPagamentoResultado, ProgressoFechamento } from '@/lib/folha-pagamento';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function KpiCard({ title, icon: Icon, value, sub }: { title: string; icon: any; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">{title}</p>
          <p className="text-2xl font-semibold mt-1 tabular-nums">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
        </div>
        <Icon size={20} className="opacity-60 flex-shrink-0 mt-1 text-muted-foreground" />
      </div>
    </div>
  );
}

function BarraProgresso({ label, atual, total }: { label: string; atual: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((atual / total) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{total > 0 ? `${atual}/${total}` : '—'}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all duration-300 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Fechar a folha leva minutos de verdade (rate limit do Convenia, 1 chamada
// por colaborador) — sem isso, a tela parada por 4 minutos parece travada.
// As barras refletem progresso real reportado pelo backend, não um tempo
// estimado — se o backend travar de verdade, as barras param de andar.
function ProgressoModal({ progresso }: { progresso: ProgressoFechamento | null }) {
  const convenia = progresso?.convenia ?? { total: 0, atual: 0 };
  const calculo = progresso?.calculo ?? { total: 0, atual: 0 };
  const conveniaConcluido = convenia.total > 0 && convenia.atual >= convenia.total;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 space-y-5">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Loader2 size={16} className="animate-spin text-primary" /> Calculando a folha
        </h2>
        <BarraProgresso label="1. Buscando salários no Convenia" atual={convenia.atual} total={convenia.total} />
        <BarraProgresso
          label="2. Calculando horas, comissão e descontos"
          atual={conveniaConcluido ? calculo.atual : 0}
          total={calculo.total}
        />
      </div>
    </div>
  );
}

function EditableCell({
  value, onSave, numeric = false,
}: { value: string | number | null; onSave: (v: string) => void; numeric?: boolean }) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(value == null ? '' : String(value));

  if (!editando) {
    return (
      <button
        onClick={() => { setRascunho(value == null ? '' : String(value)); setEditando(true); }}
        className={`w-full flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted/60 min-h-[26px] ${numeric ? 'justify-end' : 'text-left'}`}
      >
        <span className="truncate">{value == null || value === '' ? <span className="text-muted-foreground">—</span> : value}</span>
        <Pencil size={9} className="text-muted-foreground/50 flex-shrink-0" />
      </button>
    );
  }

  return (
    <input
      autoFocus
      type={numeric ? 'number' : 'text'}
      value={rascunho}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={() => { setEditando(false); onSave(rascunho); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { setEditando(false); onSave(rascunho); } }}
      className="w-full px-1.5 py-0.5 rounded border border-border bg-background text-sm"
    />
  );
}

function decimalParaHHMM(horas: number): string {
  const negativo = horas < 0;
  const totalMin = Math.round(Math.abs(horas) * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${negativo ? '-' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Verde = acréscimo (soma no que o colaborador recebe), "vermelho" (destructive
// — a mesma cor já usada pra negativo em outros relatórios do app) = desconto.
// Só colore quando o valor é > 0 — zero fica neutro, sem sinalizar nada.
function corAcrescimo(valor: number): string {
  return valor > 0 ? 'text-success' : '';
}
function corDesconto(valor: number): string {
  return valor > 0 ? 'text-destructive' : '';
}
// Saldo de horas pode ser positivo (banco a favor) ou negativo (a descontar),
// ao contrário de corAcrescimo/corDesconto que só coloriam um sinal.
function corSaldo(valor: number): string {
  if (valor > 0) return 'text-success';
  if (valor < 0) return 'text-destructive';
  return '';
}

// Larguras fixas das colunas congeladas (Admissão/Nome) — sticky exige
// offset previsível, não dá pra deixar a largura variar com o conteúdo.
// CPF não é congelado — rola normalmente junto com o resto da tabela.
const STICKY_ADMISSAO_W = 90;
const STICKY_NOME_W = 170;
const STICKY_NOME_LEFT = STICKY_ADMISSAO_W;
const STICKY_TOTAL_W = STICKY_ADMISSAO_W + STICKY_NOME_W;

// width sozinho é só uma dica pro table-layout: auto — conteúdo (ex.: nome
// longo) pode fazer a coluna renderizar mais larga que isso e desalinhar o
// left das colunas congeladas seguintes. min/max-width força o valor exato.
function stickyColStyle(left: number, width: number) {
  return { left, width, minWidth: width, maxWidth: width };
}

function hhmmParaDecimal(valor: string): number | null {
  const m = valor.trim().match(/^(-?\d{1,4}):([0-5]\d)$/);
  if (!m) return null;
  const [, h, min] = m;
  return parseInt(h, 10) + (h.startsWith('-') ? -1 : 1) * (parseInt(min, 10) / 60);
}

function EditableHorasCell({
  decimal, editando, onEditar, onSave, corTexto, editadoManualmente,
}: {
  decimal: number; editando: boolean; onEditar: () => void; onSave: (hhmm: string) => void;
  corTexto?: string; editadoManualmente?: boolean;
}) {
  const [rascunho, setRascunho] = useState(decimalParaHHMM(decimal));

  if (!editando) {
    return (
      <button
        onClick={() => { setRascunho(decimalParaHHMM(decimal)); onEditar(); }}
        className={`w-full flex items-center justify-end gap-1 px-1.5 py-0.5 rounded hover:bg-muted/60 tabular-nums ${corTexto ?? ''}`}
        title={editadoManualmente ? 'Valor editado manualmente' : undefined}
      >
        <span>{decimalParaHHMM(decimal)}</span>
        <Pencil size={9} className={`flex-shrink-0 ${editadoManualmente ? 'text-foreground' : 'text-muted-foreground/50'}`} />
      </button>
    );
  }

  return (
    <input
      autoFocus
      type="text"
      placeholder="HH:mm"
      value={rascunho}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={() => onSave(rascunho)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSave(rascunho); }}
      className="w-full px-1.5 py-0.5 rounded border border-border bg-background text-xs text-right tabular-nums"
    />
  );
}

function UploadButton({
  label, accept, uploading, onUpload,
}: { label: string; accept: string; uploading: boolean; onUpload: (file: File) => void }) {
  return (
    <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm cursor-pointer hover:bg-muted/60">
      {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
      {label}
      <input
        type="file"
        accept={accept}
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
    </label>
  );
}

export default function FolhaPagamentoPage() {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [dados, setDados] = useState<FolhaPagamentoResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [overrides, setOverrides] = useState<OverrideSalario[]>([]);
  const [editandoHoras, setEditandoHoras] = useState<{ cpf: string; campo: 'horasPositivas' | 'horasNegativas' } | null>(null);
  const [salvandoHoras, setSalvandoHoras] = useState(false);
  const [salvandoFalta, setSalvandoFalta] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<ProgressoFechamento | null>(null);
  const [linhaSelecionada, setLinhaSelecionada] = useState<string | null>(null);

  // Barra de scroll horizontal grudada no rodapé da tela — a tabela tem
  // centenas de linhas, então o scrollbar nativo (no fim do container) fica
  // longe da visão quando o usuário está no meio da lista. Essa segunda barra
  // (sticky bottom-0) espelha o scrollLeft real da tabela nos dois sentidos.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const medir = () => setTableWidth(el.scrollWidth);
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    return () => observer.disconnect();
  }, [dados]);

  function sincronizarScroll(e: UIEvent<HTMLDivElement>, destino: RefObject<HTMLDivElement | null>) {
    if (destino.current && destino.current.scrollLeft !== e.currentTarget.scrollLeft) {
      destino.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }

  const carregar = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setErro(null);
    setProgresso(null);

    // Intervalo é local a cada chamada (não uma ref compartilhada) — se 2
    // chamadas se sobrepuserem, cada uma limpa só o próprio intervalo, sem
    // uma apagar o timer da outra por engano.
    const intervalId = setInterval(async () => {
      try {
        const { data } = await axios.get<ProgressoFechamento>('/api/folha-pagamento/progresso');
        setProgresso(data);
      } catch {
        // Falha ao consultar progresso não é crítica — a barra só fica sem atualizar por 1 ciclo.
      }
    }, 800);

    try {
      const { data } = await axios.get<FolhaPagamentoResultado>('/api/folha-pagamento', { params: { ano, mes, forceRefresh } });
      setDados(data);
    } catch (e: any) {
      setErro(e?.response?.data?.error ?? e.message);
    } finally {
      clearInterval(intervalId);
      setLoading(false);
      setProgresso(null);
    }
  }, [ano, mes]);

  const carregarConfig = useCallback(async () => {
    const { data } = await axios.get('/api/folha-pagamento/overrides');
    setOverrides(data.overrides);
  }, []);

  // Sem carregamento automático ao entrar na tela — o fechamento é pesado
  // (rate limit do Convenia, minutos de espera), então só roda quando o
  // usuário escolhe o mês e pede explicitamente pelo botão "Calcular folha".
  useEffect(() => { if (mostrarConfig) carregarConfig(); }, [mostrarConfig, carregarConfig]);

  async function upload(tipo: 'unimed' | 'odonto' | 'consignado' | 'vale', file: File) {
    setUploading(tipo);
    setErro(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (tipo === 'odonto' || tipo === 'vale') formData.append('competencia', `${ano}-${String(mes).padStart(2, '0')}`);
      await axios.post(`/api/folha-pagamento/upload/${tipo}`, formData);
      await carregar();
    } catch (e: any) {
      setErro(e?.response?.data?.error ?? e.message);
    } finally {
      setUploading(null);
    }
  }

  async function salvarManual(cpf: string, campo: string, valor: string) {
    const body: any = { ano, mes, cpf };
    if (campo === 'observacoes' || campo === 'sitepd') {
      body[campo] = valor || null;
    } else {
      body[campo] = valor === '' ? null : parseFloat(valor);
    }
    await axios.post('/api/folha-pagamento/manual', body);
    setDados((atual) => {
      if (!atual) return atual;
      return {
        ...atual,
        colaboradores: atual.colaboradores.map((c) => (c.cpf === cpf ? { ...c, [campo]: body[campo] } : c)),
      };
    });
  }

  // Horas +/- ficam sob controle do RH (não mantemos mais uma lista
  // automática de "dias-exceção") — o valor editado prevalece sobre o
  // Secullum, e recarregamos só essa linha (rápido) pra atualizar os campos
  // derivados (hora extra, DSR etc.) sem esperar o fechamento inteiro de novo.
  async function salvarHoras(cpf: string, campo: 'horasPositivas' | 'horasNegativas', hhmm: string) {
    const campoOverride = campo === 'horasPositivas' ? 'horasPositivasOverride' : 'horasNegativasOverride';
    const decimal = hhmm.trim() === '' ? null : hhmmParaDecimal(hhmm);
    if (hhmm.trim() !== '' && decimal === null) {
      setErro('Formato inválido — use HH:mm (ex.: 08:30)');
      setEditandoHoras(null);
      return;
    }
    setSalvandoHoras(true);
    setErro(null);
    try {
      await axios.post('/api/folha-pagamento/manual', { ano, mes, cpf, [campoOverride]: decimal });
      const { data } = await axios.get('/api/folha-pagamento/colaborador', { params: { cpf, ano, mes } });
      setDados((atual) => {
        if (!atual) return atual;
        return {
          ...atual,
          colaboradores: atual.colaboradores.map((c) => (c.cpf === cpf ? data.colaborador : c)),
        };
      });
    } catch (e: any) {
      setErro(e?.response?.data?.error ?? e.message);
    } finally {
      setSalvandoHoras(false);
      setEditandoHoras(null);
    }
  }

  // Nº de faltas vem do Secullum, mas o RH pode corrigir (ex.: falta
  // justificada depois do fechamento) — recarrega só essa linha pra
  // atualizar o DSR, que depende da quantidade de faltas.
  async function salvarFalta(cpf: string, valor: string) {
    const faltaQtdOverride = valor.trim() === '' ? null : parseInt(valor, 10);
    if (valor.trim() !== '' && (faltaQtdOverride === null || Number.isNaN(faltaQtdOverride) || faltaQtdOverride < 0)) {
      setErro('Falta inválida — use um número inteiro maior ou igual a 0');
      return;
    }
    setSalvandoFalta(cpf);
    setErro(null);
    try {
      await axios.post('/api/folha-pagamento/manual', { ano, mes, cpf, faltaQtdOverride });
      const { data } = await axios.get('/api/folha-pagamento/colaborador', { params: { cpf, ano, mes } });
      setDados((atual) => {
        if (!atual) return atual;
        return {
          ...atual,
          colaboradores: atual.colaboradores.map((c) => (c.cpf === cpf ? data.colaborador : c)),
        };
      });
    } catch (e: any) {
      setErro(e?.response?.data?.error ?? e.message);
    } finally {
      setSalvandoFalta(null);
    }
  }

  const colaboradores = dados?.colaboradores ?? [];
  const totalComissao = colaboradores.reduce((s, c) => s + c.comissao, 0);
  const totalDescontos = colaboradores.reduce(
    (s, c) => s + c.descontoUnimed + c.descontoOdonto + c.consignado + c.descHorasFalta + c.dsrValor,
    0
  );
  const totalFolha = colaboradores.reduce((s, c) => s + c.salMaisComissao, 0);
  const pendencias = colaboradores.filter((c) => !c.secullumEncontrado || c.erro || c.comissaoMatchPorNome).length;

  return (
    <div className="p-6 max-w-[2400px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Fechamento de Folha de Pagamento</h1>
          <p className="text-sm text-muted-foreground">Convenia + Secullum + comissionamento + Unimed/Odonto/Consignado</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
          >
            {MESES.map((nome, i) => <option key={i} value={i + 1}>{nome}</option>)}
          </select>
          <input
            type="number"
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="w-20 px-3 py-2 rounded-lg border border-border bg-background text-sm tabular-nums"
          />
          <button
            onClick={() => carregar(true)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted/60 disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />}
            Calcular folha
          </button>
          <button
            onClick={() => setMostrarConfig((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted/60"
          >
            <Users size={15} />
            Exceções
          </button>
        </div>
      </div>

      {erro && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle size={16} />
          {erro}
        </div>
      )}

      {mostrarConfig && (
        <OverridesModal
          overrides={overrides}
          colaboradores={colaboradores}
          onChange={carregarConfig}
          onClose={() => setMostrarConfig(false)}
        />
      )}

      {loading && <ProgressoModal progresso={progresso} />}

      {!dados && !loading && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-24 text-center">
          <Calculator size={28} className="text-muted-foreground" />
          <p className="text-sm font-medium">Escolha o mês/ano acima e clique em &quot;Calcular folha&quot; para começar</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            O fechamento busca salário no Convenia, horas no Secullum e calcula comissão, descontos e benefícios — pode levar alguns minutos.
          </p>
        </div>
      )}

      {dados && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <UploadButton label="Importar Unimed (PDF)" accept=".pdf" uploading={uploading === 'unimed'} onUpload={(f) => upload('unimed', f)} />
            <UploadButton label="Importar Odonto (XLSX)" accept=".xlsx" uploading={uploading === 'odonto'} onUpload={(f) => upload('odonto', f)} />
            <UploadButton label="Importar Consignado (JSON)" accept=".json" uploading={uploading === 'consignado'} onUpload={(f) => upload('consignado', f)} />
            <UploadButton label="Importar VA/VT (XLSX)" accept=".xlsx" uploading={uploading === 'vale'} onUpload={(f) => upload('vale', f)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Total da folha" icon={Wallet} value={formatCurrencyBRL(totalFolha)} sub={`${colaboradores.length} colaboradores ativos`} />
            <KpiCard title="Total comissões" icon={TrendingUp} value={formatCurrencyBRL(totalComissao)} />
            <KpiCard title="Total descontos" icon={MinusCircle} value={formatCurrencyBRL(totalDescontos)} sub="Unimed + Odonto + Consignado + faltas" />
            <KpiCard
              title="Pendências"
              icon={AlertTriangle}
              value={String(pendencias)}
              sub={dados?.colaboradoresSemCpf ? `+ ${dados.colaboradoresSemCpf} sem CPF no Convenia` : 'colaboradores a conferir manualmente'}
            />
          </div>

          <div
            className="rounded-lg border border-border overflow-x-auto"
            ref={tableScrollRef}
            onScroll={(e) => sincronizarScroll(e, bottomScrollRef)}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted [&>th]:px-2 [&>th]:py-1 [&>th]:text-center [&>th]:font-semibold [&>th]:text-[10px] [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-muted-foreground/70 [&>th]:whitespace-nowrap">
                  <th className="sticky z-10 bg-muted text-left!" style={stickyColStyle(0, STICKY_TOTAL_W)} colSpan={3}>Dados Gerais</th>
                  <th className="border-r border-border" colSpan={2}>&nbsp;</th>
                  <th className="border-r border-border" colSpan={4}>Salário</th>
                  <th className="border-r border-border" colSpan={3}>Comissão</th>
                  <th className="border-r border-border" colSpan={11}>Horas</th>
                  <th className="border-r border-border" colSpan={2}>Descontos</th>
                  <th className="border-r border-border" colSpan={4}>Benefícios</th>
                  <th colSpan={1}>Observações</th>
                </tr>
                <tr className="border-b border-border bg-muted [&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th]:font-semibold [&>th]:text-muted-foreground [&>th]:whitespace-nowrap">
                  <th className="sticky z-10 bg-muted" style={stickyColStyle(0, STICKY_ADMISSAO_W)}>Admissão</th>
                  <th className="sticky z-10 bg-muted" style={stickyColStyle(STICKY_NOME_LEFT, STICKY_NOME_W)}>Nome</th>
                  <th>CPF</th>
                  <th>Cargo</th><th className="border-r border-border">Dpto</th>
                  <th className="text-right">Salário Base</th><th className="text-right">Dissídio</th><th className="text-right">% Adicional</th><th className="text-right border-r border-border">Salário Atual.</th>
                  <th className="text-right">Comissão</th><th className="text-right">DSR Comis.</th><th className="text-right border-r border-border">Sal+Comis.</th>
                  <th className="text-right">Horas +</th><th className="text-right">Horas −</th><th className="text-right">Saldo Horas</th>
                  <th className="text-right">Valor Hora</th><th className="text-right">Hora Extra</th>
                  <th className="text-right">HE +75%</th><th className="text-right">DSR HE</th>
                  <th className="text-right">Salário/H</th><th className="text-right">Desc. Falta</th>
                  <th className="text-right">Falta</th><th className="text-right border-r border-border">DSR</th>
                  <th className="text-right">Consignado</th><th className="border-r border-border">SITEPD</th>
                  <th className="text-right">Unimed</th><th className="text-right">Odonto</th><th className="text-right">VA</th><th className="text-right border-r border-border">VT</th>
                  <th>Observações</th>
                </tr>
              </thead>
              <tbody>
                {colaboradores.map((c) => {
                  const destaque = !c.secullumEncontrado || c.erro || c.comissaoMatchPorNome;
                  const selecionada = linhaSelecionada === c.cpf;
                  // Seleção (clique na linha) tem prioridade visual sobre o
                  // destaque de pendência — o usuário ainda vê o ícone de
                  // aviso, só a cor de fundo muda.
                  const bgSticky = selecionada ? 'bg-success-bg' : destaque ? 'bg-warning-bg' : 'bg-card';
                  return (
                  <tr
                    key={c.cpf}
                    onClick={() => setLinhaSelecionada((atual) => (atual === c.cpf ? null : c.cpf))}
                    className={`cursor-pointer border-b border-border last:border-0 [&>td]:px-2 [&>td]:py-1.5 [&>td]:whitespace-nowrap hover:bg-muted/30 ${
                      selecionada ? 'bg-success-bg' : destaque ? 'bg-warning-bg/30' : ''
                    }`}
                  >
                    <td className={`sticky z-10 ${bgSticky}`} style={stickyColStyle(0, STICKY_ADMISSAO_W)}>
                      {c.admissao ? new Date(c.admissao).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'}
                    </td>
                    <td
                      className={`sticky z-10 ${bgSticky} font-medium truncate`}
                      style={stickyColStyle(STICKY_NOME_LEFT, STICKY_NOME_W)}
                      title={c.erro ?? (c.comissaoMatchPorNome ? 'Comissão cruzada por nome — CPF ausente no cadastro do vendedor (tb_vendedor.documento vazio). Conferir manualmente.' : undefined)}
                    >
                      {c.nome}
                      {destaque && <AlertTriangle size={11} className="inline ml-1 text-warning" />}
                    </td>
                    <td className="tabular-nums">{c.cpf}</td>
                    <td className="max-w-[160px] truncate">{c.cargo}</td>
                    <td className="border-r border-border">{c.dpto}</td>
                    <td className="text-right tabular-nums">{formatCurrencyBRL(c.salarioBase)}</td>
                    <td className="text-right tabular-nums">{formatNumberBR(c.dissidioPercentual * 100, { maximumFractionDigits: 2 })}%</td>
                    <td className="text-right tabular-nums">{c.overridePercentual > 0 ? `${formatNumberBR(c.overridePercentual * 100, { maximumFractionDigits: 2 })}%` : '—'}</td>
                    <td className="text-right tabular-nums font-medium border-r border-border">{formatCurrencyBRL(c.salarioAtualizado)}</td>
                    <td className={`text-right tabular-nums ${corAcrescimo(c.comissao)}`}>{formatCurrencyBRL(c.comissao)}</td>
                    <td className={`text-right tabular-nums ${corAcrescimo(c.dsrComissao)}`}>{formatCurrencyBRL(c.dsrComissao)}</td>
                    <td className="text-right tabular-nums font-medium border-r border-border">{formatCurrencyBRL(c.salMaisComissao)}</td>
                    <td className="text-right tabular-nums min-w-[70px]">
                      <div className="flex items-center justify-end gap-1">
                        <EditableHorasCell
                          decimal={c.horasPositivas}
                          editando={editandoHoras?.cpf === c.cpf && editandoHoras.campo === 'horasPositivas'}
                          onEditar={() => setEditandoHoras({ cpf: c.cpf, campo: 'horasPositivas' })}
                          onSave={(v) => salvarHoras(c.cpf, 'horasPositivas', v)}
                          corTexto={corAcrescimo(c.horasPositivas)}
                          editadoManualmente={c.horasEditadasManualmente}
                        />
                        {salvandoHoras && editandoHoras?.cpf === c.cpf && <Loader2 size={10} className="animate-spin flex-shrink-0" />}
                      </div>
                    </td>
                    <td className="text-right tabular-nums min-w-[70px]">
                      <div className="flex items-center justify-end gap-1">
                        <EditableHorasCell
                          decimal={c.horasNegativas}
                          editando={editandoHoras?.cpf === c.cpf && editandoHoras.campo === 'horasNegativas'}
                          onEditar={() => setEditandoHoras({ cpf: c.cpf, campo: 'horasNegativas' })}
                          onSave={(v) => salvarHoras(c.cpf, 'horasNegativas', v)}
                          corTexto={corDesconto(c.horasNegativas)}
                          editadoManualmente={c.horasEditadasManualmente}
                        />
                        {salvandoHoras && editandoHoras?.cpf === c.cpf && <Loader2 size={10} className="animate-spin flex-shrink-0" />}
                      </div>
                    </td>
                    <td className={`text-right tabular-nums ${corSaldo(c.horasPositivas - c.horasNegativas)}`}>
                      {decimalParaHHMM(c.horasPositivas - c.horasNegativas)}
                    </td>
                    <td className="text-right tabular-nums">{formatCurrencyBRL(c.valorHora)}</td>
                    <td className={`text-right tabular-nums ${corAcrescimo(c.horaExtra)}`}>{formatCurrencyBRL(c.horaExtra)}</td>
                    <td className={`text-right tabular-nums ${corAcrescimo(c.heMais75)}`}>{formatCurrencyBRL(c.heMais75)}</td>
                    <td className={`text-right tabular-nums ${corAcrescimo(c.dsrHoraExtra)}`}>{formatCurrencyBRL(c.dsrHoraExtra)}</td>
                    <td className="text-right tabular-nums">{formatCurrencyBRL(c.salarioPorHora)}</td>
                    <td className={`text-right tabular-nums ${corDesconto(c.descHorasFalta)}`}>{formatCurrencyBRL(c.descHorasFalta)}</td>
                    <td className="text-right tabular-nums min-w-[50px]" title={c.faltaDatas.join(', ')}>
                      <div className="flex items-center justify-end gap-1">
                        <EditableCell value={c.faltaQtd || null} numeric onSave={(v) => salvarFalta(c.cpf, v)} />
                        {salvandoFalta === c.cpf && <Loader2 size={10} className="animate-spin flex-shrink-0" />}
                      </div>
                    </td>
                    <td className={`text-right tabular-nums border-r border-border ${corDesconto(c.dsrValor)}`}>{formatCurrencyBRL(c.dsrValor)}</td>
                    <td className={`text-right tabular-nums ${corDesconto(c.consignado)}`}>{formatCurrencyBRL(c.consignado)}</td>
                    <td className="min-w-[90px] border-r border-border">
                      <EditableCell value={c.sitepd} onSave={(v) => salvarManual(c.cpf, 'sitepd', v)} />
                    </td>
                    <td className={`text-right tabular-nums ${corDesconto(c.descontoUnimed)}`}>{formatCurrencyBRL(c.descontoUnimed)}</td>
                    <td className={`text-right tabular-nums ${corDesconto(c.descontoOdonto)}`}>{formatCurrencyBRL(c.descontoOdonto)}</td>
                    <td className="min-w-[80px] text-right">
                      <EditableCell value={c.valeAlimentacao} numeric onSave={(v) => salvarManual(c.cpf, 'valeAlimentacao', v)} />
                    </td>
                    <td className="min-w-[80px] text-right border-r border-border">
                      <EditableCell value={c.valeTransporte} numeric onSave={(v) => salvarManual(c.cpf, 'valeTransporte', v)} />
                    </td>
                    <td className="min-w-[140px]">
                      <EditableCell value={c.observacoes} onSave={(v) => salvarManual(c.cpf, 'observacoes', v)} />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {loading && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" /> Calculando folha — Convenia é limitado por rate limit, pode levar alguns minutos.
              </div>
            )}
            {!loading && colaboradores.length === 0 && (
              <p className="text-center py-10 text-sm text-muted-foreground">Nenhum colaborador encontrado para o período.</p>
            )}
          </div>

          {tableWidth > 0 && (
            <div
              className="sticky bottom-0 z-20 h-3 overflow-x-auto overflow-y-hidden rounded-b-lg border border-t-0 border-border bg-muted"
              ref={bottomScrollRef}
              onScroll={(e) => sincronizarScroll(e, tableScrollRef)}
            >
              <div style={{ width: tableWidth, height: 1 }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OverridesModal({
  overrides, colaboradores, onChange, onClose,
}: { overrides: OverrideSalario[]; colaboradores: FolhaColaborador[]; onChange: () => void; onClose: () => void }) {
  const [novoOverride, setNovoOverride] = useState({ cpf: '', nome: '', percentual: 0, motivo: '', vigenciaInicio: '' });

  function onCpfChange(cpfDigitado: string) {
    const cpfNormalizado = cpfDigitado.replace(/\D/g, '');
    const encontrado = cpfNormalizado.length >= 11 ? colaboradores.find((c) => c.cpf === cpfNormalizado) : null;
    setNovoOverride((atual) => ({ ...atual, cpf: cpfDigitado, nome: encontrado ? encontrado.nome : atual.nome }));
  }

  async function adicionarOverride() {
    await axios.post('/api/folha-pagamento/overrides', {
      cpf: novoOverride.cpf,
      nome: novoOverride.nome,
      percentual: novoOverride.percentual,
      motivo: novoOverride.motivo,
      vigenciaInicio: novoOverride.vigenciaInicio,
    });
    setNovoOverride({ cpf: '', nome: '', percentual: 0, motivo: '', vigenciaInicio: '' });
    onChange();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-card p-6 space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users size={18} className="text-primary" /> Tabela de exceção — reajuste de liderança
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Percentual extra somado ao dissídio automático (ex.: +40% de mercado). Não usar pra dissídio comum — isso já é calculado sozinho pela data de admissão.
        </p>
        <div className="space-y-1">
          {overrides.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded border border-border">
              <span className="truncate">{o.nome} · +{formatNumberBR(o.percentual * 100, { maximumFractionDigits: 1 })}% · {o.motivo}</span>
              <button onClick={async () => { await axios.delete('/api/folha-pagamento/overrides', { params: { id: o.id } }); onChange(); }}>
                <X size={13} className="text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
          {overrides.length === 0 && <p className="text-xs text-muted-foreground">Nenhum override cadastrado ainda.</p>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="CPF" value={novoOverride.cpf} onChange={(e) => onCpfChange(e.target.value)} className="px-2 py-1.5 rounded border border-border bg-background text-xs" />
          <input
            placeholder="Nome"
            value={novoOverride.nome}
            onChange={(e) => setNovoOverride({ ...novoOverride, nome: e.target.value })}
            className="px-2 py-1.5 rounded border border-border bg-background text-xs"
          />
          <PercentInput
            placeholder="0,00%"
            value={novoOverride.percentual}
            onChange={(v) => setNovoOverride({ ...novoOverride, percentual: v })}
            className="px-2 py-1.5 rounded border border-border bg-background text-xs tabular-nums"
          />
          <input type="date" value={novoOverride.vigenciaInicio} onChange={(e) => setNovoOverride({ ...novoOverride, vigenciaInicio: e.target.value })} className="px-2 py-1.5 rounded border border-border bg-background text-xs" />
          <input placeholder="Motivo" value={novoOverride.motivo} onChange={(e) => setNovoOverride({ ...novoOverride, motivo: e.target.value })} className="col-span-2 px-2 py-1.5 rounded border border-border bg-background text-xs" />
        </div>
        <button onClick={adicionarOverride} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted/60">
          <Plus size={13} /> Adicionar override
        </button>
      </div>
    </div>
  );
}
