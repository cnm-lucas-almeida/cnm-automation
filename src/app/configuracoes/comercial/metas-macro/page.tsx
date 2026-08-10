'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, AlertCircle, Save, LayoutGrid, Home, Car } from 'lucide-react';
import type { MetaMacro } from '@/lib/metas-macro';
import type { Segmento } from '@/lib/metas';
import { SegmentTabs } from '@/components/ui/SegmentTabs';

type Aba = Segmento;

const SEGMENTO_TABS = [
  { value: 'imoveis' as const, label: 'Imóveis', icon: Home },
  { value: 'veiculos' as const, label: 'Veículos', icon: Car },
];

const CAMPOS: { chave: keyof FormState; label: string; secao: string }[] = [
  { chave: 'metaEstoqueTotal', label: 'Meta estoque total (mês)', secao: 'Metas do mês' },
  { chave: 'metaFinanceiraTotal', label: 'Meta financeira total (mês) — R$', secao: 'Metas do mês' },
  { chave: 'metaPvTotal', label: 'Meta PV total (mês)', secao: 'Metas do mês' },
  { chave: 'faturamentoTotal', label: 'Faturamento total — R$', secao: 'Realizado macro' },
  { chave: 'clientesAtivos', label: 'Clientes ativos', secao: 'Realizado macro' },
  { chave: 'estoqueUsados', label: 'Estoque usados', secao: 'Estoque (Usados)' },
  { chave: 'acrescimoUsados', label: 'Acréscimo usados', secao: 'Estoque (Usados)' },
  { chave: 'estoqueCarregadoMes', label: 'Estoque carregado no mês', secao: 'Estoque (Usados)' },
  { chave: 'estoqueACarregar', label: 'Estoque a carregar', secao: 'Estoque (Usados)' },
  { chave: 'estoqueSaiu', label: 'Estoque saiu', secao: 'Estoque (Usados)' },
  { chave: 'fichaLancamento', label: 'Ficha de lançamento', secao: 'Lançamentos' },
  { chave: 'vendidas', label: 'Vendidas', secao: 'Lançamentos' },
  { chave: 'acrescimoLancamentos', label: 'Acréscimo de lançamentos', secao: 'Lançamentos' },
  { chave: 'cancelamentosPv', label: 'Cancelamentos total (PV)', secao: 'Cancelamentos' },
  { chave: 'cancelamentosValor', label: 'Cancelamentos total — R$', secao: 'Cancelamentos' },
  { chave: 'headcountIdeal', label: 'Headcount ideal', secao: 'Headcount' },
];

type FormState = {
  metaEstoqueTotal: string; metaFinanceiraTotal: string; metaPvTotal: string;
  faturamentoTotal: string; clientesAtivos: string;
  estoqueUsados: string; acrescimoUsados: string; estoqueCarregadoMes: string; estoqueACarregar: string; estoqueSaiu: string;
  fichaLancamento: string; vendidas: string; acrescimoLancamentos: string;
  cancelamentosPv: string; cancelamentosValor: string;
  headcountIdeal: string;
};

const FORM_VAZIO: FormState = {
  metaEstoqueTotal: '', metaFinanceiraTotal: '', metaPvTotal: '',
  faturamentoTotal: '', clientesAtivos: '',
  estoqueUsados: '', acrescimoUsados: '', estoqueCarregadoMes: '', estoqueACarregar: '', estoqueSaiu: '',
  fichaLancamento: '', vendidas: '', acrescimoLancamentos: '',
  cancelamentosPv: '', cancelamentosValor: '',
  headcountIdeal: '',
};

function mesAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

function metaMacroParaForm(m: MetaMacro): FormState {
  return {
    metaEstoqueTotal: String(m.metaEstoqueTotal), metaFinanceiraTotal: String(m.metaFinanceiraTotal), metaPvTotal: String(m.metaPvTotal),
    faturamentoTotal: String(m.faturamentoTotal), clientesAtivos: String(m.clientesAtivos),
    estoqueUsados: String(m.estoqueUsados), acrescimoUsados: String(m.acrescimoUsados),
    estoqueCarregadoMes: String(m.estoqueCarregadoMes), estoqueACarregar: String(m.estoqueACarregar), estoqueSaiu: String(m.estoqueSaiu),
    fichaLancamento: String(m.fichaLancamento), vendidas: String(m.vendidas), acrescimoLancamentos: String(m.acrescimoLancamentos),
    cancelamentosPv: String(m.cancelamentosPv), cancelamentosValor: String(m.cancelamentosValor),
    headcountIdeal: String(m.headcountIdeal),
  };
}

export default function MetasMacroPage() {
  const [segmento, setSegmento] = useState<Aba>('imoveis');
  const [mes, setMes] = useState(mesAtual());
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSalvo(false);
    try {
      const { data } = await axios.get<MetaMacro | null>('/api/config/metas-macro', { params: { segmento, mes } });
      setForm(data ? metaMacroParaForm(data) : FORM_VAZIO);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [segmento, mes]);

  useEffect(() => { carregar(); }, [carregar]);

  function setCampo(chave: keyof FormState, valor: string) {
    setSalvo(false);
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  async function salvar() {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { segmento, mesReferencia: `${mes}-01` };
      for (const campo of CAMPOS) payload[campo.chave] = Number(form[campo.chave]) || 0;
      await axios.post('/api/config/metas-macro', payload);
      setSalvo(true);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  const secoes = Array.from(new Set(CAMPOS.map((c) => c.secao)));

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Metas Macro</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configurações · Comercial · Metas Macro — números sem fonte automatizada, preenchidos à mão todo mês.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <SegmentTabs value={segmento} onChange={setSegmento} options={SEGMENTO_TABS} />
          <button onClick={carregar}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh] gap-3 text-muted-foreground">
          <Loader2 size={28} className="animate-spin text-primary" />
          <p className="text-sm font-medium">Carregando…</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {secoes.map((secao) => (
            <div key={secao} className="p-5">
              <h2 className="text-sm font-semibold mb-3">{secao}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {CAMPOS.filter((c) => c.secao === secao).map((campo) => (
                  <div key={campo.chave}>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{campo.label}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form[campo.chave]}
                      onChange={(e) => setCampo(campo.chave, e.target.value)}
                      className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="p-5 flex items-center justify-end gap-3">
            {error && (
              <span className="flex items-center gap-1.5 text-sm text-destructive"><AlertCircle size={14} /> {error}</span>
            )}
            {salvo && !error && <span className="text-sm text-success">Salvo.</span>}
            <button
              onClick={salvar}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar mês
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
