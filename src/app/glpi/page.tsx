'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, Ticket, CheckCircle2,
  AlertTriangle, Users, TrendingUp, BarChart3, LayoutDashboard, PieChart as PieChartIcon, Building2,
  ChevronUp, ChevronDown, ChevronsUpDown, X, ExternalLink,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import type { DashboardData, TechRow, TicketItem, TicketResolvidoItem, AtendimentoBreakdown } from '@/lib/glpi';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

type SortCol = 'nome' | 'grupo' | 'emAberto' | 'pendentes' | 'emAndamento' | 'resolvidos' | 'tmaDias' | 'oldestDias';
type SortDir = 'asc' | 'desc';
type ModalType = 'aberto' | 'resolvido' | 'antigo';
type MainTab = 'geral' | 'analitica' | 'abertura';

// Ordem fixa validada (contraste + separação CVD) — nunca reordenar por ranking dos dados.
const ATENDIMENTO_COLORS: Record<string, string> = {
  'Suporte Técnico': '#155DFC',
  'Correções': '#CA3500',
  'Melhorias': '#00A63E',
  'Dados/Relatórios': '#872BFF',
  'Dúvidas/Informações': '#1BAF7A',
  'Configuração/Ajuste': '#D08700',
  'Outros': '#B1AFB0',
};
const ATENDIMENTO_FALLBACK_COLOR = '#94A3B8';
const DEV_METER_COLOR = '#155DFC';
const DEV_METER_TRACK = '#CDE2FB';
const DEV_PIE_COLORS = { sim: '#155DFC', nao: '#94A3B8' };
const OUTROS_LABEL = 'Outros';

// Dobra tipos com participação marginal (< thresholdPct do total) em um único
// grupo "Outros" — evita mais de ~5 cores categóricas competindo na legenda.
function computeDominantTipos(data: AtendimentoBreakdown[], tipos: string[], thresholdPct = 5): string[] {
  const totals: Record<string, number> = {};
  let grandTotal = 0;
  for (const row of data) {
    for (const tipo of tipos) {
      const c = row.porTipo[tipo] || 0;
      totals[tipo] = (totals[tipo] || 0) + c;
      grandTotal += c;
    }
  }
  if (grandTotal === 0) return tipos;
  return tipos.filter((t) => ((totals[t] || 0) / grandTotal) * 100 >= thresholdPct);
}

const STATUS_COLORS: Record<string, string> = {
  'Novo': '#2B7FFF',
  'Em andamento (atribuído)': '#155DFC',
  'Em andamento (planejado)': '#914DFF',
  'Pendente': '#D08700',
  'Resolvido': '#00A63E',
  'Fechado': '#6F686B',
};

const PRIORITY_COLORS: Record<string, string> = {
  'Muito Alta': '#CA3500',
  'Alta': '#FF6900',
  'Média': '#155DFC',
  'Baixa': '#6F686B',
  'Muito Baixa': '#B1AFB0',
  'Maior': '#872BFF',
};

const PRIORITY_NAMES_MODAL: Record<number, string> = {
  1: 'M.Alta', 2: 'Alta', 3: 'Média', 4: 'Baixa', 5: 'M.Baixa', 6: 'Maior',
};

const PRIORITY_BADGE: Record<number, string> = {
  1: 'bg-destructive/10 text-destructive',
  2: 'bg-warning-bg text-warning',
  3: 'bg-info-bg text-info',
  4: 'bg-muted text-muted-foreground',
  5: 'bg-muted text-muted-foreground',
  6: 'bg-launches-bg text-launches',
};

