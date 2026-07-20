'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, TrendingUp, Wallet, Undo2, FileWarning, Download, Landmark,
  Maximize2, Minimize2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  useXAxisScale, useYAxisScale,
} from 'recharts';
import type { PagamentosData } from '@/lib/pagamentos';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

type Granularidade = 'dia' | 'mes';
type Metrica = 'valor' | 'quantidade';
type Preset = 'este_mes' | 'mes_passado' | 'este_ano' | 'personalizado';
type Aba = 'geral' | 'pf' | 'pj' | 'aditivo';

const ABAS: { value: Aba; label: string }[] = [
  { value: 'geral', label: 'Geral' },
  { value: 'pf', label: 'PF' },
  { value: 'pj', label: 'PJ' },
  { value: 'aditivo', label: 'Aditivo' },
];

// Modo apresentação: cada slide é um tipo de pagamento (Geral → PF → PJ → Aditivo), na mesma
// ordem de ABAS — 10s cada, igual ao padrão usado em /vendas e /carrinho.
const TOTAL_SLIDES = ABAS.length;

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtData(s: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
}

function fmtDiaLabel(periodo: string) {
  const [, m, d] = periodo.split('-');
  return `${d}/${m}`;
}

function fmtMesLabel(periodo: string) {
  const [y, m] = periodo.split('-');
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${names[Number(m) - 1]}/${y.slice(2)}`;
}

function fmtFormaPagamento(f: string) {
  const map: Record<string, string> = { boleto: 'Boleto', cartao: 'Cartão', pix: 'Pix', deposito: 'Depósito' };
  return map[f] ?? (f.charAt(0).toUpperCase() + f.slice(1));
}

// Cor fixa por forma de pagamento (identidade, não por posição no ranking)
const FORMA_COLORS: Record<string, string> = {
  pix: '#155DFC',
  boleto: '#D08700',
  cartao: '#872BFF',
  deposito: '#00A63E',
};
const FORMA_COLOR_FALLBACK = '#6F686B';
function corForma(f: string) {
  return FORMA_COLORS[f] ?? FORMA_COLOR_FALLBACK;
}

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function primeiroDiaMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function presetParaDatas(preset: Preset): { dataInicial: string; dataFinal: string } {
  const hoje = new Date();
  if (preset === 'este_mes') {
    return { dataInicial: primeiroDiaMes(hoje), dataFinal: isoHoje() };
  }
  if (preset === 'mes_passado') {
    const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { dataInicial: primeiroDiaMes(mesPassado), dataFinal: ultimoDia.toISOString().slice(0, 10) };
  }
  if (preset === 'este_ano') {
    return { dataInicial: `${hoje.getFullYear()}-01-01`, dataFinal: isoHoje() };
  }
  return { dataInicial: primeiroDiaMes(hoje), dataFinal: isoHoje() };
}

function KpiCard({
  title, value, sub, icon: Icon, color, big,
}: {
  title: string; value: string | number; sub?: string; icon: any; color: string; big?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-border ${big ? 'p-8' : 'p-5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-muted-foreground uppercase tracking-wider ${big ? 'text-sm' : 'text-[11px]'}`}>{title}</p>
          <p className={`font-bold mt-1 tabular-nums truncate ${big ? 'text-4xl' : 'text-2xl'}`} style={{ color }} title={String(value)}>{value}</p>
          {sub && <p className={`text-muted-foreground mt-1 ${big ? 'text-base' : 'text-xs'}`}>{sub}</p>}
        </div>
        <Icon size={big ? 32 : 20} style={{ color }} className="opacity-60 flex-shrink-0 mt-1" />
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, granularidade, metrica }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const total = payload.reduce((s: number, p: any) => s + (Number(p.value) || 0), 0);
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs min-w-[170px]">
      <p className="font-semibold mb-1.5">{granularidade === 'dia' ? fmtData(d.periodo) : fmtMesLabel(d.periodo)}</p>
      <div className="space-y-1">
        {payload.slice().reverse().map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
              {p.name}
            </span>
            <span className="font-semibold tabular-nums">
              {metrica === 'valor' ? fmtMoeda(Number(p.value)) : p.value}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 mt-1.5 pt-1.5 border-t border-border/80 font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{metrica === 'valor' ? fmtMoeda(total) : total}</span>
      </div>
      {d.valorEstornado > 0 && (
        <p className="mt-1.5 pt-1.5 border-t border-border/80 text-destructive">
          Estornado: <span className="font-semibold tabular-nums">{fmtMoeda(d.valorEstornado)}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Rótulo de total por barra, posicionado pela escala real do gráfico (useXAxisScale/useYAxisScale)
 * em vez de tentar adivinhar qual forma de pagamento o Recharts empilha por cima — a ordem visual
 * de empilhamento não segue a ordem de ranking usada para declarar os <Bar>, então ancorar o rótulo
 * num segmento específico fazia ele cair no meio da pilha em vez de acima dela.
 */
function TotalLabels({ data, metrica }: { data: any[]; metrica: Metrica }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale) return null;
  return (
    <g>
      {data.map((item) => {
        const total = metrica === 'valor' ? item.valorRecebido : item.qtdPagamentos;
        if (!total) return null;
        const x = xScale(item.periodo, { position: 'middle' });
        const y = yScale(total);
        if (x == null || y == null) return null;
        return (
          <text key={item.periodo} x={x} y={y - 6} textAnchor="middle" fontSize={10} fill="#6F686B">
            {metrica === 'valor' ? fmtMoeda(total) : total}
          </text>
        );
      })}
    </g>
  );
}

export default function PagamentosPage() {
  const [preset, setPreset] = useState<Preset>('este_mes');
  const [dataInicial, setDataInicial] = useState(() => presetParaDatas('este_mes').dataInicial);
  const [dataFinal, setDataFinal] = useState(() => presetParaDatas('este_mes').dataFinal);
  const [granularidade, setGranularidade] = useState<Granularidade>('dia');
  const [metrica, setMetrica] = useState<Metrica>('valor');
  const [aba, setAba] = useState<Aba>('geral');

  const [dados, setDados] = useState<PagamentosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [apresentacao, setApresentacao] = useState(false);
  const [slideAtual, setSlideAtual] = useState(0);
  const [slideEpoch, setSlideEpoch] = useState(0);
  const [slidesPausados, setSlidesPausados] = useState(false);
  const [embutido, setEmbutido] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Quando embutido no iframe da tela /apresentacao, quem controla a saída da apresentação é o
  // botão "Sair da apresentação" da barra do orquestrador.
  useEffect(() => {
    setEmbutido(window.self !== window.top);
  }, []);

  // Avisa a tela /apresentacao quantos slides este relatório tem (4: Geral/PF/PJ/Aditivo) — o
  // padrão do orquestrador é 3 (vendas/carrinho/assinaturas), então sem isso ele trocaria de
  // relatório um slide antes da hora, cortando o slide de Aditivo.
  useEffect(() => {
    if (!embutido) return;
    window.parent.postMessage({ type: 'apresentacao:totalSlides', total: TOTAL_SLIDES }, window.location.origin);
  }, [embutido]);

  const fetchDados = useCallback(async (di: string, df: string) => {
    setError(null);
    try {
      const res = await axios.get('/api/pagamentos', { params: { dataInicial: di, dataFinal: df } });
      setDados(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  useEffect(() => {
    setReloading(true);
    fetchDados(dataInicial, dataFinal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicial, dataFinal]);

  // Modo apresentação: acompanha o estado de fullscreen (ex.: usuário aperta Esc) e mantém os dados atualizados sozinho.
  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) setApresentacao(false);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!apresentacao) return;
    const id = setInterval(() => {
      fetchDados(dataInicial, dataFinal);
    }, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [apresentacao, dataInicial, dataFinal, fetchDados]);

  // Troca automática de slide (Geral → PF → PJ → Aditivo) a cada 10s. Reinicia a contagem
  // (slideEpoch) sempre que a tela /apresentacao avisa que este relatório acabou de virar o ativo.
  useEffect(() => {
    if (!apresentacao || slidesPausados) return;
    const id = setInterval(() => {
      setSlideAtual((s) => (s + 1) % TOTAL_SLIDES);
    }, 10 * 1000);
    return () => clearInterval(id);
  }, [apresentacao, slideEpoch, slidesPausados]);

  // Escuta os avisos enviados pela tela /apresentacao (postMessage) quando este relatório é
  // embutido em iframe: "ativar" reinicia o ciclo de slides ao virar o relatório em exibição, e
  // "pausar" congela/retoma a troca automática junto com a pausa da apresentação.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'apresentacao:ativar') {
        setSlideAtual(0);
        setSlideEpoch((v) => v + 1);
      } else if (e.data?.type === 'apresentacao:pausar') {
        setSlidesPausados(Boolean(e.data.pausado));
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  // Auto-inicia o modo apresentação quando aberto via ?apresentacao=1 (usado pela tela /apresentacao).
  // Quando embutido num iframe, quem controla o fullscreen é a página pai.
  useEffect(() => {
    if (loading) return;
    if (!apresentacao && new URLSearchParams(window.location.search).get('apresentacao') === '1') {
      setApresentacao(true);
      setSlideAtual(0);
      if (window.self === window.top) {
        containerRef.current?.requestFullscreen?.().catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function toggleApresentacao() {
    if (apresentacao) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setApresentacao(false);
    } else {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setApresentacao(true);
      setSlideAtual(0);
    }
  }

  function aplicarPreset(p: Preset) {
    setPreset(p);
    if (p !== 'personalizado') {
      const { dataInicial: di, dataFinal: df } = presetParaDatas(p);
      setDataInicial(di);
      setDataFinal(df);
    }
  }

  // No modo apresentação, o slide manda qual tipo é exibido (a aba manual fica sem efeito).
  const abaExibida = apresentacao ? ABAS[slideAtual].value : aba;

  const atual = useMemo(() => {
    if (!dados) return null;
    const chave = abaExibida === 'geral' ? 'geral' : abaExibida === 'pf' ? 'pf' : abaExibida === 'pj' ? 'pj' : 'aditivo';
    return dados.porCategoria[chave];
  }, [dados, abaExibida]);

  const serie = useMemo(() => {
    if (!atual) return [];
    return granularidade === 'dia' ? atual.seriePorDia : atual.seriePorMes;
  }, [atual, granularidade]);

  // Formas ordenadas por relevância (maior volume primeiro = base da pilha)
  const formas = useMemo(
    () => (atual ? atual.rankingFormaPagamento.map((f) => f.formaPagamento) : []),
    [atual]
  );

  const serieFlat = useMemo(() => serie.map((s) => {
    const obj: Record<string, any> = { ...s };
    for (const forma of formas) {
      obj[`valor_${forma}`] = s.porForma[forma]?.valor ?? 0;
      obj[`qtd_${forma}`] = s.porForma[forma]?.qtd ?? 0;
    }
    return obj;
  }), [serie, formas]);


  function exportarCsv() {
    if (!dados) return;
    const header = ['Pagamento', 'Cliente', 'Categoria', 'Data', 'Forma', 'Valor', 'Estorno', 'NFS-e'];
    const categoriaPorAba: Record<Aba, string | null> = { geral: null, pf: 'PF', pj: 'PJ', aditivo: 'ADITIVO' };
    const categoriaLabel: Record<string, string> = { PF: 'PF', PJ: 'PJ', ADITIVO: 'Aditivo' };
    const categoriaAlvo = categoriaPorAba[aba];
    const pagamentosDaAba = categoriaAlvo === null ? dados.pagamentos : dados.pagamentos.filter((p) => p.categoria === categoriaAlvo);
    const linhas = pagamentosDaAba.map((p) => [
      p.idPagamento, p.clienteNome, categoriaLabel[p.categoria], fmtData(p.dataPagamento), fmtFormaPagamento(p.formaPagamento),
      p.valor.toFixed(2), p.estorno ? 'Sim' : 'Não', p.temNfs ? 'Sim' : 'Não',
    ]);
    const csv = [header, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-pagamentos-${aba}-${dataInicial}-a-${dataFinal}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const updatedAt = dados?.generatedAt
    ? new Date(dados.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando pagamentos do período…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao carregar dados</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => { setLoading(true); fetchDados(dataInicial, dataFinal); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!dados || !atual) return null;

  return (
    <div ref={containerRef}
      className={`transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''} ${apresentacao ? 'max-w-none bg-background p-10 h-screen flex flex-col gap-5 overflow-hidden' : 'max-w-[1800px] mx-auto p-6 space-y-5'}`}>

      {/* Header */}
      <div className={`flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 ${apresentacao ? 'shrink-0' : ''}`}>
        <div>
          <h1 className={apresentacao ? 'text-4xl font-bold tracking-tight' : 'text-2xl font-semibold tracking-tight'}>
            Relatório de Pagamentos{apresentacao && ` · ${ABAS[slideAtual].label}`}
          </h1>
          <p className={`text-muted-foreground mt-0.5 flex items-center gap-2 ${apresentacao ? 'text-base' : 'text-sm'}`}>
            {updatedAt && <span>Atualizado às {updatedAt}</span>}
            {reloading && <Loader2 size={12} className="animate-spin text-primary" />}
            <span>· {fmtData(dataInicial)} a {fmtData(dataFinal)}</span>
          </p>
        </div>
        {apresentacao ? (
          !embutido && (
            <button onClick={toggleApresentacao}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <Minimize2 size={14} /> Sair da apresentação
            </button>
          )
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={preset}
              onChange={(v) => aplicarPreset(v as Preset)}
              className="min-w-[170px]"
              options={[
                { value: 'este_mes', label: 'Este mês' },
                { value: 'mes_passado', label: 'Mês passado' },
                { value: 'este_ano', label: 'Este ano' },
                { value: 'personalizado', label: 'Personalizado' },
              ]}
            />
            {preset === 'personalizado' && (
              <>
                <DatePicker value={dataInicial} onChange={setDataInicial} placeholder="Data inicial" maxDate={dataFinal} />
                <span className="text-muted-foreground text-xs">até</span>
                <DatePicker value={dataFinal} onChange={setDataFinal} placeholder="Data final" minDate={dataInicial} />
              </>
            )}
            <button onClick={exportarCsv}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <Download size={14} /> Exportar CSV
            </button>
            <button onClick={() => { setReloading(true); fetchDados(dataInicial, dataFinal); }}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <RefreshCw size={14} /> Atualizar
            </button>
            <button onClick={toggleApresentacao}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <Maximize2 size={14} /> Modo apresentação
            </button>
          </div>
        )}
      </div>

      {/* Abas por tipo de pagamento (só no modo normal — no modo apresentação o tipo já vai no título) */}
      {!apresentacao && (
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 w-fit">
          {ABAS.map((a) => (
            <button key={a.value} onClick={() => setAba(a.value)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${aba === a.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Indicador de slides (modo apresentação) */}
      {apresentacao && (
        <div className="flex items-center justify-center gap-2 shrink-0">
          {ABAS.map((a, i) => (
            <span key={a.value} className={`h-2 rounded-full transition-all duration-300 ${slideAtual === i ? 'w-10 bg-primary' : 'w-2 bg-border'}`} />
          ))}
        </div>
      )}

      {/* KPI Row */}
      <div className={`grid grid-cols-2 lg:grid-cols-4 ${apresentacao ? 'gap-6 shrink-0' : 'gap-3'}`}>
        <KpiCard big={apresentacao} title="Total de pagamentos" value={atual.kpis.totalPagamentos.toLocaleString('pt-BR')}
          sub={`ticket médio ${fmtMoeda(atual.kpis.ticketMedio)}`}
          icon={Landmark} color="#323131" />
        <KpiCard big={apresentacao} title="Valor recebido" value={fmtMoeda(atual.kpis.valorRecebido)}
          sub={`líquido: ${fmtMoeda(atual.kpis.valorLiquido)}`}
          icon={Wallet} color="#1E7A34" />
        <KpiCard big={apresentacao} title="Estornos" value={atual.kpis.qtdEstornos.toLocaleString('pt-BR')}
          sub={fmtMoeda(atual.kpis.valorEstornado)}
          icon={Undo2} color="#CA3500" />
        <KpiCard big={apresentacao} title="Sem NFS-e" value={atual.kpis.qtdSemNfs.toLocaleString('pt-BR')}
          sub={`${atual.kpis.qtdComNfs.toLocaleString('pt-BR')} com NFS-e emitida`}
          icon={FileWarning} color="#B8860B" />
      </div>

      {/* Evolução */}
      <div className={`rounded-lg border border-border ${apresentacao ? 'p-8 flex-1 min-h-0 flex flex-col' : 'p-5'}`}>
        <div className={`flex items-center justify-between flex-wrap gap-2 ${apresentacao ? 'mb-4 shrink-0' : 'mb-4'}`}>
          <h2 className={`font-semibold flex items-center gap-2 ${apresentacao ? 'text-lg' : 'text-sm'}`}>
            <TrendingUp size={apresentacao ? 20 : 16} className="text-primary" /> Evolução de pagamentos
          </h2>
          {!apresentacao && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                <button onClick={() => setMetrica('valor')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${metrica === 'valor' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  Valor
                </button>
                <button onClick={() => setMetrica('quantidade')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${metrica === 'quantidade' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  Quantidade
                </button>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                <button onClick={() => setGranularidade('dia')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${granularidade === 'dia' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  Por dia
                </button>
                <button onClick={() => setGranularidade('mes')}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${granularidade === 'mes' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  Por mês
                </button>
              </div>
            </div>
          )}
        </div>
        <div className={apresentacao ? 'flex-1 min-h-0' : ''}>
        <ResponsiveContainer width="100%" height={apresentacao ? '100%' : 300}>
          <BarChart data={serieFlat} margin={{ top: 20, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F6F5F5" />
            <XAxis
              dataKey="periodo"
              tickFormatter={granularidade === 'dia' ? fmtDiaLabel : fmtMesLabel}
              tick={{ fontSize: apresentacao ? 13 : 10 }}
              interval={granularidade === 'dia' ? Math.max(0, Math.floor(serie.length / 20)) : 0}
            />
            <YAxis tick={{ fontSize: apresentacao ? 13 : 11 }} tickFormatter={metrica === 'valor' ? (v) => `${(v / 1000).toFixed(0)}k` : undefined} />
            <Tooltip content={<CustomTooltip granularidade={granularidade} metrica={metrica} />} />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              iconSize={apresentacao ? 10 : 8}
              wrapperStyle={{ fontSize: apresentacao ? 13 : 11, paddingBottom: 8 }}
              formatter={(value: string) => <span className="text-muted-foreground">{value}</span>}
            />
            {formas.map((forma) => (
              <Bar
                key={forma}
                dataKey={metrica === 'valor' ? `valor_${forma}` : `qtd_${forma}`}
                name={fmtFormaPagamento(forma)}
                stackId="forma"
                fill={corForma(forma)}
                stroke="#FFFFFF"
                strokeWidth={2}
                minPointSize={1}
              />
            ))}
            {serieFlat.length <= 45 && <TotalLabels data={serieFlat} metrica={metrica} />}
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>

      {/* Ranking forma de pagamento */}
      <div className={`rounded-lg border border-border ${apresentacao ? 'shrink-0 max-h-[24vh] flex flex-col' : ''}`}>
        <div className={`border-b border-border flex items-center justify-between ${apresentacao ? 'px-8 py-3 shrink-0' : 'px-5 py-4'}`}>
          <h2 className={`font-semibold flex items-center gap-2 ${apresentacao ? 'text-lg' : 'text-sm'}`}>
            <Wallet size={apresentacao ? 20 : 15} className="text-primary" /> Por forma de pagamento
          </h2>
        </div>
        <div className={`overflow-x-auto ${apresentacao ? 'overflow-y-auto' : ''}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className={`text-left text-muted-foreground uppercase tracking-wider border-b border-border ${apresentacao ? 'text-sm' : 'text-[11px]'}`}>
                <th className={`font-semibold ${apresentacao ? 'px-8 py-2' : 'px-5 py-2.5'}`}>Forma</th>
                <th className={`font-semibold text-right ${apresentacao ? 'px-4 py-2' : 'px-4 py-2.5'}`}>Qtd</th>
                <th className={`font-semibold text-right ${apresentacao ? 'px-4 py-2' : 'px-4 py-2.5'}`}>Recebido</th>
                <th className={`font-semibold text-right ${apresentacao ? 'px-8 py-2' : 'px-5 py-2.5'}`}>Estornado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {atual.rankingFormaPagamento.map((f) => (
                <tr key={f.formaPagamento} className={`hover:bg-muted/50 transition-colors ${apresentacao ? 'text-base' : ''}`}>
                  <td className={`font-medium ${apresentacao ? 'px-8 py-2' : 'px-5 py-2.5'}`}>
                    <span className="inline-flex items-center gap-2">
                      <span className={`rounded-full flex-shrink-0 ${apresentacao ? 'w-3 h-3' : 'w-2 h-2'}`} style={{ backgroundColor: corForma(f.formaPagamento) }} />
                      {fmtFormaPagamento(f.formaPagamento)}
                    </span>
                  </td>
                  <td className={`text-right tabular-nums ${apresentacao ? 'px-4 py-2' : 'px-4 py-2.5 text-xs'}`}>{f.qtdPagamentos}</td>
                  <td className={`text-right tabular-nums font-semibold text-success ${apresentacao ? 'px-4 py-2' : 'px-4 py-2.5 text-xs'}`}>{fmtMoeda(f.valorRecebido)}</td>
                  <td className={`text-right tabular-nums text-destructive ${apresentacao ? 'px-8 py-2' : 'px-5 py-2.5 text-xs'}`}>{f.valorEstornado > 0 ? fmtMoeda(f.valorEstornado) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
