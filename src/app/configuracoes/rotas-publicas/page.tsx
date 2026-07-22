'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, AlertCircle, Globe, Save, CheckCircle2 } from 'lucide-react';
import { menus, flattenNavLinks } from '@/lib/nav-menu';

const catalogo = flattenNavLinks(menus);

export default function RotasPublicasPage() {
  const [routes, setRoutes] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const catalogoHrefs = useMemo(() => new Set(catalogo.map((c) => c.href)), []);

  const carregar = useCallback(async () => {
    setError(null);
    try {
      const { data } = await axios.get('/api/config/rotas-publicas');
      const atuais: string[] = data.routes ?? [];
      setRoutes(atuais.filter((r) => catalogoHrefs.has(r)));
      setExtra(atuais.filter((r) => !catalogoHrefs.has(r)).join('\n'));
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [catalogoHrefs]);

  useEffect(() => { carregar(); }, [carregar]);

  function toggle(href: string) {
    setSalvo(false);
    setRoutes((prev) => (prev.includes(href) ? prev.filter((r) => r !== href) : [...prev, href]));
  }

  async function salvar() {
    setSaving(true);
    setError(null);
    setSalvo(false);
    try {
      const extras = extra
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      const { data } = await axios.post('/api/config/rotas-publicas', { routes: [...routes, ...extras] });
      setRoutes((data.routes ?? []).filter((r: string) => catalogoHrefs.has(r)));
      setSalvo(true);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando rotas…</p>
      </div>
    );
  }

  const grupos = Array.from(new Set(catalogo.map((c) => c.grupo)));

  return (
    <div className="max-w-[1000px] mx-auto p-6 space-y-5">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rotas Públicas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configurações · Acesso · Rotas Públicas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setLoading(true); carregar(); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
          <button onClick={salvar} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
          </button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Páginas marcadas aqui ficam acessíveis sem estar logado como admin. Depois de salvar, o arquivo{' '}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">config/public-routes.json</code> fica alterado no seu
        working tree — inclua ele no commit e, no servidor, basta dar <code className="text-xs bg-muted px-1 py-0.5 rounded">git pull</code>.
      </p>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {salvo && !error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-success-bg text-success text-sm">
          <CheckCircle2 size={16} /> Alterações salvas em config/public-routes.json.
        </div>
      )}

      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Globe size={15} className="text-primary" />
          <h2 className="text-sm font-semibold">Páginas do menu</h2>
        </div>
        <div className="divide-y divide-border">
          {grupos.map((grupo) => (
            <div key={grupo} className="px-5 py-3">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{grupo}</div>
              <div className="flex flex-col gap-2">
                {catalogo.filter((c) => c.grupo === grupo).map((c) => (
                  <label key={c.href} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={routes.includes(c.href)}
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
      </div>

      <div className="rounded-lg border border-border p-5 space-y-2">
        <h2 className="text-sm font-semibold">Outras rotas (opcional)</h2>
        <p className="text-xs text-muted-foreground">
          Uma rota ou prefixo por linha (ex.: <code className="bg-muted px-1 py-0.5 rounded">/api/algo</code>). Útil para rotas que não aparecem no menu.
        </p>
        <textarea
          value={extra}
          onChange={(e) => { setExtra(e.target.value); setSalvo(false); }}
          rows={4}
          className="w-full px-3 py-2 text-sm font-mono border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
    </div>
  );
}
