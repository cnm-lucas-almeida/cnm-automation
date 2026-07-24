'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, FileWarning, FileCheck2, Download, AlertTriangle,
} from 'lucide-react';
import type { NfseVerificacaoData, PagamentoNfse } from '@/lib/nfse';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

type Preset = 'este_mes' | 'mes_passado' | 'personalizado';

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtData(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
}

function fmtDocumento(doc: string | null) {
  if (!doc) return '—';
  return doc;
}

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function primeiroDiaMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function presetParaDatas(preset: Preset): { dataInicial: string; dataFinal: string } {
  const hoje = new Date();
  if (preset === 'mes_passado') {
    const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { dataInicial: primeiroDiaMes(mesPassado), dataFinal: ultimoDia.toISOString().slice(0, 10) };
  }
  return { dataInicial: primeiroDiaMes(hoje), dataFinal: isoHoje() };
}

function KpiCard({
  title, value, sub, icon: Icon, color,
}: {
  title: string; value: string | number; sub?: string; icon: any; color: string;
}) {
  return (
    <div className="rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color }}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <Icon size={20} style={{ color }} className="opacity-60 flex-shrink-0 mt-1" />
      </div>
    </div>
  );
}

function exportarCsv(nome: string, pagamentos: PagamentoNfse[]) {
  const header = ['Pagamento', 'Cliente', 'CPF/CNPJ', 'Data Pagamento', 'Valor', 'Vinculado no Admin', 'Confirmado na Omie', 'NFS-e Omie', 'Valor NFS-e', 'Emissão NFS-e'];
  const linhas = pagamentos.map((p) => [
    p.idPagamento, p.clienteNome, p.cpfCnpj ?? '', fmtData(p.dataPagamento), p.valor.toFixed(2),
    p.temNfsAdmin ? 'Sim' : 'Não', p.nfsConfirmadaOmie ? 'Sim' : 'Não',
    p.nfseOmie?.numero ?? '', p.nfseOmie?.valor.toFixed(2) ?? '', fmtData(p.nfseOmie?.dataEmissao ?? null),
  ]);
  const csv = [header, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nome}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function TabelaPagamentos({ titulo, pagamentos, vazio }: { titulo: string; pagamentos: PagamentoNfse[]; vazio: string }) {
  return (
    <div className="rounded-lg border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <span className="text-xs text-muted-foreground">{pagamentos.length} registro(s)</span>
      </div>
      {pagamentos.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="px-5 py-2.5 font-semibold">Cliente</th>
                <th className="px-4 py-2.5 font-semibold">CPF/CNPJ</th>
                <th className="px-4 py-2.5 font-semibold">Data pagto.</th>
                <th className="px-4 py-2.5 font-semibold text-right">Valor</th>
                <th className="px-4 py-2.5 font-semibold text-center">Vinculado admin</th>
                <th className="px-4 py-2.5 font-semibold text-center">Confirmado Omie</th>
                <th className="px-5 py-2.5 font-semibold">NFS-e (Omie)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagamentos.map((p) => (
                <tr key={p.idPagamento} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-2.5 font-medium">{p.clienteNome}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums">{fmtDocumento(p.cpfCnpj)}</td>
                  <td className="px-4 py-2.5 text-xs">{fmtData(p.dataPagamento)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-xs">{fmtMoeda(p.valor)}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{p.temNfsAdmin ? 'Sim' : '—'}</td>
                  <td className={`px-4 py-2.5 text-center text-xs font-semibold ${p.nfsConfirmadaOmie ? 'text-success' : 'text-destructive'}`}>
                    {p.nfsConfirmadaOmie ? 'Sim' : 'Não'}
                  </td>
                  <td className="px-5 py-2.5 text-xs tabular-nums">
                    {p.nfseOmie ? `Nº ${p.nfseOmie.numero} · ${fmtMoeda(p.nfseOmie.valor)} · ${fmtData(p.nfseOmie.dataEmissao)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function NfsePage() {
  const [preset, setPreset] = useState<Preset>('este_mes');
  const [dataInicial, setDataInicial] = useState(() => presetParaDatas('este_mes').dataInicial);
  const [dataFinal, setDataFinal] = useState(() => presetParaDatas('este_mes').dataFinal);

  const [dados, setDados] = useState<NfseVerificacaoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDados = useCallback(async (di: string, df: string) => {
    setError(null);
    try {
      const res = await axios.get('/api/nfse', { params: { dataInicial: di, dataFinal: df } });
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

  function aplicarPreset(p: Preset) {
    setPreset(p);
    if (p !== 'personalizado') {
      const { dataInicial: di, dataFinal: df } = presetParaDatas(p);
      setDataInicial(di);
      setDataFinal(df);
    }
  }

  const updatedAt = dados?.generatedAt
    ? new Date(dados.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Consultando pagamentos e NFS-e na Omie…</p>
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

  if (!dados) return null;

  return (
    <div className={`space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>

      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Verificação de NFS-e</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            {updatedAt && <span>Atualizado às {updatedAt}</span>}
            {reloading && <Loader2 size={12} className="animate-spin text-primary" />}
            <span>· {fmtData(dataInicial)} a {fmtData(dataFinal)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={preset}
            onChange={(v) => aplicarPreset(v as Preset)}
            className="min-w-[170px]"
            options={[
              { value: 'este_mes', label: 'Este mês' },
              { value: 'mes_passado', label: 'Mês passado' },
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
          <button onClick={() => { setReloading(true); fetchDados(dataInicial, dataFinal); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground -mt-2">
        Compara os pagamentos do Admin com as NFS-e emitidas na Omie por CPF/CNPJ do cliente
        (busca até {fmtData(dados.periodo.dataFinalBuscaOmie)} para cobrir notas emitidas com atraso).
        O casamento é por cliente, não por pagamento individual — se o cliente teve qualquer NFS-e
        faturada no período, todos os pagamentos dele aparecem como confirmados.
      </p>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard title="Total de pagamentos" value={dados.kpis.totalPagamentos.toLocaleString('pt-BR')}
          sub={fmtMoeda(dados.kpis.valorTotal)}
          icon={FileWarning} color="#323131" />
        <KpiCard title="Confirmados na Omie" value={dados.kpis.qtdConfirmadosOmie.toLocaleString('pt-BR')}
          sub={fmtMoeda(dados.kpis.valorConfirmadoOmie)}
          icon={FileCheck2} color="#1E7A34" />
        <KpiCard title="Sem nota na Omie" value={dados.kpis.qtdSemNota.toLocaleString('pt-BR')}
          sub={fmtMoeda(dados.kpis.valorSemNota)}
          icon={FileWarning} color="#CA3500" />
        <KpiCard title="Divergentes vs. Admin" value={dados.kpis.qtdDivergentes.toLocaleString('pt-BR')}
          sub="admin e Omie não batem"
          icon={AlertTriangle} color="#B8860B" />
      </div>

      {/* Sem nota */}
      <div className="space-y-2">
        <div className="flex justify-end">
          <button onClick={() => exportarCsv(`sem-nota-${dataInicial}-a-${dataFinal}`, dados.pagamentosSemNota)}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Download size={13} /> Exportar CSV
          </button>
        </div>
        <TabelaPagamentos
          titulo="Pagamentos sem NFS-e confirmada na Omie"
          pagamentos={dados.pagamentosSemNota}
          vazio="Nenhum pagamento sem NFS-e confirmada no período."
        />
      </div>

      {/* Divergentes */}
      <div className="space-y-2">
        <div className="flex justify-end">
          <button onClick={() => exportarCsv(`divergentes-${dataInicial}-a-${dataFinal}`, dados.pagamentosDivergentes)}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Download size={13} /> Exportar CSV
          </button>
        </div>
        <TabelaPagamentos
          titulo="Divergências entre o status do Admin e a Omie"
          pagamentos={dados.pagamentosDivergentes}
          vazio="Nenhuma divergência entre o vínculo do Admin e a confirmação na Omie."
        />
      </div>

    </div>
  );
}