function fmtMes(mes: string) {
  const [y, m] = mes.split('-');
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${names[Number(m) - 1]}/${y.slice(2)}`;
}

function fmtDate(s: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function KpiCard({
  title, value, sub, icon: Icon, color, borderColor,
}: {
  title: string; value: string | number; sub?: string;
  icon: any; color: string; borderColor: string;
}) {
  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-bold mt-1 tabular-nums" style={{ color }}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <Icon size={20} style={{ color: borderColor }} className="opacity-60 flex-shrink-0 mt-1" />
      </div>
    </div>
  );
}

function HBarRow({ nome, count, max, color, valueLabel }: { nome: string; count: number; max: number; color: string; valueLabel?: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="grid items-center gap-2" style={{ gridTemplateColumns: '160px 1fr 44px' }}>
      <span className="text-xs font-medium truncate" title={nome}>{nome}</span>
      <div className="bg-muted rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-bold text-right tabular-nums">{valueLabel ?? count}</span>
    </div>
  );
}

function SlaChip({ dias }: { dias: number }) {
  if (dias === 0) return <span className="text-xs text-muted-foreground">—</span>;
  if (dias <= 3) return <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-success-bg text-success">{dias}d</span>;
  if (dias <= 7) return <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-warning-bg text-warning">{dias}d</span>;
  return <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-destructive/10 text-destructive">{dias}d</span>;
}

function initials(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

const AVATAR_COLORS = ['#155DFC','#00A63E','#D08700','#CA3500','#872BFF','#2B7FFF','#914DFF','#6F686B'];
function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function SortTh({
  col, current, dir, onSort, children, className,
}: {
  col: SortCol; current: SortCol | null; dir: SortDir;
  onSort: (col: SortCol) => void; children: React.ReactNode; className?: string;
}) {
  const active = current === col;
  return (
    <th onClick={() => onSort(col)}
      className={`py-3 font-semibold cursor-pointer select-none hover:text-foreground transition-colors ${className ?? 'px-4'}`}>
      <span className="inline-flex items-center gap-1">
        {children}
        {active
          ? dir === 'asc' ? <ChevronUp size={11} className="text-primary" /> : <ChevronDown size={11} className="text-primary" />
          : <ChevronsUpDown size={11} className="opacity-30" />}
      </span>
    </th>
  );
}

function TicketModal({
  tech, type, glpiUrl, onClose,
}: {
  tech: TechRow; type: ModalType; glpiUrl: string; onClose: () => void;
}) {
  const isResolvido = type === 'resolvido';
  const tickets = isResolvido ? tech.ticketsResolvidos : tech.ticketsAbertos;
  const title = isResolvido ? `Chamados resolvidos — ${tech.nome}` : `Chamados em aberto — ${tech.nome}`;
  const subtitle = isResolvido ? `${tech.resolvidos} resolvido(s)` : `${tech.emAberto} em aberto`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-lg shadow-lg w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose}
            className="ml-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {tickets.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhum chamado encontrado.</div>
          ) : !isResolvido ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted border-b border-border">
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider text-left">
                  <th className="px-6 py-2.5 font-semibold w-20">ID</th>
                  <th className="px-3 py-2.5 font-semibold">Título</th>
                  <th className="px-3 py-2.5 font-semibold w-24 text-center">Prioridade</th>
                  <th className="px-3 py-2.5 font-semibold w-24 text-right">Abertura</th>
                  <th className="px-6 py-2.5 font-semibold w-20 text-right">Idade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(tickets as TicketItem[]).map((t) => (
                  <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-2.5">
                      {glpiUrl ? (
                        <a href={`${glpiUrl}/front/ticket.form.php?id=${t.id}`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-info hover:underline font-mono font-medium text-xs">
                          #{t.id}<ExternalLink size={10} />
                        </a>
                      ) : <span className="font-mono text-muted-foreground text-xs">#{t.id}</span>}
                    </td>
                    <td className="px-3 py-2.5"><span className="line-clamp-2 text-xs">{t.nome}</span></td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${PRIORITY_BADGE[t.prioridade] ?? 'bg-muted text-muted-foreground'}`}>
                        {PRIORITY_NAMES_MODAL[t.prioridade] ?? `P${t.prioridade}`}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular-nums">{fmtDate(t.dataAbertura)}</td>
                    <td className="px-6 py-2.5 text-right"><SlaChip dias={t.dias} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted border-b border-border">
                <tr className="text-[11px] text-muted-foreground uppercase tracking-wider text-left">
                  <th className="px-6 py-2.5 font-semibold w-20">ID</th>
                  <th className="px-3 py-2.5 font-semibold">Título</th>
                  <th className="px-3 py-2.5 font-semibold w-28 text-right">Resolução</th>
                  <th className="px-6 py-2.5 font-semibold w-24 text-right">TMA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(tickets as TicketResolvidoItem[]).map((t) => (
                  <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-2.5">
                      {glpiUrl ? (
                        <a href={`${glpiUrl}/front/ticket.form.php?id=${t.id}`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-info hover:underline font-mono font-medium text-xs">
                          #{t.id}<ExternalLink size={10} />
                        </a>
                      ) : <span className="font-mono text-muted-foreground text-xs">#{t.id}</span>}
                    </td>
                    <td className="px-3 py-2.5"><span className="line-clamp-2 text-xs">{t.nome}</span></td>
                    <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular-nums">{fmtDate(t.dataResolucao)}</td>
                    <td className="px-6 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
                      {t.diasResolucao > 0 ? `${t.diasResolucao}d` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function AtendimentoLegend({ tipos }: { tipos: string[] }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {tipos.map((tipo) => (
        <span key={tipo} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ATENDIMENTO_COLORS[tipo] ?? ATENDIMENTO_FALLBACK_COLOR }} />
          {tipo}
        </span>
      ))}
    </div>
  );
}

function AtendimentoBarChart({ data, tipos }: { data: AtendimentoBreakdown[]; tipos: string[] }) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Sem dados para este filtro.</div>;
  }
  // `tipos` já vem resolvido (tipos dominantes + "Outros", se aplicável) — ver computeDominantTipos.
  const realTipos = tipos.filter((t) => t !== OUTROS_LABEL);
  const hasOutros = tipos.includes(OUTROS_LABEL);
  const rows = data.map((r) => {
    const row: Record<string, number | string> = { nome: r.nome };
    let contabilizado = 0;
    for (const tipo of realTipos) {
      const c = r.porTipo[tipo] || 0;
      contabilizado += c;
      row[tipo] = r.total > 0 ? (c / r.total) * 100 : 0;
      row[`_count_${tipo}`] = c;
    }
    if (hasOutros) {
      const outrosCount = r.total - contabilizado;
      row[OUTROS_LABEL] = r.total > 0 ? (outrosCount / r.total) * 100 : 0;
      row[`_count_${OUTROS_LABEL}`] = outrosCount;
    }
    return row;
  });
  const chartHeight = Math.max(120, rows.length * 34);
  return (
    <div className="max-h-[480px] overflow-y-auto">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #D1D0D0' }}
            labelStyle={{ fontWeight: 600 }}
            formatter={(value: any, name: any, props: any) => {
              const count = props?.payload?.[`_count_${name}`] ?? 0;
              return [`${Math.round(Number(value) || 0)}% (${count})`, name];
            }}
          />
          {tipos.map((tipo) => (
            <Bar key={tipo} dataKey={tipo} name={tipo} stackId="atendimento"
              fill={ATENDIMENTO_COLORS[tipo] ?? ATENDIMENTO_FALLBACK_COLOR} radius={[0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DevMeterList({ data }: { data: AtendimentoBreakdown[] }) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Sem dados para este filtro.</div>;
  }
  return (
    <div className="max-h-[480px] overflow-y-auto space-y-3 pr-1">
      {data.map((row) => {
        const pct = row.total > 0 ? Math.round((row.devSim / row.total) * 100) : 0;
        return (
          <div key={row.nome} className="grid items-center gap-2" style={{ gridTemplateColumns: '150px 1fr 40px' }}>
            <span className="text-xs font-medium truncate" title={row.nome}>{row.nome}</span>
            <div className="rounded-full h-2.5 overflow-hidden" style={{ backgroundColor: DEV_METER_TRACK }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: DEV_METER_COLOR }} />
            </div>
            <span className="text-xs font-bold text-right tabular-nums">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function TipoAtendimentoPie({ data }: { data: Array<{ tipo: string; count: number }> }) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Sem dados para este filtro.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="tipo" innerRadius={55} outerRadius={95} paddingAngle={2}>
          {data.map((d) => (
            <Cell key={d.tipo} fill={ATENDIMENTO_COLORS[d.tipo] ?? ATENDIMENTO_FALLBACK_COLOR} stroke="none" />
          ))}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #D1D0D0' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function DesenvolvimentoPie({ data }: { data: { sim: number; nao: number } }) {
  const total = data.sim + data.nao;
  if (total === 0) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Sem dados para este filtro.</div>;
  }
  const chartData = [
    { nome: 'Exige desenvolvimento', key: 'sim', count: data.sim },
    { nome: 'Não exige desenvolvimento', key: 'nao', count: data.nao },
  ];
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={chartData} dataKey="count" nameKey="nome" innerRadius={55} outerRadius={95} paddingAngle={2}>
          {chartData.map((d) => (
            <Cell key={d.key} fill={DEV_PIE_COLORS[d.key as 'sim' | 'nao']} stroke="none" />
          ))}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #D1D0D0' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function GlpiDashboard() {
  const [dados, setDados] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grupoFiltro, setGrupoFiltro] = useState('');
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [modalTech, setModalTech] = useState<TechRow | null>(null);
  const [modalType, setModalType] = useState<ModalType | null>(null);
  const [mesFiltro, setMesFiltro] = useState('');
  const [availableMeses, setAvailableMeses] = useState<string[]>([]);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [mainTab, setMainTab] = useState<MainTab>('geral');
  const [analiticaGrupo, setAnaliticaGrupo] = useState('');
  const [dadosAnalitica, setDadosAnalitica] = useState<DashboardData | null>(null);
  const [loadingAnalitica, setLoadingAnalitica] = useState(false);
  const [aberturaGrupo, setAberturaGrupo] = useState('');
  const [aberturaDepartamento, setAberturaDepartamento] = useState('');
  const [aberturaMes, setAberturaMes] = useState('');
  const [aberturaAvailableMeses, setAberturaAvailableMeses] = useState<string[]>([]);
  const [aberturaDataInicio, setAberturaDataInicio] = useState('');
  const [aberturaDataFim, setAberturaDataFim] = useState('');
  const [dadosAbertura, setDadosAbertura] = useState<DashboardData | null>(null);
  const [loadingAbertura, setLoadingAbertura] = useState(false);

  const hasDataRef = useRef(false);

  const fetchDados = useCallback(async () => {
    if (hasDataRef.current) setReloading(true);
    else setLoading(true);
    setError(null);
    try {
      const qs: string[] = [];
      if (grupoFiltro) qs.push(`grupo=${encodeURIComponent(grupoFiltro)}`);
      if (mesFiltro) qs.push(`mes=${encodeURIComponent(mesFiltro)}`);
      if (dataInicio) qs.push(`dataInicio=${dataInicio}`);
      if (dataFim) qs.push(`dataFim=${dataFim}`);
      const res = await axios.get(`/api/glpi/dashboard${qs.length ? `?${qs.join('&')}` : ''}`);
      setDados(res.data);
      hasDataRef.current = true;
      if (!mesFiltro) {
        setAvailableMeses((res.data.porMes as Array<{ mes: string }>).map((m) => m.mes));
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, [grupoFiltro, mesFiltro, dataInicio, dataFim]);

  useEffect(() => { fetchDados(); }, [fetchDados]);

  const fetchAnalitica = useCallback(async () => {
    setLoadingAnalitica(true);
    try {
      const qs = analiticaGrupo ? `?grupo=${encodeURIComponent(analiticaGrupo)}` : '';
      const res = await axios.get(`/api/glpi/dashboard${qs}`);
      setDadosAnalitica(res.data);
    } catch {
      setDadosAnalitica(null);
    } finally {
      setLoadingAnalitica(false);
    }
  }, [analiticaGrupo]);

  useEffect(() => {
    if (mainTab === 'analitica') fetchAnalitica();
  }, [mainTab, fetchAnalitica]);

  const fetchAbertura = useCallback(async () => {
    setLoadingAbertura(true);
    try {
      const qs: string[] = [];
      if (aberturaGrupo) qs.push(`grupo=${encodeURIComponent(aberturaGrupo)}`);
      if (aberturaDepartamento) qs.push(`departamento=${encodeURIComponent(aberturaDepartamento)}`);
      if (aberturaMes) qs.push(`mes=${encodeURIComponent(aberturaMes)}`);
      if (aberturaDataInicio) qs.push(`dataInicio=${aberturaDataInicio}`);
      if (aberturaDataFim) qs.push(`dataFim=${aberturaDataFim}`);
      const res = await axios.get(`/api/glpi/dashboard${qs.length ? `?${qs.join('&')}` : ''}`);
      setDadosAbertura(res.data);
      if (!aberturaMes) {
        setAberturaAvailableMeses((res.data.porMes as Array<{ mes: string }>).map((m) => m.mes));
      }
    } catch {
      setDadosAbertura(null);
    } finally {
      setLoadingAbertura(false);
    }
  }, [aberturaGrupo, aberturaDepartamento, aberturaMes, aberturaDataInicio, aberturaDataFim]);

  useEffect(() => {
    if (mainTab === 'abertura') fetchAbertura();
  }, [mainTab, fetchAbertura]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('desc'); }
  }

  function openModal(tech: TechRow, type: ModalType) { setModalTech(tech); setModalType(type); }
  function closeModal() { setModalTech(null); setModalType(null); }

  const tecnicosFiltrados = dados ? dados.porTecnico : [];

  const sortedTecnicos = useMemo(() => {
    if (!sortCol) return tecnicosFiltrados;
    return [...tecnicosFiltrados].sort((a, b) => {
      let v = 0;
      if (sortCol === 'nome' || sortCol === 'grupo') v = (a[sortCol] || '').localeCompare(b[sortCol] || '');
      else v = (a[sortCol] as number) - (b[sortCol] as number);
      return sortDir === 'asc' ? v : -v;
    });
  }, [tecnicosFiltrados, sortCol, sortDir]);

  const maxStatus = dados ? Math.max(...dados.porStatus.map((s) => s.count), 1) : 1;
  const maxPrio = dados ? Math.max(...dados.porPrioridade.map((p) => p.count), 1) : 1;
  const maxCat = dados ? Math.max(...dados.porCategoria.map((c) => c.count), 1) : 1;
  const maxGrupo = dados ? Math.max(...dados.porGrupo.map((g) => g.count), 1) : 1;

  // Tipos dominantes (>=5% do total) + "Outros" — mantém a legenda com poucas cores
  // e consistente entre os 3 gráficos (Categoria/Técnico/Equipe) da aba Analítica.
  const keepTiposAnalitica = useMemo(() => {
    const tipos = dados?.tiposAtendimento ?? [];
    if (!dadosAnalitica) return tipos;
    const keep = computeDominantTipos(dadosAnalitica.porCategoriaAtendimento, tipos);
    return keep.length < tipos.length ? [...keep, OUTROS_LABEL] : keep;
  }, [dadosAnalitica, dados]);

  const updatedAt = dados?.generatedAt
    ? new Date(dados.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  const mesMesAtual = new Date().toISOString().slice(0, 7);
  const filtroDataAtivo = Boolean(mesFiltro || dataInicio || dataFim);
  const porMesCards = dados
    ? (filtroDataAtivo ? dados.porMes : dados.porMes.slice(-4))
    : [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando dados do GLPI…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao conectar ao GLPI</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={fetchDados}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!dados) return null;

  return (
    <div className={`max-w-[1800px] mx-auto p-6 space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Acompanhamento de Equipe — GLPI</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            {updatedAt && <span>Atualizado às {updatedAt}</span>}
            {reloading && <Loader2 size={12} className="animate-spin text-primary" />}
            <span>{dados.kpis.total} chamados{grupoFiltro ? ` · ${grupoFiltro}` : ''}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {([
              { key: 'geral', label: 'Visão Geral', icon: LayoutDashboard },
              { key: 'analitica', label: 'Analítica', icon: PieChartIcon },
              { key: 'abertura', label: 'Abertura por Equipe', icon: Building2 },
            ] as const).map((opt) => (
              <button key={opt.key} onClick={() => setMainTab(opt.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  mainTab === opt.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}>
                <opt.icon size={14} /> {opt.label}
              </button>
            ))}
          </div>
          <button onClick={
            mainTab === 'analitica' ? fetchAnalitica
            : mainTab === 'abertura' ? fetchAbertura
            : fetchDados
          }
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {mainTab === 'geral' && (
      <>
      {/* ── Filters ── */}
      <div className="rounded-lg border border-border px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Equipe</span>
        <Select
          value={grupoFiltro}
          onChange={(v) => { setGrupoFiltro(v); setMesFiltro(''); }}
          className="min-w-[180px]"
          options={[
            { value: '', label: 'Todas as equipes' },
            ...dados.grupos.map((g) => ({ value: g.nome, label: g.nome })),
          ]}
        />

        {availableMeses.length > 0 && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Mês</span>
            <Select
              value={mesFiltro}
              onChange={setMesFiltro}
              className="min-w-[140px]"
              options={[
                { value: '', label: 'Todos os meses' },
                ...availableMeses.map((m) => ({ value: m, label: fmtMes(m) })),
              ]}
            />
          </>
        )}

        <div className="w-px h-5 bg-border mx-1" />
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Data</span>
        <div className="flex items-center gap-2">
          <DatePicker value={dataInicio} onChange={setDataInicio} placeholder="Início" maxDate={dataFim || undefined} />
          <span className="text-xs text-muted-foreground">até</span>
          <DatePicker value={dataFim} onChange={setDataFim} placeholder="Fim" minDate={dataInicio || undefined} />
          {(dataInicio || dataFim) && (
            <button
              onClick={() => { setDataInicio(''); setDataFim(''); }}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Limpar filtro de data">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard title="Total de chamados" value={dados.kpis.total}
          sub="histórico completo"
          icon={BarChart3} color="#323131" borderColor="#6F686B" />
        <KpiCard title="Em aberto" value={dados.kpis.emAberto}
          sub={`${dados.kpis.abertosHa30dias} há mais de 30 dias`}
          icon={Ticket} color="#155DFC" borderColor="#2B7FFF" />
        <KpiCard title="Novos (sem atribuição)" value={dados.kpis.statusNovo}
          sub="aguardando triagem"
          icon={TrendingUp} color="#A65F00" borderColor="#D08700" />
        <KpiCard title="Fechados (total)" value={dados.kpis.total - dados.kpis.emAberto}
          sub={`${dados.kpis.fechadosHoje} hoje`}
          icon={CheckCircle2} color="#008236" borderColor="#00A63E" />
        <KpiCard title="Abertos há +15 dias" value={dados.kpis.abertosHa15dias}
          sub={`${dados.kpis.abertosHa30dias} há +30 dias`}
          icon={AlertTriangle} color="#CA3500" borderColor="#FF6900" />
      </div>

      {/* ── Status + Priority ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">Por status</h2>
          <div className="space-y-3">
            {dados.porStatus.map((s) => (
              <HBarRow key={s.status} nome={s.nome} count={s.count} max={maxStatus}
                color={STATUS_COLORS[s.nome] ?? '#94A3B8'} />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">Por prioridade</h2>
          <div className="space-y-3">
            {dados.porPrioridade.map((p) => (
              <HBarRow key={p.priority} nome={p.nome} count={p.count} max={maxPrio}
                color={PRIORITY_COLORS[p.nome] ?? '#94A3B8'} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Tendência mensal ── */}
      <div className="rounded-lg border border-border p-5">
        <h2 className="text-sm font-semibold mb-5 flex items-center gap-2">
          <TrendingUp size={16} className="text-primary" /> Tendência mensal
          {mesFiltro && (
            <span className="text-xs font-normal text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {fmtMes(mesFiltro)}
            </span>
          )}
          {(dataInicio || dataFim) && (
            <span className="text-xs font-normal text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {dataInicio ? fmtDate(dataInicio) : '…'} até {dataFim ? fmtDate(dataFim) : '…'}
            </span>
          )}
        </h2>

        {/* Month comparison cards */}
        <div className={`grid gap-3 mb-6 grid-cols-2 ${porMesCards.length > 4 ? 'sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-4'}`}>
          {porMesCards.map((m, i, arr) => {
            const prev = i > 0 ? arr[i - 1] : null;
            const isAtual = m.mes === mesMesAtual;
            const saldo = m.total - m.resolvidosNoMes;
            const dCriados = prev ? deltaPct(m.total, prev.total) : null;
            const dResolvidos = prev ? deltaPct(m.resolvidosNoMes, prev.resolvidosNoMes) : null;
            return (
              <div key={m.mes}
                className={`rounded-lg border p-4 ${isAtual ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{fmtMes(m.mes)}</p>
                  {isAtual && <span className="text-[10px] font-semibold text-primary bg-primary/15 px-1.5 py-0.5 rounded">atual</span>}
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Criados</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold tabular-nums">{m.total}</span>
                      {dCriados !== null && (
                        <span className={`text-[10px] font-semibold tabular-nums ${dCriados > 0 ? 'text-warning' : dCriados < 0 ? 'text-success' : 'text-muted-foreground'}`}>
                          {dCriados > 0 ? `+${dCriados}%` : `${dCriados}%`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Resolvidos</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-bold tabular-nums ${m.resolvidosNoMes >= m.total ? 'text-success' : ''}`}>
                        {m.resolvidosNoMes}
                      </span>
                      {dResolvidos !== null && (
                        <span className={`text-[10px] font-semibold tabular-nums ${dResolvidos >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {dResolvidos > 0 ? `+${dResolvidos}%` : `${dResolvidos}%`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border/80 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">saldo</span>
                    <span className={`text-xs font-bold tabular-nums ${saldo > 0 ? 'text-warning' : saldo < 0 ? 'text-success' : 'text-muted-foreground'}`}>
                      {saldo > 0 ? `+${saldo}` : saldo < 0 ? `${saldo}` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bar chart */}
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={dados.porMes.map((m) => ({ ...m, mes: fmtMes(m.mes) }))}
            margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #D1D0D0' }} labelStyle={{ fontWeight: 600 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="total" name="Criados" fill="#155DFC" radius={[2,2,0,0]} />
            <Bar dataKey="resolvidosNoMes" name="Resolvidos no mês" fill="#00A63E" radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Category + Group ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">
            Por categoria (top 12){grupoFiltro && <span className="ml-1 text-xs font-normal text-muted-foreground">· {grupoFiltro}</span>}
          </h2>
          <div className="space-y-2.5">
            {dados.porCategoria.map((c) => (
              <HBarRow key={c.nome} nome={c.nome} count={c.count} max={maxCat} color="#155DFC" />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">Em aberto por equipe</h2>
          <div className="space-y-3">
            {dados.porGrupo.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados de equipe</p>
            ) : (
              dados.porGrupo.map((g) => (
                <HBarRow key={g.nome} nome={g.nome} count={g.count} max={maxGrupo} color="#872BFF" />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Technician Table ── */}
      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Users size={15} className="text-primary" />
            Por técnico
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {grupoFiltro || 'todas as equipes'}
            </span>
          </h2>
          <span className="text-xs text-muted-foreground">{sortedTecnicos.length} técnico(s)</span>
        </div>

        {sortedTecnicos.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Nenhum técnico encontrado para este filtro.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <SortTh col="nome" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-5">Técnico</SortTh>
                  <SortTh col="grupo" current={sortCol} dir={sortDir} onSort={toggleSort}>Equipe</SortTh>
                  <SortTh col="emAberto" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">Em aberto</SortTh>
                  <SortTh col="pendentes" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">Pendentes</SortTh>
                  <SortTh col="emAndamento" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">Em andamento</SortTh>
                  <SortTh col="resolvidos" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">Resolvidos</SortTh>
                  <SortTh col="tmaDias" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">TMA médio</SortTh>
                  <SortTh col="oldestDias" current={sortCol} dir={sortDir} onSort={toggleSort} className="px-4 text-right">Mais antigo</SortTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedTecnicos.map((t) => {
                  const color = avatarColor(t.id);
                  return (
                    <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                            style={{ backgroundColor: color }}>
                            {initials(t.nome)}
                          </span>
                          <span className="font-medium">{t.nome}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{t.grupo || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => t.emAberto > 0 && openModal(t, 'aberto')} disabled={t.emAberto === 0}
                          className={`tabular-nums font-semibold transition-colors ${
                            t.emAberto === 0 ? 'text-muted-foreground cursor-default'
                            : t.emAberto > 10 ? 'text-destructive hover:opacity-70 underline decoration-dotted cursor-pointer'
                            : t.emAberto > 5 ? 'text-warning hover:opacity-70 underline decoration-dotted cursor-pointer'
                            : 'hover:text-foreground underline decoration-dotted cursor-pointer'
                          }`}>
                          {t.emAberto}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
                        {t.pendentes > 0 ? t.pendentes : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
                        {t.emAndamento > 0 ? t.emAndamento : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => t.resolvidos > 0 && openModal(t, 'resolvido')} disabled={t.resolvidos === 0}
                          className={`tabular-nums font-semibold transition-colors ${
                            t.resolvidos === 0 ? 'text-muted-foreground cursor-default'
                            : 'text-success hover:opacity-70 underline decoration-dotted cursor-pointer'
                          }`}>
                          {t.resolvidos}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums text-xs">
                        {t.tmaDias > 0 ? `${t.tmaDias}d` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => t.emAberto > 0 && openModal(t, 'antigo')} disabled={t.emAberto === 0}
                          className={t.emAberto > 0 ? 'cursor-pointer' : 'cursor-default'}>
                          <SlaChip dias={t.oldestDias} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-border bg-muted/50">
                <tr className="text-xs font-semibold text-muted-foreground">
                  <td className="px-5 py-3" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{sortedTecnicos.reduce((s, t) => s + t.emAberto, 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{sortedTecnicos.reduce((s, t) => s + t.pendentes, 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{sortedTecnicos.reduce((s, t) => s + t.emAndamento, 0)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-success">{sortedTecnicos.reduce((s, t) => s + t.resolvidos, 0)}</td>
                  <td className="px-4 py-3" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {modalTech && modalType && (
        <TicketModal tech={modalTech} type={modalType} glpiUrl={dados.glpiUrl} onClose={closeModal} />
      )}
      </>
      )}

      {mainTab === 'analitica' && (
      <div className="space-y-5">
        {/* ── Squad filter ── */}
        <div className="rounded-lg border border-border px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Equipe</span>
            <Select
              value={analiticaGrupo}
              onChange={setAnaliticaGrupo}
              className="min-w-[220px]"
              options={[
                { value: '', label: 'Selecione uma equipe para detalhar' },
                ...dados.grupos.map((g) => ({ value: g.nome, label: g.nome })),
              ]}
            />
            {loadingAnalitica && <Loader2 size={14} className="animate-spin text-primary" />}
          </div>
          <AtendimentoLegend tipos={keepTiposAnalitica} />
        </div>

        {!dadosAnalitica ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
            {loadingAnalitica ? 'Carregando…' : 'Sem dados.'}
          </div>
        ) : !analiticaGrupo ? (
          <>
            <p className="text-xs text-muted-foreground">
              Visão consolidada por equipe. Selecione uma equipe acima para detalhar por categoria e técnico.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-5">
                <h2 className="text-sm font-semibold mb-4">Tipo de Atendimento por Equipe</h2>
                <AtendimentoBarChart data={dadosAnalitica.porGrupoAtendimento} tipos={keepTiposAnalitica} />
              </div>
              <div className="rounded-lg border border-border p-5">
                <h2 className="text-sm font-semibold mb-4">% que exige Desenvolvimento — por Equipe</h2>
                <DevMeterList data={dadosAnalitica.porGrupoAtendimento} />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-5">
                <h2 className="text-sm font-semibold mb-4">Tipo de Atendimento por Categoria</h2>
                <AtendimentoBarChart data={dadosAnalitica.porCategoriaAtendimento} tipos={keepTiposAnalitica} />
              </div>
              <div className="rounded-lg border border-border p-5">
                <h2 className="text-sm font-semibold mb-4">% que exige Desenvolvimento — por Categoria</h2>
                <DevMeterList data={dadosAnalitica.porCategoriaAtendimento} />
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-5">
                <h2 className="text-sm font-semibold mb-4">Tipo de Atendimento por Técnico</h2>
                <AtendimentoBarChart data={dadosAnalitica.porTecnicoAtendimento} tipos={keepTiposAnalitica} />
              </div>
              <div className="rounded-lg border border-border p-5">
                <h2 className="text-sm font-semibold mb-4">% que exige Desenvolvimento — por Técnico</h2>
                <DevMeterList data={dadosAnalitica.porTecnicoAtendimento} />
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {mainTab === 'abertura' && (
      <div className="space-y-5">
        {/* ── Filters ── */}
        <div className="rounded-lg border border-border px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Equipe</span>
          <Select
            value={aberturaGrupo}
            onChange={(v) => { setAberturaGrupo(v); setAberturaMes(''); }}
            className="min-w-[170px]"
            options={[
              { value: '', label: 'Todas as equipes' },
              ...dados.grupos.map((g) => ({ value: g.nome, label: g.nome })),
            ]}
          />

          <div className="w-px h-5 bg-border mx-1" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Solicitante</span>
          <Select
            value={aberturaDepartamento}
            onChange={setAberturaDepartamento}
            className="min-w-[170px]"
            options={[
              { value: '', label: 'Todos os departamentos' },
              ...dados.departamentos.map((d) => ({ value: d, label: d })),
            ]}
          />

          {aberturaAvailableMeses.length > 0 && (
            <>
              <div className="w-px h-5 bg-border mx-1" />
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Mês</span>
              <Select
                value={aberturaMes}
                onChange={setAberturaMes}
                className="min-w-[140px]"
                options={[
                  { value: '', label: 'Todos os meses' },
                  ...aberturaAvailableMeses.map((m) => ({ value: m, label: fmtMes(m) })),
                ]}
              />
            </>
          )}

          <div className="w-px h-5 bg-border mx-1" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Data</span>
          <div className="flex items-center gap-2">
            <DatePicker value={aberturaDataInicio} onChange={setAberturaDataInicio} placeholder="Início" maxDate={aberturaDataFim || undefined} />
            <span className="text-xs text-muted-foreground">até</span>
            <DatePicker value={aberturaDataFim} onChange={setAberturaDataFim} placeholder="Fim" minDate={aberturaDataInicio || undefined} />
            {(aberturaDataInicio || aberturaDataFim) && (
              <button
                onClick={() => { setAberturaDataInicio(''); setAberturaDataFim(''); }}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Limpar filtro de data">
                <X size={12} />
              </button>
            )}
          </div>
          {loadingAbertura && <Loader2 size={14} className="animate-spin text-primary ml-1" />}
        </div>

        {!dadosAbertura ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
            {loadingAbertura ? 'Carregando…' : 'Sem dados.'}
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              "Equipe" e "Solicitante" aqui se referem a quem <strong>abriu</strong> o chamado (Título cadastrado no usuário) — não ao técnico responsável pela resolução.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-5">
                <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Building2 size={15} className="text-primary" /> Abertura por Equipe (Departamento)
                </h2>
                {dadosAbertura.aberturaPorEquipe.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados para este filtro.</p>
                ) : (
                  <div className="space-y-3">
                    {dadosAbertura.aberturaPorEquipe.map((e) => (
                      <HBarRow key={e.equipe} nome={e.equipe} count={e.count}
                        max={Math.max(...dadosAbertura.aberturaPorEquipe.map((x) => x.count), 1)} color="#155DFC" />
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-border p-5">
                <h2 className="text-sm font-semibold mb-4">
                  % de categoria {aberturaDepartamento ? `abertos por ${aberturaDepartamento}` : '(top 12)'}
                </h2>
                {dadosAbertura.porCategoria.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados para este filtro.</p>
                ) : (
                  <div className="space-y-2.5">
                    {dadosAbertura.porCategoria.map((c) => (
                      <HBarRow key={c.nome} nome={c.nome} count={c.count}
                        max={Math.max(...dadosAbertura.porCategoria.map((x) => x.count), 1)} color="#872BFF"
                        valueLabel={dadosAbertura.kpis.total > 0 ? `${Math.round((c.count / dadosAbertura.kpis.total) * 100)}%` : '0%'} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-5">
                <h2 className="text-sm font-semibold mb-2">Tipo de Atendimento</h2>
                <TipoAtendimentoPie data={dadosAbertura.tipoAtendimentoTotais} />
              </div>
              <div className="rounded-lg border border-border p-5">
                <h2 className="text-sm font-semibold mb-2">Exige Desenvolvimento?</h2>
                <DesenvolvimentoPie data={dadosAbertura.desenvolvimentoTotais} />
              </div>
            </div>

            <div className="rounded-lg border border-border p-5">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Users size={15} className="text-primary" /> Top 10 — quem mais abre chamados
              </h2>
              {dadosAbertura.topSolicitantes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados para este filtro.</p>
              ) : (
                <div className="space-y-3">
                  {dadosAbertura.topSolicitantes.map((s) => (
                    <HBarRow key={s.nome} nome={s.nome} count={s.count}
                      max={Math.max(...dadosAbertura.topSolicitantes.map((x) => x.count), 1)} color="#00A63E" />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      )}

    </div>
  );
}
