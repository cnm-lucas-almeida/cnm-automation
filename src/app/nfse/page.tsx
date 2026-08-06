'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, FileWarning, FileCheck2, Download, AlertTriangle, Link2,
} from 'lucide-react';
import type { NfseVerificacaoData, PagamentoNfse, NotaOmie, GrupoDuplicado, ResumoDia } from '@/lib/nfse';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

type Preset =
  | 'hoje'
  | 'ontem'
  | 'ultimos_7'
  | 'este_mes'
  | 'mes_passado'
  | 'este_ano'
  | 'personalizado';

const PRESET_OPTIONS = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'ontem', label: 'Ontem' },
  { value: 'ultimos_7', label: 'Últimos 7 dias' },
  { value: 'este_mes', label: 'Este mês' },
  { value: 'mes_passado', label: 'Mês passado' },
  { value: 'este_ano', label: 'Este ano' },
  { value: 'personalizado', label: 'Personalizado' },
];

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

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function presetParaDatas(preset: Preset): { dataInicial: string; dataFinal: string } {
  const hoje = new Date();

  if (preset === 'hoje') {
    return { dataInicial: isoLocal(hoje), dataFinal: isoLocal(hoje) };
  }
  if (preset === 'ontem') {
    const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
    return { dataInicial: isoLocal(ontem), dataFinal: isoLocal(ontem) };
  }
  if (preset === 'ultimos_7') {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 6);
    return { dataInicial: isoLocal(inicio), dataFinal: isoLocal(hoje) };
  }
  if (preset === 'mes_passado') {
    const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { dataInicial: primeiroDiaMes(mesPassado), dataFinal: isoLocal(ultimoDia) };
  }
  if (preset === 'este_ano') {
    return { dataInicial: `${hoje.getFullYear()}-01-01`, dataFinal: isoLocal(hoje) };
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

function exportarCsvNotas(nome: string, notas: NotaOmie[]) {
  const header = ['NFS-e', 'Destinatario', 'CPF/CNPJ', 'Valor', 'Emissao', 'Vinculada no Admin', 'Pagamento'];
  const linhas = notas.map((n) => [
    n.numero, n.destinatario ?? '', n.documento, n.valor.toFixed(2), fmtData(n.dataEmissao),
    n.vinculadaNoAdmin ? 'Sim' : 'Não', n.idPagamentoVinculado ?? '',
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

function exportarCsvResumo(nome: string, resumo: ResumoDia[]) {
  const header = ['Dia', 'Pagamentos', 'Valor', 'Com nota', 'Sem nota', 'Valor sem nota', 'Cobertura %'];
  const linhas = resumo.map((r) => [
    fmtData(r.dia), r.qtdPagamentos, r.valorPagamentos.toFixed(2),
    r.qtdConfirmados, r.qtdSemNota, r.valorSemNota.toFixed(2),
    String(r.percentualCobertura).replace('.', ','),
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

function corCobertura(pct: number): string {
  if (pct >= 95) return '#1E7A34';
  if (pct >= 70) return '#B8860B';
  return '#CA3500';
}

function TabelaResumoDiario({ resumo }: { resumo: ResumoDia[] }) {
  const totais = resumo.reduce(
    (acc, r) => ({
      qtdPagamentos: acc.qtdPagamentos + r.qtdPagamentos,
      valorPagamentos: acc.valorPagamentos + r.valorPagamentos,
      qtdConfirmados: acc.qtdConfirmados + r.qtdConfirmados,
      qtdSemNota: acc.qtdSemNota + r.qtdSemNota,
      valorSemNota: acc.valorSemNota + r.valorSemNota,
    }),
    { qtdPagamentos: 0, valorPagamentos: 0, qtdConfirmados: 0, qtdSemNota: 0, valorSemNota: 0 },
  );
  const coberturaTotal = totais.qtdPagamentos > 0
    ? Math.round((totais.qtdConfirmados / totais.qtdPagamentos) * 1000) / 10
    : 0;

  return (
    <div className="rounded-lg border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Fechamento por dia</h2>
        <span className="text-xs text-muted-foreground">{resumo.length} dia(s)</span>
      </div>
      {resumo.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Nenhum pagamento no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="px-5 py-2.5 font-semibold">Dia</th>
                <th className="px-4 py-2.5 font-semibold text-right">Pagamentos</th>
                <th className="px-4 py-2.5 font-semibold text-right">Valor</th>
                <th className="px-4 py-2.5 font-semibold text-right">Com nota</th>
                <th className="px-4 py-2.5 font-semibold text-right">Sem nota</th>
                <th className="px-4 py-2.5 font-semibold text-right">Valor sem nota</th>
                <th className="px-5 py-2.5 font-semibold text-right">Cobertura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {resumo.map((r) => (
                <tr key={r.dia} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-2.5 text-xs font-medium">{fmtData(r.dia)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs">{r.qtdPagamentos.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs">{fmtMoeda(r.valorPagamentos)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs text-success">{r.qtdConfirmados.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs font-semibold">{r.qtdSemNota.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs">{fmtMoeda(r.valorSemNota)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-xs font-bold"
                    style={{ color: corCobertura(r.percentualCobertura) }}>
                    {r.percentualCobertura.toLocaleString('pt-BR')}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td className="px-5 py-2.5 text-xs">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs">{totais.qtdPagamentos.toLocaleString('pt-BR')}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs">{fmtMoeda(totais.valorPagamentos)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs text-success">{totais.qtdConfirmados.toLocaleString('pt-BR')}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs">{totais.qtdSemNota.toLocaleString('pt-BR')}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs">{fmtMoeda(totais.valorSemNota)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums text-xs font-bold"
                  style={{ color: corCobertura(coberturaTotal) }}>
                  {coberturaTotal.toLocaleString('pt-BR')}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function TabelaNotas({ titulo, notas, vazio }: { titulo: string; notas: NotaOmie[]; vazio: string }) {
  return (
    <div className="rounded-lg border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <span className="text-xs text-muted-foreground">{notas.length} nota(s)</span>
      </div>
      {notas.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="px-5 py-2.5 font-semibold">NFS-e</th>
                <th className="px-4 py-2.5 font-semibold">Destinatário</th>
                <th className="px-4 py-2.5 font-semibold">CPF/CNPJ</th>
                <th className="px-4 py-2.5 font-semibold text-right">Valor</th>
                <th className="px-4 py-2.5 font-semibold">Emissão</th>
                <th className="px-5 py-2.5 font-semibold text-center">Vinculada no Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {notas.map((n) => (
                <tr key={n.numero} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-2.5 font-semibold tabular-nums text-xs">Nº {n.numero}</td>
                  <td className="px-4 py-2.5 text-xs">{n.destinatario ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums">{n.documento}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-xs">{fmtMoeda(n.valor)}</td>
                  <td className="px-4 py-2.5 text-xs">{fmtData(n.dataEmissao)}</td>
                  <td className={`px-5 py-2.5 text-center text-xs font-semibold ${n.vinculadaNoAdmin ? 'text-success' : 'text-destructive'}`}>
                    {n.vinculadaNoAdmin ? `Sim · pgto ${n.idPagamentoVinculado}` : 'Não'}
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

function TabelaDuplicadas({ grupos }: { grupos: GrupoDuplicado[] }) {
  return (
    <div className="rounded-lg border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Possíveis notas duplicadas</h2>
        <span className="text-xs text-muted-foreground">{grupos.length} caso(s)</span>
      </div>
      {grupos.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          Nenhuma duplicidade encontrada no período.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="px-5 py-2.5 font-semibold">Destinatário</th>
                <th className="px-4 py-2.5 font-semibold">CPF/CNPJ</th>
                <th className="px-4 py-2.5 font-semibold text-right">Valor</th>
                <th className="px-4 py-2.5 font-semibold text-center">Qtd.</th>
                <th className="px-5 py-2.5 font-semibold">Notas emitidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {grupos.map((g) => (
                <tr key={`${g.documento}-${g.valor}`} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-2.5 font-medium text-xs">{g.destinatario ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums">{g.documento}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-xs">{fmtMoeda(g.valor)}</td>
                  <td className="px-4 py-2.5 text-center text-xs font-bold text-destructive">{g.notas.length}</td>
                  <td className="px-5 py-2.5 text-xs">
                    <div className="flex flex-col gap-0.5">
                      {g.notas.map((n) => (
                        <span key={n.numero} className="tabular-nums">
                          Nº {n.numero} · {fmtData(n.dataEmissao)}
                          {n.vinculadaNoAdmin
                            ? <span className="text-success"> · vinculada (pgto {n.idPagamentoVinculado})</span>
                            : <span className="text-destructive"> · não vinculada</span>}
                        </span>
                      ))}
                    </div>
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

type EstadoVinculo = { status: string; mensagem: string };

// O Admin resolve a vinculação buscando a nota da OS já criada na Omie. Pagamento
// que ainda não tem NFS-e (nem OS) precisa ser emitido antes — para esses o botão
// não aparece, senão a ação falharia sempre.
function podeVincular(p: PagamentoNfse): boolean {
  return p.temNfsAdmin && !p.numeroNfsAdmin;
}

function BotaoVincular({
  pagamento, vinculando, resultado, onVincular,
}: {
  pagamento: PagamentoNfse;
  vinculando: boolean;
  resultado?: EstadoVinculo;
  onVincular: (id: number) => void;
}) {
  if (resultado) {
    const cor = resultado.status === 'success' ? 'text-success'
      : resultado.status === 'rate_limit' ? 'text-[#B8860B]'
      : resultado.status === 'processing' ? 'text-muted-foreground'
      : 'text-destructive';
    return <span className={`text-[11px] ${cor}`} title={resultado.mensagem}>{
      resultado.status === 'success' ? 'Vinculada'
        : resultado.status === 'rate_limit' ? 'Omie ocupada'
        : resultado.status === 'processing' ? 'Ainda não emitida'
        : 'Falhou'
    }</span>;
  }

  if (!podeVincular(pagamento)) {
    return <span className="text-[11px] text-muted-foreground" title="Não há OS na Omie para este pagamento — precisa ser emitido antes.">—</span>;
  }

  return (
    <button
      onClick={() => onVincular(pagamento.idPagamento)}
      disabled={vinculando}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-border rounded-md text-[11px] font-medium hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {vinculando ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
      {vinculando ? 'Vinculando…' : 'Vincular'}
    </button>
  );
}

function TabelaPagamentos({
  titulo, pagamentos, vazio, vinculando, resultados, onVincular,
}: {
  titulo: string;
  pagamentos: PagamentoNfse[];
  vazio: string;
  vinculando?: Set<number>;
  resultados?: Map<number, EstadoVinculo>;
  onVincular?: (id: number) => void;
}) {
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
                {onVincular && <th className="px-5 py-2.5 font-semibold text-center">Ação</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagamentos.map((p) => (
                <tr key={p.idPagamento} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-2.5 font-medium">{p.clienteNome}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums">{fmtDocumento(p.cpfCnpj)}</td>
                  <td className="px-4 py-2.5 text-xs">{fmtData(p.dataPagamento)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-xs">{fmtMoeda(p.valor)}</td>
                  <td className="px-4 py-2.5 text-center text-xs">
                    {p.numeroNfsAdmin
                      ? <span className="tabular-nums">Nº {p.numeroNfsAdmin}</span>
                      : p.temNfsAdmin ? <span className="text-muted-foreground">sem número</span> : '—'}
                  </td>
                  <td className={`px-4 py-2.5 text-center text-xs font-semibold ${p.nfsConfirmadaOmie ? 'text-success' : 'text-destructive'}`}>
                    {p.nfsConfirmadaOmie ? 'Sim' : 'Não'}
                  </td>
                  <td className="px-5 py-2.5 text-xs tabular-nums">
                    {p.nfseOmie ? `Nº ${p.nfseOmie.numero} · ${fmtMoeda(p.nfseOmie.valor)} · ${fmtData(p.nfseOmie.dataEmissao)}` : '—'}
                  </td>
                  {onVincular && (
                    <td className="px-5 py-2.5 text-center">
                      <BotaoVincular
                        pagamento={p}
                        vinculando={vinculando?.has(p.idPagamento) ?? false}
                        resultado={resultados?.get(p.idPagamento)}
                        onVincular={onVincular}
                      />
                    </td>
                  )}
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

  const [vinculando, setVinculando] = useState<Set<number>>(new Set());
  const [resultadosVinculo, setResultadosVinculo] = useState<Map<number, EstadoVinculo>>(new Map());
  const [avisoVinculo, setAvisoVinculo] = useState<string | null>(null);

  const vincular = useCallback(async (idPagamento: number) => {
    setAvisoVinculo(null);
    setVinculando((atual) => new Set(atual).add(idPagamento));
    try {
      const res = await axios.post('/api/nfse/vincular', { idsPagamento: [idPagamento] });
      const { resultados, rateLimited, retryAfter } = res.data;

      if (rateLimited) {
        setAvisoVinculo(
          `A API da Omie está bloqueada por consumo. Tente novamente em ~${Math.ceil((retryAfter ?? 300) / 60)} min.`,
        );
      }
      const retorno = resultados?.[0];
      if (retorno) {
        setResultadosVinculo((atual) => new Map(atual).set(idPagamento, {
          status: retorno.status,
          mensagem: retorno.mensagem,
        }));
      }
    } catch (err) {
      const mensagem = (axios.isAxiosError(err) ? err.response?.data?.error : null)
        ?? (err instanceof Error ? err.message : 'Falha ao vincular.');
      setAvisoVinculo(mensagem);
      setResultadosVinculo((atual) => new Map(atual).set(idPagamento, { status: 'error', mensagem }));
    } finally {
      setVinculando((atual) => {
        const proximo = new Set(atual);
        proximo.delete(idPagamento);
        return proximo;
      });
    }
  }, []);

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
            options={PRESET_OPTIONS}
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
        Confronta os pagamentos do Admin com as NFS-e faturadas na Omie pelo <strong>número da nota</strong>
        {' '}(a mesma chave gravada no Admin), então o casamento é exato — não por cliente.
        A busca na Omie vai até {fmtData(dados.periodo.dataFinalBuscaOmie)} para cobrir notas emitidas com atraso.
        Duplicidade = mais de uma NFS-e faturada para o mesmo destinatário e mesmo valor no período.
      </p>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard title="Total de pagamentos" value={dados.kpis.totalPagamentos.toLocaleString('pt-BR')}
          sub={fmtMoeda(dados.kpis.valorTotal)}
          icon={FileWarning} color="#323131" />
        <KpiCard title="Confirmados na Omie" value={dados.kpis.qtdConfirmadosOmie.toLocaleString('pt-BR')}
          sub={fmtMoeda(dados.kpis.valorConfirmadoOmie)}
          icon={FileCheck2} color="#1E7A34" />
        <KpiCard title="Sem nota na Omie" value={dados.kpis.qtdSemNota.toLocaleString('pt-BR')}
          sub={fmtMoeda(dados.kpis.valorSemNota)}
          icon={FileWarning} color="#CA3500" />
        <KpiCard title="Notas na Omie" value={dados.kpis.qtdNotasOmie.toLocaleString('pt-BR')}
          sub="faturadas no período"
          icon={FileCheck2} color="#323131" />
        <KpiCard title="Notas não vinculadas" value={dados.kpis.qtdNotasNaoVinculadas.toLocaleString('pt-BR')}
          sub={`${fmtMoeda(dados.kpis.valorNotasNaoVinculadas)} · emitidas mas sem vínculo no Admin`}
          icon={AlertTriangle} color="#B8860B" />
        <KpiCard title="Notas duplicadas" value={dados.kpis.qtdNotasDuplicadas.toLocaleString('pt-BR')}
          sub="mesmo destinatário e valor"
          icon={AlertCircle} color="#CA3500" />
      </div>

      {avisoVinculo && (
        <div className="rounded-lg border border-[#B8860B]/40 bg-[#B8860B]/10 px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={15} className="text-[#B8860B] flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="text-foreground">{avisoVinculo}</p>
          </div>
          <button onClick={() => setAvisoVinculo(null)}
            className="text-xs text-muted-foreground hover:text-foreground">Fechar</button>
        </div>
      )}

      {/* Fechamento por dia */}
      <div className="space-y-2">
        <div className="flex justify-end">
          <button onClick={() => exportarCsvResumo(`fechamento-diario-${dataInicial}-a-${dataFinal}`, dados.resumoPorDia)}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Download size={13} /> Exportar CSV
          </button>
        </div>
        <TabelaResumoDiario resumo={dados.resumoPorDia} />
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
          vinculando={vinculando}
          resultados={resultadosVinculo}
          onVincular={vincular}
        />
      </div>

      {/* Notas emitidas na Omie sem vínculo no Admin */}
      <div className="space-y-2">
        <div className="flex justify-end">
          <button onClick={() => exportarCsvNotas(`notas-nao-vinculadas-${dataInicial}-a-${dataFinal}`, dados.notasNaoVinculadas)}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Download size={13} /> Exportar CSV
          </button>
        </div>
        <TabelaNotas
          titulo="NFS-e emitidas na Omie e ainda não vinculadas no Admin"
          notas={dados.notasNaoVinculadas}
          vazio="Todas as NFS-e faturadas no período estão vinculadas a um pagamento no Admin."
        />
      </div>

      {/* Duplicadas */}
      <TabelaDuplicadas grupos={dados.notasDuplicadas} />

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
