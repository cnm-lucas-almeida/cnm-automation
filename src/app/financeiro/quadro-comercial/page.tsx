'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, AlertCircle, Settings2, X, Users, HardDrive, History } from 'lucide-react';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { PercentInput } from '@/components/ui/PercentInput';

type HeadcountAtual = {
  vendedoresImoveis: number;
  vendedoresVeiculos: number;
  supervisoresImoveis: number;
  supervisoresVeiculos: number;
};

type Premissas = {
  ano: number;
  headcountMetaImoveis: number;
  headcountMetaVeiculos: number;
  vendedoresPorSupervisorImoveis: number;
  vendedoresPorSupervisorVeiculos: number;
  turnoverMensalPct: number;
  custoMedioVendedor: number;
  custoMedioSupervisor: number;
};

type MesQuadro = {
  competencia: string;
  tipo: 'real' | 'atual' | 'projetado';
  vendedoresImoveis: number;
  vendedoresVeiculos: number;
  backOfficeImoveis: number | null;
  backOfficeVeiculos: number | null;
  supervisoresImoveis: number | null;
  supervisoresVeiculos: number | null;
  admitidos: number | null;
  desligamentos: number | null;
  contratacoesNecessarias: number | null;
  custoTotal: number | null;
};

type SetorHeadcount = { departamento: string; headcount: number };

type AtivosTI = {
  competencia: string | null;
  custoAquisicao: number;
  depreciacaoAcumulada: number;
  valorLiquido: number;
};

