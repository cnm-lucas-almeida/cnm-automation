'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, Zap, Plus, Pencil, Trash2, X,
  LayoutGrid, CheckCircle2, Rocket, PauseCircle, Wallet, Clock, Users,
  ListChecks, BarChart3, TrendingUp,
} from 'lucide-react';
import type { Automacao, StatusAutomacao, SalvarAutomacaoInput } from '@/lib/automacoes';
import { Select } from '@/components/ui/Select';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { CreatableSelect } from '@/components/ui/CreatableSelect';

type Aba = 'todos' | StatusAutomacao;
type Visao = 'iniciativas' | 'analise';

const ABA_TABS = [
  { value: 'todos' as const, label: 'Todas', icon: LayoutGrid },
  { value: 'ativo' as const, label: 'Ativas', icon: CheckCircle2 },
  { value: 'planejado' as const, label: 'Planejadas', icon: Rocket },
  { value: 'pausado' as const, label: 'Pausadas', icon: PauseCircle },
];

const VISAO_TABS = [
  { value: 'iniciativas' as const, label: 'Iniciativas', icon: ListChecks },
  { value: 'analise' as const, label: 'Análise por Setor', icon: BarChart3 },
];

const STATUS_OPTIONS = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'planejado', label: 'Planejado' },
  { value: 'pausado', label: 'Pausado' },
];

// Usado para converter "horas/dia" em "horas/mês" quando a iniciativa é cadastrada por dia.
const DIAS_UTEIS_MES = 20;

function fmtMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtNum(v: number, casas = 0): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function StatusBadge({ status }: { status: StatusAutomacao }) {
  const map: Record<StatusAutomacao, { label: string; className: string }> = {
    ativo: { label: 'Ativo', className: 'bg-success-bg text-success' },
    planejado: { label: 'Planejado', className: 'bg-primary/10 text-primary' },
    pausado: { label: 'Pausado', className: 'bg-warning-bg text-warning' },
  };
  const cfg = map[status];
  return (
    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-start gap-3">
      <div className="p-2 rounded-lg bg-primary/10 text-primary">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-lg font-semibold tabular-nums truncate">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

const emptyForm = (): SalvarAutomacaoInput => ({
  iniciativa: '',
  descricao: null,
  setor: '',
  sistema: '',
  salarioImpostos: 0,
  horasMes: 200,
  horasManualMes: 0,
  horasManualDia: null,
  colaboradores: 1,
  status: 'ativo',
  responsavel: null,
});

function AutomacaoModal({
  automacao, setores, onClose, onSaved,
}: {
  automacao: Automacao | null;
  setores: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = automacao !== null;
  const [form, setForm] = useState<SalvarAutomacaoInput>(
    automacao
      ? {
          iniciativa: automacao.iniciativa,
          descricao: automacao.descricao,
          setor: automacao.setor,
          sistema: automacao.sistema,
          salarioImpostos: automacao.salarioImpostos,
          horasMes: automacao.horasMes,
          horasManualMes: automacao.horasManualMes,
          horasManualDia: automacao.horasManualDia,
          colaboradores: automacao.colaboradores,
          status: automacao.status,
          responsavel: automacao.responsavel,
        }
      : emptyForm()
  );
  const [modoHoras, setModoHoras] = useState<'mes' | 'dia'>(automacao?.horasManualDia != null ? 'dia' : 'mes');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    const custoHora = form.horasMes > 0 ? form.salarioImpostos / form.horasMes : 0;
    const ganhoPorPessoa = custoHora * form.horasManualMes;
    const ganhoTotalMensal = ganhoPorPessoa * form.colaboradores;
    return { custoHora, ganhoPorPessoa, ganhoTotalMensal, ganhoTotalAnual: ganhoTotalMensal * 12 };
  }, [form]);

  function set<K extends keyof SalvarAutomacaoInput>(key: K, value: SalvarAutomacaoInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function alternarModoHoras(novoModo: 'mes' | 'dia') {
    if (novoModo === modoHoras) return;
    if (novoModo === 'dia') {
      const dia = form.horasManualMes > 0 ? Math.round((form.horasManualMes / DIAS_UTEIS_MES) * 100) / 100 : 0;
      setForm((f) => ({ ...f, horasManualDia: dia, horasManualMes: dia * DIAS_UTEIS_MES }));
    } else {
      setForm((f) => ({ ...f, horasManualDia: null }));
    }
    setModoHoras(novoModo);
  }

  function setHorasManualDia(dia: number) {
    setForm((f) => ({ ...f, horasManualDia: dia, horasManualMes: dia * DIAS_UTEIS_MES }));
  }

  async function salvar() {
    if (!form.iniciativa || !form.setor || !form.sistema) {
      setError('Iniciativa, setor e sistema são obrigatórios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await axios.put(`/api/config/automacoes/${automacao!.id}`, form);
      } else {
        await axios.post('/api/config/automacoes', form);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-lg shadow-lg w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-semibold">{isEdit ? 'Editar iniciativa' : 'Nova iniciativa'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Iniciativa</label>
            <input
              type="text"
              value={form.iniciativa}
              onChange={(e) => set('iniciativa', e.target.value)}
              placeholder="Ex: Envio de Holerites"
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Setor</label>
              <CreatableSelect
                value={form.setor}
                onChange={(v) => set('setor', v)}
                options={setores}
                placeholder="Selecione ou crie um setor…"
                className="w-full mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
              <Select
                value={form.status}
                onChange={(v) => set('status', v as StatusAutomacao)}
                className="w-full mt-1"
                options={STATUS_OPTIONS}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Descrição</label>
            <textarea
              value={form.descricao ?? ''}
              onChange={(e) => set('descricao', e.target.value || null)}
              placeholder="O que essa automação faz, o problema que resolve…"
              rows={2}
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sistema(s)</label>
              <input
                type="text"
                value={form.sistema}
                onChange={(e) => set('sistema', e.target.value)}
                placeholder="Ex: Convenia + Docusign"
                className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Responsável</label>
              <input
                type="text"
                value={form.responsavel ?? ''}
                onChange={(e) => set('responsavel', e.target.value || null)}
                placeholder="Opcional"
                className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Salário + impostos</label>
              <CurrencyInput
                value={form.salarioImpostos}
                onChange={(v) => set('salarioImpostos', v)}
                className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Horas / mês</label>
              <input
                type="number"
                value={form.horasMes}
                onChange={(e) => set('horasMes', Number(e.target.value) || 0)}
                className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hr trabalho manual</label>
                <div className="flex items-center rounded-md border border-border overflow-hidden text-[11px] flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => alternarModoHoras('mes')}
                    className={`px-2 py-0.5 font-medium transition-colors ${modoHoras === 'mes' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                  >
                    Mês
                  </button>
                  <button
                    type="button"
                    onClick={() => alternarModoHoras('dia')}
                    className={`px-2 py-0.5 font-medium transition-colors ${modoHoras === 'dia' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                  >
                    Dia
                  </button>
                </div>
              </div>
              {modoHoras === 'dia' ? (
                <>
                  <input
                    type="number"
                    step="0.5"
                    value={form.horasManualDia ?? ''}
                    onChange={(e) => setHorasManualDia(Number(e.target.value) || 0)}
                    placeholder="Ex: 2"
                    className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">= {fmtNum(form.horasManualMes, 1)} h/mês ({DIAS_UTEIS_MES} dias úteis)</p>
                </>
              ) : (
                <input
                  type="number"
                  step="0.5"
                  value={form.horasManualMes}
                  onChange={(e) => set('horasManualMes', Number(e.target.value) || 0)}
                  className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                />
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Colaboradores</label>
              <input
                type="number"
                value={form.colaboradores}
                onChange={(e) => set('colaboradores', Number(e.target.value) || 0)}
                className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 border border-border p-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Custo/hora</p>
              <p className="font-semibold tabular-nums">{fmtMoeda(preview.custoHora)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Ganho / pessoa</p>
              <p className="font-semibold tabular-nums">{fmtMoeda(preview.ganhoPorPessoa)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Ganho total mensal</p>
              <p className="font-semibold tabular-nums text-primary">{fmtMoeda(preview.ganhoTotalMensal)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Ganho total anual</p>
              <p className="font-semibold tabular-nums text-primary">{fmtMoeda(preview.ganhoTotalAnual)}</p>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({
  automacao, onClose, onConfirm,
}: { automacao: Automacao; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);

  async function confirmar() {
    setDeleting(true);
    await onConfirm();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-lg shadow-lg w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold">Excluir iniciativa?</h3>
        <p className="text-sm text-muted-foreground">
          Isso vai remover <strong className="text-foreground">{automacao.iniciativa}</strong> do controle de automações. Essa ação não pode ser desfeita.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            {deleting && <Loader2 size={14} className="animate-spin" />} Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AutomacoesPage() {
  const [automacoes, setAutomacoes] = useState<Automacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('todos');
  const [visao, setVisao] = useState<Visao>('iniciativas');
  const [modalAberto, setModalAberto] = useState<'novo' | 'editar' | null>(null);
  const [automacaoEditando, setAutomacaoEditando] = useState<Automacao | null>(null);
  const [automacaoExcluir, setAutomacaoExcluir] = useState<Automacao | null>(null);

  const carregar = useCallback(async () => {
    setError(null);
    try {
      const { data } = await axios.get('/api/config/automacoes');
      setAutomacoes(data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const automacoesFiltradas = useMemo(() => {
    if (aba === 'todos') return automacoes;
    return automacoes.filter((a) => a.status === aba);
  }, [automacoes, aba]);

  const setores = useMemo(
    () => Array.from(new Set(automacoes.map((a) => a.setor))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [automacoes]
  );

  const totais = useMemo(() => {
    const ativas = automacoes.filter((a) => a.status === 'ativo');
    return {
      qtdAtivas: ativas.length,
      ganhoMensal: ativas.reduce((s, a) => s + a.ganhoTotalMensal, 0),
      ganhoAnual: ativas.reduce((s, a) => s + a.ganhoTotalAnual, 0),
      horasMensal: ativas.reduce((s, a) => s + a.ganhoHorasMensal, 0),
    };
  }, [automacoes]);

  // Projeção: "ativo" é o ganho já realizado; "potencial" soma também o que está
  // "planejado" — ou seja, o que a área ganharia se tudo que já está no radar entrasse no ar.
  const somar = (lista: Automacao[], chave: 'ganhoTotalMensal' | 'ganhoTotalAnual' | 'colaboradores') =>
    lista.reduce((s, a) => s + a[chave], 0);

  const projecaoGeral = useMemo(() => {
    const ativas = automacoes.filter((a) => a.status === 'ativo');
    const potenciais = automacoes.filter((a) => a.status === 'ativo' || a.status === 'planejado');
    return {
      qtdPlanejadas: automacoes.filter((a) => a.status === 'planejado').length,
      ganhoMensalAtivo: somar(ativas, 'ganhoTotalMensal'),
      ganhoMensalPotencial: somar(potenciais, 'ganhoTotalMensal'),
      ganhoAnualAtivo: somar(ativas, 'ganhoTotalAnual'),
      ganhoAnualPotencial: somar(potenciais, 'ganhoTotalAnual'),
    };
  }, [automacoes]);

  const analisePorSetor = useMemo(() => {
    const bySetor = new Map<string, Automacao[]>();
    for (const a of automacoes) {
      if (!bySetor.has(a.setor)) bySetor.set(a.setor, []);
      bySetor.get(a.setor)!.push(a);
    }
    const linhas = Array.from(bySetor.entries()).map(([setor, itens]) => {
      const ativas = itens.filter((i) => i.status === 'ativo');
      const potenciais = itens.filter((i) => i.status === 'ativo' || i.status === 'planejado');
      const ganhoMensalAtivo = somar(ativas, 'ganhoTotalMensal');
      const ganhoMensalPotencial = somar(potenciais, 'ganhoTotalMensal');
      return {
        setor,
        qtdAtivas: ativas.length,
        qtdTotal: itens.length,
        colaboradoresAtivos: somar(ativas, 'colaboradores'),
        ganhoMensalAtivo,
        ganhoMensalPotencial,
        ganhoAnualAtivo: somar(ativas, 'ganhoTotalAnual'),
        ganhoAnualPotencial: somar(potenciais, 'ganhoTotalAnual'),
        pctCapturado: ganhoMensalPotencial > 0 ? (ganhoMensalAtivo / ganhoMensalPotencial) * 100 : 100,
      };
    });
    return linhas.sort((a, b) => b.ganhoMensalPotencial - a.ganhoMensalPotencial);
  }, [automacoes]);

  async function excluir() {
    if (!automacaoExcluir) return;
    await axios.delete(`/api/config/automacoes/${automacaoExcluir.id}`);
    setAutomacaoExcluir(null);
    carregar();
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando automações…</p>
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

  return (
    <div className={`space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Controle de Automações</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configurações · Automações</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentTabs value={visao} onChange={setVisao} options={VISAO_TABS} />
          {visao === 'iniciativas' && <SegmentTabs value={aba} onChange={setAba} options={ABA_TABS} />}
          <button onClick={() => { setReloading(true); carregar(); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
          <button onClick={() => setModalAberto('novo')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus size={14} /> Nova iniciativa
          </button>
        </div>
      </div>

      {visao === 'iniciativas' && (
        <>
          {/* Cards de totais (apenas iniciativas ativas) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Zap} label="Iniciativas ativas" value={fmtNum(totais.qtdAtivas)} />
            <StatCard icon={Wallet} label="Ganho mensal" value={fmtMoeda(totais.ganhoMensal)} hint="Somando iniciativas ativas" />
            <StatCard icon={Wallet} label="Ganho anual" value={fmtMoeda(totais.ganhoAnual)} />
            <StatCard icon={Clock} label="Horas economizadas / mês" value={fmtNum(totais.horasMensal, 1)} />
          </div>

          {/* Tabela */}
          <div className="rounded-lg border border-border">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Zap size={15} className="text-primary" /> Iniciativas cadastradas
              </h2>
              <span className="text-xs text-muted-foreground">{automacoesFiltradas.length} iniciativa(s)</span>
            </div>

            {automacoesFiltradas.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhuma iniciativa cadastrada para este filtro.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="px-5 py-3 font-semibold">Iniciativa</th>
                      <th className="px-4 py-3 font-semibold">Sistema(s)</th>
                      <th className="px-4 py-3 font-semibold text-right">Custo/hora</th>
                      <th className="px-4 py-3 font-semibold text-right">Hr manual/mês</th>
                      <th className="px-4 py-3 font-semibold text-right">Colaboradores</th>
                      <th className="px-4 py-3 font-semibold text-right">Ganho total mensal</th>
                      <th className="px-4 py-3 font-semibold text-right">Ganho horas mensal</th>
                      <th className="px-4 py-3 font-semibold text-right">Ganho total anual</th>
                      <th className="px-4 py-3 font-semibold text-right">Ganho horas anual</th>
                      <th className="px-5 py-3 font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {automacoesFiltradas.map((a) => (
                      <tr key={a.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-medium">{a.iniciativa}</div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-[11px] text-muted-foreground">{a.setor}</span>
                            <StatusBadge status={a.status} />
                          </div>
                          {a.responsavel && <div className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1"><Users size={10} /> {a.responsavel}</div>}
                          {a.descricao && <div className="mt-0.5 text-[11px] text-muted-foreground max-w-xs truncate" title={a.descricao}>{a.descricao}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{a.sistema}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">{fmtMoeda(a.custoHora)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">
                          {fmtNum(a.horasManualMes, 1)}
                          {a.horasManualDia != null && (
                            <div className="text-[10px] text-muted-foreground font-normal">{fmtNum(a.horasManualDia, 1)}h/dia</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">{fmtNum(a.colaboradores)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs">{fmtMoeda(a.ganhoTotalMensal)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmtNum(a.ganhoHorasMensal, 1)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs">{fmtMoeda(a.ganhoTotalAnual)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmtNum(a.ganhoHorasAnual, 1)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => { setAutomacaoEditando(a); setModalAberto('editar'); }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              title="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setAutomacaoExcluir(a)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {visao === 'analise' && (
        <>
          {/* Cards de projeção: ganho já realizado (ativo) vs. potencial (ativo + planejado) */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard icon={Wallet} label="Ganho mensal (ativo)" value={fmtMoeda(projecaoGeral.ganhoMensalAtivo)} />
            <StatCard icon={TrendingUp} label="Ganho mensal potencial" value={fmtMoeda(projecaoGeral.ganhoMensalPotencial)} hint="Ativo + planejado" />
            <StatCard icon={Wallet} label="Ganho anual estimado" value={fmtMoeda(projecaoGeral.ganhoAnualPotencial)} hint="Ativo + planejado" />
            <StatCard icon={TrendingUp} label="A capturar / mês" value={fmtMoeda(projecaoGeral.ganhoMensalPotencial - projecaoGeral.ganhoMensalAtivo)} hint="Diferença entre potencial e realizado" />
            <StatCard icon={Rocket} label="Iniciativas planejadas" value={fmtNum(projecaoGeral.qtdPlanejadas)} />
          </div>

          {/* Tabela agrupada por setor */}
          <div className="rounded-lg border border-border">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 size={15} className="text-primary" /> Ganho por setor
              </h2>
              <span className="text-xs text-muted-foreground">{analisePorSetor.length} setor(es)</span>
            </div>

            {analisePorSetor.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhuma iniciativa cadastrada ainda.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="px-5 py-3 font-semibold">Setor</th>
                      <th className="px-4 py-3 font-semibold text-right">Iniciativas</th>
                      <th className="px-4 py-3 font-semibold text-right">Colaboradores (ativo)</th>
                      <th className="px-4 py-3 font-semibold text-right">Ganho mensal (ativo)</th>
                      <th className="px-4 py-3 font-semibold text-right">Ganho mensal potencial</th>
                      <th className="px-4 py-3 font-semibold">% capturado</th>
                      <th className="px-4 py-3 font-semibold text-right">Ganho anual (ativo)</th>
                      <th className="px-5 py-3 font-semibold text-right">Ganho anual potencial</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {analisePorSetor.map((s) => (
                      <tr key={s.setor} className="hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-3 font-medium">{s.setor}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">{s.qtdAtivas} / {s.qtdTotal}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">{fmtNum(s.colaboradoresAtivos)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs">{fmtMoeda(s.ganhoMensalAtivo)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmtMoeda(s.ganhoMensalPotencial)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden flex-shrink-0">
                              <div className="h-full bg-primary" style={{ width: `${Math.min(100, s.pctCapturado)}%` }} />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground">{fmtNum(s.pctCapturado)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs">{fmtMoeda(s.ganhoAnualAtivo)}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmtMoeda(s.ganhoAnualPotencial)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {modalAberto === 'novo' && (
        <AutomacaoModal automacao={null} setores={setores} onClose={() => setModalAberto(null)} onSaved={carregar} />
      )}
      {modalAberto === 'editar' && automacaoEditando && (
        <AutomacaoModal automacao={automacaoEditando} setores={setores} onClose={() => { setModalAberto(null); setAutomacaoEditando(null); }} onSaved={carregar} />
      )}
      {automacaoExcluir && (
        <ConfirmDeleteModal automacao={automacaoExcluir} onClose={() => setAutomacaoExcluir(null)} onConfirm={excluir} />
      )}
    </div>
  );
}
