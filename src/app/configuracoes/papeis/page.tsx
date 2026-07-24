'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, AlertCircle, ShieldCheck, Save, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { menus, flattenNavLinks } from '@/lib/nav-menu';

const catalogo = flattenNavLinks(menus);
const grupos = Array.from(new Set(catalogo.map((c) => c.grupo)));

type Role = { id: number; name: string; isAdmin: boolean; screens: string[] };

export default function PapeisPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null);
  const [name, setName] = useState('');
  const [screens, setScreens] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const catalogoHrefs = useMemo(() => new Set(catalogo.map((c) => c.href)), []);
  const selectedRole = useMemo(() => roles.find((r) => r.id === selectedId), [roles, selectedId]);

  const carregar = useCallback(async () => {
    setError(null);
    try {
      const { data } = await axios.get('/api/config/papeis');
      setRoles(data.roles ?? []);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function selecionar(role: Role) {
    setSelectedId(role.id);
    setName(role.name);
    setScreens(role.screens.filter((s) => catalogoHrefs.has(s)));
    setSalvo(false);
    setError(null);
  }

  function novoPapel() {
    setSelectedId('new');
    setName('');
    setScreens([]);
    setSalvo(false);
    setError(null);
  }

  function toggle(href: string) {
    setSalvo(false);
    setScreens((prev) => (prev.includes(href) ? prev.filter((r) => r !== href) : [...prev, href]));
  }

  async function salvar() {
    if (!name.trim()) {
      setError('Informe um nome para o papel.');
      return;
    }
    setSaving(true);
    setError(null);
    setSalvo(false);
    try {
      if (selectedId === 'new') {
        const { data } = await axios.post('/api/config/papeis', { name, screens });
        await carregar();
        setSelectedId(data.role.id);
      } else if (selectedId) {
        await axios.put(`/api/config/papeis/${selectedId}`, { name, screens });
        await carregar();
      }
      setSalvo(true);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remover(role: Role) {
    if (!confirm(`Remover o papel "${role.name}"?`)) return;
    setError(null);
    try {
      await axios.delete(`/api/config/papeis/${role.id}`);
      if (selectedId === role.id) novoPapel();
      await carregar();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando papéis…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Papéis</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configurações · Acesso · Papéis</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setLoading(true); carregar(); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
          <button onClick={novoPapel}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors">
            <Plus size={14} /> Novo papel
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {salvo && !error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-success-bg text-success text-sm">
          <CheckCircle2 size={16} /> Alterações salvas.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        <div className="rounded-lg border border-border divide-y divide-border">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => selecionar(role)}
              className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm hover:bg-muted transition-colors ${selectedId === role.id ? 'bg-muted font-medium' : ''}`}
            >
              <span className="flex items-center gap-2">
                {role.isAdmin && <ShieldCheck size={14} className="text-primary" />}
                {role.name}
              </span>
              <span className="text-xs text-muted-foreground">{role.isAdmin ? 'total' : `${role.screens.length} telas`}</span>
            </button>
          ))}
          {roles.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum papel cadastrado ainda.</p>
          )}
        </div>

        <div className="rounded-lg border border-border p-5 space-y-5">
          {selectedId === null ? (
            <p className="text-sm text-muted-foreground">Selecione um papel na lista ou crie um novo.</p>
          ) : (
            <>
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="text-sm font-medium">Nome do papel</label>
                  <input
                    value={name}
                    onChange={(e) => { setName(e.target.value); setSalvo(false); }}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <button onClick={salvar} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
                </button>
                {selectedRole && !selectedRole.isAdmin && (
                  <button onClick={() => remover(selectedRole)}
                    className="flex items-center gap-2 px-3 py-2 border border-destructive/40 text-destructive rounded-lg text-sm font-medium hover:bg-destructive/10 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {selectedRole?.isAdmin ? (
                <p className="text-sm text-muted-foreground">
                  Papéis marcados como <strong>Admin</strong> têm acesso total automaticamente — as telas abaixo não
                  são consultadas para eles.
                </p>
              ) : null}

              <div className="divide-y divide-border">
                {grupos.map((grupo) => (
                  <div key={grupo} className="py-3">
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{grupo}</div>
                    <div className="flex flex-col gap-2">
                      {catalogo.filter((c) => c.grupo === grupo).map((c) => (
                        <label key={c.href} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={screens.includes(c.href)}
                            onChange={() => toggle(c.href)}
                            className="h-4 w-4 rounded border-border accent-primary"
                          />
                          <span className="font-medium">{c.label}</span>
                          <span className="text-xs text-muted-foreground">{c.href}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
