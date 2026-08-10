'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, AlertCircle, MapPin, Plus, Trash2, X, Search } from 'lucide-react';
import type { CidadeFoco, CidadeAdmin } from '@/lib/cidades-foco';

const CATEGORIAS_CONHECIDAS = ['FOCO', 'SUL', 'SP CAPITAL', 'SP ESTADO', 'RJ/MG/ES', 'NO/NE/CO', 'REATIVAÇÃO', 'BRASIL + 500', 'BRASIL 1º CICLO'];

function AdicionarCidadeModal({
  cidadesExistentes, onClose, onSaved,
}: {
  cidadesExistentes: CidadeFoco[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<CidadeAdmin[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [selecionada, setSelecionada] = useState<CidadeAdmin | null>(null);
  const [categoria, setCategoria] = useState('FOCO');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (busca.trim().length < 2) {
      setResultados([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await axios.get('/api/config/cidades-foco/buscar', { params: { q: busca.trim() } });
        setResultados(res.data as CidadeAdmin[]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  async function salvar() {
    if (!selecionada) return;
    setSaving(true);
    setError(null);
    try {
      await axios.post('/api/config/cidades-foco', { ...selecionada, categoria: categoria.trim() || 'FOCO' });
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
          <h3 className="font-semibold">Adicionar cidade foco</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cidade</label>
            {selecionada ? (
              <div className="mt-1 flex items-center justify-between px-3 py-2 border border-border rounded-lg bg-muted/40">
                <span className="text-sm font-medium">{selecionada.nomeCidade} · {selecionada.siglaUf}</span>
                <button onClick={() => { setSelecionada(null); setBusca(''); }} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative mt-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Digite o nome da cidade…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {busca.trim().length >= 2 && (
                  <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                    {buscando ? (
                      <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
                        <Loader2 size={13} className="animate-spin" /> Buscando…
                      </div>
                    ) : resultados.length === 0 ? (
                      <p className="px-3 py-2.5 text-sm text-muted-foreground">Nenhuma cidade encontrada.</p>
                    ) : (
                      resultados.map((c) => (
                        <button
                          key={c.idCidade}
                          type="button"
                          onClick={() => setSelecionada(c)}
                          className="flex w-full items-center px-3 py-2.5 text-sm text-left hover:bg-muted transition-colors"
                        >
                          {c.nomeCidade} · {c.siglaUf}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Categoria</label>
            <input
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="FOCO"
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {CATEGORIAS_CONHECIDAS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoria(c)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${categoria === c ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
                >
                  {c}
                </button>
              ))}
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
            disabled={saving || !selecionada}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmRemoverModal({
  cidade, onClose, onConfirm,
}: { cidade: CidadeFoco; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [removing, setRemoving] = useState(false);

  async function confirmar() {
    setRemoving(true);
    await onConfirm();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-lg shadow-lg w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold">Remover cidade foco?</h3>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{cidade.nomeCidade} · {cidade.siglaUf}</strong> deixará de ser considerada foco na categoria <strong className="text-foreground">{cidade.categoria}</strong>.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={removing}
            className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            {removing && <Loader2 size={14} className="animate-spin" />} Remover
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CidadesFocoPage() {
  const [cidades, setCidades] = useState<CidadeFoco[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [cidadeRemover, setCidadeRemover] = useState<CidadeFoco | null>(null);

  const carregar = useCallback(async () => {
    setError(null);
    try {
      const res = await axios.get('/api/config/cidades-foco');
      setCidades(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function remover() {
    if (!cidadeRemover) return;
    await axios.delete(`/api/config/cidades-foco/${cidadeRemover.id}`);
    setCidadeRemover(null);
    carregar();
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando cidades foco…</p>
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

      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cidades Foco</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configurações · Comercial · Cidades Foco — usada pela classificação &quot;Tipo Base&quot; da Base diária de Fila de Leads
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setReloading(true); carregar(); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
          <button onClick={() => setModalAberto(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus size={14} /> Adicionar cidade
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <MapPin size={15} className="text-primary" /> Cidades marcadas como foco
          </h2>
          <span className="text-xs text-muted-foreground">{cidades.length} vínculo(s) · {new Set(cidades.map((c) => c.idCidade)).size} cidade(s)</span>
        </div>

        {cidades.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhuma cidade foco cadastrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="px-5 py-3 font-semibold">Cidade</th>
                  <th className="px-4 py-3 font-semibold">UF</th>
                  <th className="px-4 py-3 font-semibold">Categoria</th>
                  <th className="px-5 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cidades.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-medium">{c.nomeCidade}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.siglaUf}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary whitespace-nowrap">{c.categoria}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => setCidadeRemover(c)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                          title="Remover"
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

      {modalAberto && (
        <AdicionarCidadeModal cidadesExistentes={cidades} onClose={() => setModalAberto(false)} onSaved={carregar} />
      )}
      {cidadeRemover && (
        <ConfirmRemoverModal cidade={cidadeRemover} onClose={() => setCidadeRemover(null)} onConfirm={remover} />
      )}
    </div>
  );
}
