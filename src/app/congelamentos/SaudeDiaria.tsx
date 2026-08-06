'use client';

import type { SaudeDiaria as SaudeDiariaData } from '@/lib/congelamentos';
import axios from 'axios';
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

function fmtDiaCurto(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function SaudeDiaria() {
  const [dados, setDados] = useState<SaudeDiariaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/congelamentos/saude');
      setDados(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (loading && !dados) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-muted-foreground">
        <Loader2 size={32} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando saúde diária…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-muted-foreground">
        <AlertTriangle size={36} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao carregar</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={carregar} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!dados) return null;

  const saudavel = !dados.alertas.manualHoje && !dados.alertas.backlog;
  const maxTend = Math.max(1, ...dados.tendencia.map((t) => t.automatico + t.manual));

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={carregar} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar
        </button>
      </div>

      <div className={`rounded-lg border p-5 flex items-center gap-4 ${saudavel ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-destructive/40 bg-destructive/5'}`}>
        {saudavel ? <CheckCircle2 size={28} className="text-emerald-500 flex-shrink-0" /> : <AlertTriangle size={28} className="text-destructive flex-shrink-0" />}
        <div>
          <p className="font-semibold">{saudavel ? 'Tudo automático' : 'Precisa de atenção'}</p>
          <p className="text-sm text-muted-foreground">
            {saudavel
              ? 'Nenhum descongelamento manual hoje e nenhuma conta paga travada.'
              : [
                  dados.alertas.manualHoje ? `${dados.descongelamentosHoje.manual} descongelamento(s) manual(is) hoje` : null,
                  dados.alertas.backlog ? `${dados.backlogPagoCongelado} conta(s) paga(s) ainda congelada(s)` : null,
                ].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border p-5">
          <p className="text-sm text-muted-foreground">Descongelados hoje</p>
          <p className="text-3xl font-semibold tabular-nums mt-1">{dados.descongelamentosHoje.total}</p>
          <div className="mt-3 flex gap-4 text-sm">
            <span className="text-emerald-500">{dados.descongelamentosHoje.automatico} automático</span>
            <span className={dados.descongelamentosHoje.manual > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}>{dados.descongelamentosHoje.manual} manual</span>
          </div>
        </div>

        <div className="rounded-lg border border-border p-5">
          <p className="text-sm text-muted-foreground">Congelados hoje</p>
          <p className="text-3xl font-semibold tabular-nums mt-1">{dados.congelamentosHoje.total}</p>
          <div className="mt-3 flex gap-4 text-sm">
            <span className="text-muted-foreground">{dados.congelamentosHoje.automatico} cron</span>
            <span className="text-muted-foreground">{dados.congelamentosHoje.manual} manual</span>
          </div>
        </div>

        <div className={`rounded-lg border p-5 ${dados.alertas.backlog ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}>
          <p className="text-sm text-muted-foreground">Pago mas ainda congelado</p>
          <p className={`text-3xl font-semibold tabular-nums mt-1 ${dados.alertas.backlog ? 'text-destructive' : ''}`}>{dados.backlogPagoCongelado}</p>
          <p className="mt-3 text-sm text-muted-foreground">Deve ficar em zero. Acima disso, algo escapou do automático.</p>
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Activity size={16} className="text-primary" />
          <h2 className="text-sm font-semibold">Descongelamentos por dia (14 dias)</h2>
          <span className="ml-auto text-xs text-muted-foreground flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" /> automático</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-destructive" /> manual</span>
          </span>
        </div>
        <div className="p-5 space-y-1.5">
          {dados.tendencia.map((t) => {
            const total = t.automatico + t.manual;
            return (
              <div key={t.dia} className="flex items-center gap-3 text-sm">
                <span className="w-12 text-muted-foreground tabular-nums flex-shrink-0">{fmtDiaCurto(t.dia)}</span>
                <div className="flex-1 flex h-4 rounded-sm overflow-hidden bg-muted">
                  {t.automatico > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${(t.automatico / maxTend) * 100}%` }} />}
                  {t.manual > 0 && <div className="bg-destructive h-full" style={{ width: `${(t.manual / maxTend) * 100}%` }} />}
                </div>
                <span className="w-24 text-right tabular-nums flex-shrink-0">
                  {total === 0 ? <span className="text-muted-foreground">—</span> : <>{t.automatico}<span className="text-muted-foreground"> / </span><span className={t.manual > 0 ? 'text-destructive' : 'text-muted-foreground'}>{t.manual}</span></>}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {dados.generatedAt && `Atualizado às ${new Date(dados.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
      </p>
    </div>
  );
}