type ProjecaoResponse = {
  headcountAtual: HeadcountAtual;
  premissas: Premissas;
  meses: MesQuadro[];
  quadroGeral: SetorHeadcount[];
  ativosTI: AtivosTI;
};

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function mesLabel(competencia: string) {
  const [, mes] = competencia.split('-');
  return MESES[Number(mes) - 1];
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtNum(v: number | null) {
  return v == null ? '—' : Math.round(v).toLocaleString('pt-BR');
}

function PremissasModal({ premissas, onClose, onSalvo }: { premissas: Premissas; onClose: () => void; onSalvo: () => void }) {
  const [form, setForm] = useState({
    headcountMetaImoveis: premissas.headcountMetaImoveis,
    headcountMetaVeiculos: premissas.headcountMetaVeiculos,
    vendedoresPorSupervisorImoveis: premissas.vendedoresPorSupervisorImoveis,
    vendedoresPorSupervisorVeiculos: premissas.vendedoresPorSupervisorVeiculos,
    turnoverMensalPct: premissas.turnoverMensalPct,
    custoMedioVendedor: premissas.custoMedioVendedor,
    custoMedioSupervisor: premissas.custoMedioSupervisor,
  });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function campoNumero(chave: keyof typeof form, label: string) {
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <input
          type="number"
          value={form[chave]}
          onChange={(e) => setForm((f) => ({ ...f, [chave]: Number(e.target.value) || 0 }))}
          className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card"
        />
      </div>
    );
  }

  function campoMoeda(chave: keyof typeof form, label: string) {
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <CurrencyInput
          value={form[chave]}
          onChange={(v) => setForm((f) => ({ ...f, [chave]: v }))}
          className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card"
        />
      </div>
    );
  }

  async function salvar() {
    setEnviando(true);
    setErro(null);
    try {
      await axios.post('/api/quadro-comercial/premissas', { ano: premissas.ano, ...form });
      onSalvo();
      onClose();
    } catch (err: any) {
      setErro(err.response?.data?.error || err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings2 size={18} className="text-primary" /> Premissas do quadro comercial — {premissas.ano}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          O headcount atual vem ao vivo do Convenia (mesma fonte do relatório Inside Sales). Meta,
          razão vendedores/supervisor, turnover e custo médio são premissas — ajuste aqui pra testar
          cenários diferentes (ex.: 20-25 vs. 30-35 vendedores por supervisor).
        </p>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Meta de headcount (vendedores)</p>
          <div className="grid grid-cols-2 gap-3">
            {campoNumero('headcountMetaImoveis', 'Imóveis')}
            {campoNumero('headcountMetaVeiculos', 'Veículos')}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Vendedores por supervisor</p>
          <div className="grid grid-cols-2 gap-3">
            {campoNumero('vendedoresPorSupervisorImoveis', 'Imóveis')}
            {campoNumero('vendedoresPorSupervisorVeiculos', 'Veículos')}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Turnover mensal</label>
          <PercentInput
            value={form.turnoverMensalPct}
            onChange={(v) => setForm((f) => ({ ...f, turnoverMensalPct: v }))}
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card"
          />
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Custo médio mensal (salário + encargos)</p>
          <div className="grid grid-cols-2 gap-3">
            {campoMoeda('custoMedioVendedor', 'Por vendedor')}
            {campoMoeda('custoMedioSupervisor', 'Por supervisor')}
          </div>
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={salvar} disabled={enviando}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {enviando ? <Loader2 size={14} className="animate-spin" /> : null} Salvar e recalcular
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoricoModal({ onClose, onSalvo }: { onClose: () => void; onSalvo: () => void }) {
  const [competencia, setCompetencia] = useState('');
  const [form, setForm] = useState({
    vendedoresImoveis: '', vendedoresVeiculos: '', backOfficeImoveis: '', backOfficeVeiculos: '',
    admitidos: '', desligamentos: '',
  });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  function campo(chave: keyof typeof form, label: string) {
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <input type="number" value={form[chave]} onChange={(e) => setForm((f) => ({ ...f, [chave]: e.target.value }))}
          className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card" />
      </div>
    );
  }

  async function salvar() {
    if (!competencia) { setErro('Selecione a competência.'); return; }
    setEnviando(true);
    setErro(null);
    setSucesso(null);
    try {
      await axios.post('/api/quadro-comercial/historico', {
        competencia: `${competencia}-01`,
        vendedoresImoveis: Number(form.vendedoresImoveis) || 0,
        vendedoresVeiculos: Number(form.vendedoresVeiculos) || 0,
        backOfficeImoveis: Number(form.backOfficeImoveis) || 0,
        backOfficeVeiculos: Number(form.backOfficeVeiculos) || 0,
        admitidos: form.admitidos || null,
        desligamentos: form.desligamentos || null,
      });
      setSucesso('Histórico salvo.');
      onSalvo();
    } catch (err: any) {
      setErro(err.response?.data?.error || err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <History size={18} className="text-primary" /> Lançar histórico mensal
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Headcount real de um mês já fechado (ex.: relatório de turnover do RH). Não vem de nenhuma
          integração automática — preencha só quando tiver o número real do mês.
        </p>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Competência</label>
          <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)}
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {campo('vendedoresImoveis', 'Vendedores Imóveis')}
          {campo('vendedoresVeiculos', 'Vendedores Veículos')}
          {campo('backOfficeImoveis', 'Back Office Imóveis')}
          {campo('backOfficeVeiculos', 'Back Office Veículos')}
          {campo('admitidos', 'Admitidos no mês')}
          {campo('desligamentos', 'Desligamentos no mês')}
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {sucesso && <p className="text-sm text-success">{sucesso}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors">Fechar</button>
          <button onClick={salvar} disabled={enviando}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {enviando ? <Loader2 size={14} className="animate-spin" /> : null} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QuadroComercialPage() {
  const [dados, setDados] = useState<ProjecaoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [historicoModalAberto, setHistoricoModalAberto] = useState(false);

  const carregar = useCallback(async () => {
    setError(null);
    try {
      const res = await axios.get('/api/quadro-comercial', { params: { ano: new Date().getFullYear() } });
      setDados(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando quadro comercial…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao carregar dados</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => { setLoading(true); carregar(); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!dados) return null;

  const { headcountAtual, premissas, meses, quadroGeral, ativosTI } = dados;
  const linhas: { label: string; valores: (m: MesQuadro) => number | null; destaque?: boolean }[] = [
    { label: 'Vendedores — Imóveis', valores: (m) => m.vendedoresImoveis },
    { label: 'Vendedores — Veículos', valores: (m) => m.vendedoresVeiculos },
    { label: 'Total Vendedores', valores: (m) => m.vendedoresImoveis + m.vendedoresVeiculos, destaque: true },
    { label: 'Back Office — Imóveis', valores: (m) => m.backOfficeImoveis },
    { label: 'Back Office — Veículos', valores: (m) => m.backOfficeVeiculos },
    { label: 'Supervisores — Imóveis', valores: (m) => m.supervisoresImoveis },
    { label: 'Supervisores — Veículos', valores: (m) => m.supervisoresVeiculos },
    { label: 'Total Supervisores', valores: (m) => (m.supervisoresImoveis == null ? null : m.supervisoresImoveis + (m.supervisoresVeiculos ?? 0)), destaque: true },
    { label: 'Admitidos no mês (real)', valores: (m) => m.admitidos },
    { label: 'Desligamentos no mês (real)', valores: (m) => m.desligamentos },
    { label: 'Contratações necessárias (projetado)', valores: (m) => m.contratacoesNecessarias },
  ];

  const totalQuadroGeral = quadroGeral.reduce((s, d) => s + d.headcount, 0);

  return (
    <div className={`space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users size={22} className="text-primary" /> Quadro Comercial — Projeção
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Jan-Jun: real (histórico do RH) · mês atual: ao vivo (Convenia) · demais meses: projeção até a meta
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setHistoricoModalAberto(true)}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <History size={14} /> Lançar histórico
          </button>
          <button onClick={() => setModalAberto(true)}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Settings2 size={14} /> Premissas
          </button>
          <button onClick={() => { setReloading(true); carregar(); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Vendedores hoje — Imóveis</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{headcountAtual.vendedoresImoveis}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Vendedores hoje — Veículos</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{headcountAtual.vendedoresVeiculos}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Supervisores hoje — Imóveis</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{headcountAtual.supervisoresImoveis}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Supervisores hoje — Veículos</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{headcountAtual.supervisoresVeiculos}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground uppercase tracking-wider border-b border-border text-[11px]">
              <th className="font-semibold px-5 py-2.5 sticky left-0 bg-card">Métrica</th>
              {meses.map((m) => (
                <th key={m.competencia} className="font-semibold text-right px-3 py-2.5 whitespace-nowrap">
                  {mesLabel(m.competencia)}
                  <span className="block normal-case font-normal text-[9px] text-muted-foreground/70">
                    {m.tipo === 'real' ? 'real' : m.tipo === 'atual' ? 'hoje' : 'projetado'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {linhas.map((linha) => (
              <tr key={linha.label} className={`hover:bg-muted/50 transition-colors ${linha.destaque ? 'font-semibold bg-success/10 text-success' : ''}`}>
                <td className="px-5 py-2 sticky left-0 bg-card whitespace-nowrap">{linha.label}</td>
                {meses.map((m) => (
                  <td key={m.competencia} className={`text-right tabular-nums px-3 py-2 ${m.tipo === 'projetado' ? 'italic text-muted-foreground' : ''}`}>
                    {fmtNum(linha.valores(m))}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="font-semibold bg-success/10 text-success">
              <td className="px-5 py-2 sticky left-0 bg-card">Custo total (folha comercial)</td>
              {meses.map((m) => (
                <td key={m.competencia} className={`text-right tabular-nums px-3 py-2 ${m.tipo === 'projetado' ? 'italic' : ''}`}>
                  {m.custoTotal == null ? '—' : fmtMoeda(m.custoTotal)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Back Office fica fixo no último valor real conhecido: o plano da área Comercial é manter
        esse time sem crescer junto com o quadro de vendas.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-5 py-4 flex items-center gap-2">
            <Users size={16} className="text-primary" />
            <div>
              <h2 className="text-sm font-semibold">Quadro geral da empresa (hoje)</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Todos os departamentos, ao vivo (Convenia) — só referência, fica fora do cálculo de custo</p>
            </div>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground uppercase tracking-wider border-b border-border text-[11px] sticky top-0 bg-card">
                  <th className="font-semibold px-5 py-2">Departamento</th>
                  <th className="font-semibold text-right px-5 py-2">Headcount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {quadroGeral.map((s) => (
                  <tr key={s.departamento} className="hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-2">{s.departamento}</td>
                    <td className="text-right tabular-nums px-5 py-2">{s.headcount}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold border-t border-border">
                  <td className="px-5 py-2">Total</td>
                  <td className="text-right tabular-nums px-5 py-2">{totalQuadroGeral}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-border p-5">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive size={16} className="text-primary" />
            <h2 className="text-sm font-semibold">Ativos de TI (referência contábil)</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Valor agregado de "Computadores e Periféricos" no imobilizado da DRE
            {ativosTI.competencia && ` (competência ${mesLabel(ativosTI.competencia)}/${ativosTI.competencia.slice(0, 4)})`}.
            Não é um inventário por equipamento/pessoa — o GLPI hoje só cobre chamados, não ativos.
          </p>
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Custo de aquisição</span>
              <span className="text-sm font-semibold tabular-nums">{fmtMoeda(ativosTI.custoAquisicao)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Depreciação acumulada</span>
              <span className="text-sm font-semibold tabular-nums text-destructive">{fmtMoeda(ativosTI.depreciacaoAcumulada)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-medium">Valor líquido contábil</span>
              <span className="text-base font-bold tabular-nums">{fmtMoeda(ativosTI.valorLiquido)}</span>
            </div>
          </div>
        </div>
      </div>

      {modalAberto && (
        <PremissasModal
          premissas={premissas}
          onClose={() => setModalAberto(false)}
          onSalvo={() => { setReloading(true); carregar(); }}
        />
      )}
      {historicoModalAberto && (
        <HistoricoModal
          onClose={() => setHistoricoModalAberto(false)}
          onSalvo={() => { setReloading(true); carregar(); }}
        />
      )}
    </div>
  );
}
