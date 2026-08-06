'use client';

import type { EventoSaude, SaudeDiaria as SaudeDiariaData } from '@/lib/congelamentos';
import axios from 'axios';
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Snowflake, Unlock } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

function fmtDiaCurto(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function verticalLabel(v: string | null): string {
  return v === 'imovel' ? 'Imóveis' : v === 'veiculo' ? 'Veículos' : '';
}

function ListaEventos({ eventos, tipo }: { eventos: EventoSaude[]; tipo: 'congelou' | 'descongelou' }) {
  if (eventos.length === 0) {
    return <p className="px-5 py-6 text-sm text-muted-foreground text-center">Nada hoje.</p>;
  }
  return (
    <div className="divide-y divide-border">
      {eventos.map((e) => (
        <div key={`${e.idCliente}-${e.hora}`} className="px-5 py-3 flex items-start gap-3 text-sm">
          <span className="w-11 text-muted-foreground tabular-nums flex-shrink-0 pt-0.5">{e.hora}</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{e.cliente || `Cliente #${e.idCliente}`}</p>
            <p className="text-xs text-muted-foreground">
              #{e.idCliente}
              {verticalLabel(e.vertical) && ` · ${verticalLabel(e.vertical)}`}
              {tipo === 'descongelou' && e.diasCongelado != null && ` · ${e.diasCongelado} dias congelado`}
              {e.motivo && ` · ${e.motivo}`}
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            {e.origem === 'automatico' ? (
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500">
                {tipo === 'congelou' ? 'cron' : 'automático'}
              </span>
            ) : (
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">manual</span>
            )}
            {e.origem === 'manual' && <p className="text-xs text-muted-foreground mt-0.5">{e.usuario || 'usuário ?'}</p>}
          </div>
        </div>
      ))}
    </div>
  );
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
  const cong = dados.congelamentosHoje;
  const desc = dados.descongelamentosHoje;

  const historia = `Hoje ${cong.total} conta(s) foram congeladas (${cong.automatico} por cobrança automática, ${cong.manual} manual) e ${desc.total} descongeladas (${desc.automatico} automático após pagamento, ${desc.manual} manual).`;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={carregar} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar
        </button>
      </div>

      <div className={`rounded-lg border p-5 flex items-start gap-4 ${saudavel ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-destructive/40 bg-destructive/5'}`}>
        {saudavel ? <CheckCircle2 size={28} className="text-emerald-500 flex-shrink-0" /> : <AlertTriangle size={28} className="text-destructive flex-shrink-0" />}
        <div>
          <p className="font-semibold">{saudavel ? 'Tudo automático' : 'Precisa de atenção'}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{historia}</p>
          {!saudavel && (
            <p className="text-sm text-destructive mt-1">
              {[
                dados.alertas.manualHoje ? `${desc.manual} descongelamento(s) manual(is) hoje` : null,
                dados.alertas.backlog ? `${dados.backlogPagoCongelado} conta(s) paga(s) ainda congelada(s)` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border p-5">
          <p className="text-sm text-muted-foreground">Congelados hoje</p>
          <p className="text-3xl font-semibold tabular-nums mt-1">{cong.total}</p>
          <div className="mt-3 flex gap-4 text-sm">
            <span className="text-muted-foreground">{cong.automatico} cron</span>
            <span className="text-muted-foreground">{cong.manual} manual</span>
          </div>
        </div>

        <div className="rounded-lg border border-border p-5">
          <p className="text-sm text-muted-foreground">Descongelados hoje</p>
          <p className="text-3xl font-semibold tabular-nums mt-1">{desc.total}</p>
          <div className="mt-3 flex gap-4 text-sm">
            <span className="text-emerald-500">{desc.automatico} automático</span>
            <span className={desc.manual > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}>{desc.manual} manual</span>
          </div>
        </div>

        <div className={`rounded-lg border p-5 ${dados.alertas.backlog ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}>
          <p className="text-sm text-muted-foreground">Pago mas ainda congelado</p>
          <p className={`text-3xl font-semibold tabular-nums mt-1 ${dados.alertas.backlog ? 'text-destructive' : ''}`}>{dados.backlogPagoCongelado}</p>
          <p className="mt-3 text-sm text-muted-foreground">Deve ficar em zero.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Snowflake size={16} className="text-primary" />
            <h2 className="text-sm font-semibold">Congelados hoje</h2>
            <span className="ml-auto text-xs text-muted-foreground">{cong.total}</span>
          </div>
          <ListaEventos eventos={dados.congeladosLista} tipo="congelou" />
        </div>

        <div className="rounded-lg border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Unlock size={16} className="text-primary" />
            <h2 className="text-sm font-semibold">Descongelados hoje</h2>
            <span className="ml-auto text-xs text-muted-foreground">{desc.total}</span>
          </div>
          <ListaEventos eventos={dados.descongeladosLista} tipo="descongelou" />
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
