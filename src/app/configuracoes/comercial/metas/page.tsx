'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, AlertCircle, Target, Plus, Pencil, Trash2, X, LayoutGrid, Home, Car } from 'lucide-react';
import type { MetaSquad, SquadAdmin, Segmento } from '@/lib/metas';
import { Select } from '@/components/ui/Select';
import { SegmentTabs } from '@/components/ui/SegmentTabs';

type Aba = 'todos' | Segmento;

const SEGMENTO_TABS = [
  { value: 'todos' as const, label: 'Geral', icon: LayoutGrid },
  { value: 'imoveis' as const, label: 'Imóveis', icon: Home },
  { value: 'veiculos' as const, label: 'Veículos', icon: Car },
];

function fmtMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtNum(v: number): string {
  return v.toLocaleString('pt-BR');
}

function SegmentoBadge({ segmento }: { segmento: Segmento }) {
  if (segmento === 'imoveis') {
    return <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">Imóveis</span>;
  }
  return <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-warning-bg text-warning">Veículos</span>;
}

function MetaModal({
  meta, squads, metasExistentes, onClose, onSaved,
}: {
  meta: MetaSquad | null;
  squads: SquadAdmin[];
  metasExistentes: MetaSquad[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = meta !== null;
  const [squadId, setSquadId] = useState<string>('');
  const [metaEstoqueDia, setMetaEstoqueDia] = useState<string>(meta ? String(meta.metaEstoqueDia) : '');
  const [metaFinanceiraDia, setMetaFinanceiraDia] = useState<string>(meta ? String(meta.metaFinanceiraDia) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const squadsDisponiveis = useMemo(() => {
    const usados = new Set(metasExistentes.map((m) => m.squadId));
    return squads.filter((s) => !usados.has(s.id));
  }, [squads, metasExistentes]);

  async function salvar() {
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await axios.put(`/api/config/metas/${meta!.id}`, {
          metaEstoqueDia: Number(metaEstoqueDia) || 0,
          metaFinanceiraDia: Number(metaFinanceiraDia) || 0,
        });
      } else {
        const squad = squads.find((s) => String(s.id) === squadId);
        if (!squad) {
          setError('Selecione um squad.');
          setSaving(false);
          return;
        }
        await axios.post('/api/config/metas', {
          squadId: squad.id,
          squadNome: squad.nome,
          segmento: squad.segmento,
          metaEstoqueDia: Number(metaEstoqueDia) || 0,
          metaFinanceiraDia: Number(metaFinanceiraDia) || 0,
        });
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
      <div className="bg-card rounded-lg shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-semibold">{isEdit ? 'Editar meta' : 'Nova meta'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Squad</label>
            {isEdit ? (
              <p className="mt-1 text-sm font-medium">{meta!.squadNome}</p>
            ) : (
              <Select
                value={squadId}
                onChange={setSquadId}
                className="w-full mt-1"
                placeholder="Selecione um squad…"
                options={squadsDisponiveis.map((s) => ({
                  value: String(s.id),
                  label: `${s.nome} · ${s.segmento === 'imoveis' ? 'Imóveis' : 'Veículos'}`,
                }))}
              />
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Meta estoque / dia</label>
            <input
              type="number"
              value={metaEstoqueDia}
              onChange={(e) => setMetaEstoqueDia(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Meta financeira / dia (R$)</label>
            <input
              type="number"
              step="0.01"
              value={metaFinanceiraDia}
              onChange={(e) => setMetaFinanceiraDia(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={saving || (!isEdit && !squadId)}
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
  meta, onClose, onConfirm,
}: { meta: MetaSquad; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);

  async function confirmar() {
    setDeleting(true);
    await onConfirm();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-lg shadow-lg w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold">Excluir meta?</h3>
        <p className="text-sm text-muted-foreground">
          Isso vai remover a meta cadastrada para <strong className="text-foreground">{meta.squadNome}</strong>. Essa ação não pode ser desfeita.
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

export default function MetasPage() {
  const [metas, setMetas] = useState<MetaSquad[]>([]);
  const [squads, setSquads] = useState<SquadAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('todos');
  const [modalAberto, setModalAberto] = useState<'novo' | 'editar' | null>(null);
  const [metaEditando, setMetaEditando] = useState<MetaSquad | null>(null);
  const [metaExcluir, setMetaExcluir] = useState<MetaSquad | null>(null);

  const carregar = useCallback(async () => {
    setError(null);
    try {
      const [metasRes, squadsRes] = await Promise.all([
        axios.get('/api/config/metas'),
        axios.get('/api/config/metas/squads'),
      ]);
      setMetas(metasRes.data);
      setSquads(squadsRes.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const metasFiltradas = useMemo(() => {
    if (aba === 'todos') return metas;
    return metas.filter((m) => m.segmento === aba);
  }, [metas, aba]);

  async function excluir() {
    if (!metaExcluir) return;
    await axios.delete(`/api/config/metas/${metaExcluir.id}`);
    setMetaExcluir(null);
    carregar();
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando metas…</p>
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
          <h1 className="text-2xl font-semibold tracking-tight">Metas por Squad</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configurações · Comercial · Metas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentTabs value={aba} onChange={setAba} options={SEGMENTO_TABS} />
          <button onClick={() => { setReloading(true); carregar(); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
          <button onClick={() => setModalAberto('novo')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus size={14} /> Nova meta
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Target size={15} className="text-primary" /> Metas cadastradas
          </h2>
          <span className="text-xs text-muted-foreground">{metasFiltradas.length} squad(s)</span>
        </div>

        {metasFiltradas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhuma meta cadastrada para este filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="px-5 py-3 font-semibold">Squad</th>
                  <th className="px-4 py-3 font-semibold text-right">Meta estoque dia</th>
                  <th className="px-4 py-3 font-semibold text-right">Meta estoque mês</th>
                  <th className="px-4 py-3 font-semibold text-right">Meta financeira dia</th>
                  <th className="px-4 py-3 font-semibold text-right">Meta financeira semana</th>
                  <th className="px-4 py-3 font-semibold text-right">Meta financeira mês</th>
                  <th className="px-5 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {metasFiltradas.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium">{m.squadNome}</div>
                      <div className="mt-0.5"><SegmentoBadge segmento={m.segmento} /></div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs">{fmtNum(m.metaEstoqueDia)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmtNum(m.metaEstoqueMes)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-xs">{fmtMoeda(m.metaFinanceiraDia)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmtMoeda(m.metaFinanceiraSemana)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">{fmtMoeda(m.metaFinanceiraMes)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setMetaEditando(m); setModalAberto('editar'); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setMetaExcluir(m)}
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

      {modalAberto === 'novo' && (
        <MetaModal meta={null} squads={squads} metasExistentes={metas} onClose={() => setModalAberto(null)} onSaved={carregar} />
      )}
      {modalAberto === 'editar' && metaEditando && (
        <MetaModal meta={metaEditando} squads={squads} metasExistentes={metas} onClose={() => { setModalAberto(null); setMetaEditando(null); }} onSaved={carregar} />
      )}
      {metaExcluir && (
        <ConfirmDeleteModal meta={metaExcluir} onClose={() => setMetaExcluir(null)} onConfirm={excluir} />
      )}
    </div>
  );
}
