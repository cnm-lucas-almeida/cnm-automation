'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Loader2, RefreshCw, AlertCircle, FileWarning, FileCheck2, Download, AlertTriangle, Link2, Search,
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

function filtrarPorDoc<T>(itens: T[], busca: string, getDoc: (t: T) => string | null): T[] {
  const q = busca.replace(/\D/g, '');
  if (!q) return itens;
  return itens.filter((t) => (getDoc(t) ?? '').replace(/\D/g, '').includes(q));
}

function BuscaDoc({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar CPF/CNPJ"
        inputMode="numeric"
        className="pl-8 pr-2 py-1.5 w-44 border border-border rounded-md text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

const ITENS_POR_PAGINA = 50;

// ponytail: paginação client-side simples (dados já vêm inteiros do servidor).
// Se o volume por período crescer a ponto de pesar no navegador, paginar no backend.
function usePaginacao<T>(itens: T[]): { visiveis: T[]; pagina: number; totalPaginas: number; setPagina: (p: number) => void } {
  const [pagina, setPagina] = useState(1);
  useEffect(() => { setPagina(1); }, [itens]);
  const totalPaginas = Math.max(1, Math.ceil(itens.length / ITENS_POR_PAGINA));
  const p = Math.min(pagina, totalPaginas);
  const visiveis = itens.slice((p - 1) * ITENS_POR_PAGINA, p * ITENS_POR_PAGINA);
  return { visiveis, pagina: p, totalPaginas, setPagina };
}

function Paginacao({ pagina, totalPaginas, total, onPagina }: { pagina: number; totalPaginas: number; total: number; onPagina: (p: number) => void }) {
  if (totalPaginas <= 1) return null;
  const btn = 'px-2.5 py-1 border border-border rounded-md text-xs font-medium hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border">
      <span className="text-xs text-muted-foreground tabular-nums">
        {total.toLocaleString('pt-BR')} registro(s) · página {pagina} de {totalPaginas}
      </span>
      <div className="flex items-center gap-1.5">
        <button className={btn} disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>Anterior</button>
        <button className={btn} disabled={pagina >= totalPaginas} onClick={() => onPagina(pagina + 1)}>Próxima</button>
      </div>
    </div>
  );
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
  const [busca, setBusca] = useState('');
  const filtrados = useMemo(() => filtrarPorDoc(notas, busca, (n) => n.documento), [notas, busca]);
  const { visiveis, pagina, totalPaginas, setPagina } = usePaginacao(filtrados);
  return (
    <div className="rounded-lg border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{filtrados.length} nota(s)</span>
          <BuscaDoc value={busca} onChange={setBusca} />
        </div>
      </div>
      {notas.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{vazio}</p>
      ) : filtrados.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Nenhuma nota para o CPF/CNPJ buscado.</p>
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
              {visiveis.map((n, i) => (
                <tr key={`${n.numero || n.documento}-${i}`} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-2.5 font-semibold tabular-nums text-xs">{n.numero ? `Nº ${n.numero}` : '—'}</td>
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
      <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={filtrados.length} onPagina={setPagina} />
    </div>
  );
}

function TabelaDuplicadas({ grupos }: { grupos: GrupoDuplicado[] }) {
  const [busca, setBusca] = useState('');
  const filtrados = useMemo(() => filtrarPorDoc(grupos, busca, (g) => g.documento), [grupos, busca]);
  return (
    <div className="rounded-lg border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Possíveis notas duplicadas</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{filtrados.length} caso(s)</span>
          <BuscaDoc value={busca} onChange={setBusca} />
        </div>
      </div>
      {grupos.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          Nenhuma duplicidade encontrada no período.
        </p>
      ) : filtrados.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Nenhum caso para o CPF/CNPJ buscado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                <th className="px-5 py-2.5 font-semibold">Destinatário</th>
                <th className="px-4 py-2.5 font-semibold">CPF/CNPJ</th>
                <th className="px-4 py-2.5 font-semibold text-right">Valor</th>
                <th className="px-4 py-2.5 font-semibold text-center">Pagamentos</th>
                <th className="px-4 py-2.5 font-semibold text-center">Notas</th>
                <th className="px-5 py-2.5 font-semibold">Notas emitidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtrados.map((g) => (
                <tr key={`${g.documento}-${g.valor}`} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-2.5 font-medium text-xs">{g.destinatario ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums">{g.documento}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-xs">{fmtMoeda(g.valor)}</td>
                  <td className="px-4 py-2.5 text-center text-xs tabular-nums">{g.qtdPagamentos}</td>
                  <td className="px-4 py-2.5 text-center text-xs font-bold text-destructive tabular-nums">{g.notas.length}</td>
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
  const [busca, setBusca] = useState('');
  const filtrados = useMemo(() => filtrarPorDoc(pagamentos, busca, (p) => p.cpfCnpj), [pagamentos, busca]);
  const { visiveis, pagina, totalPaginas, setPagina } = usePaginacao(filtrados);
  return (
    <div className="rounded-lg border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{filtrados.length} registro(s)</span>
          <BuscaDoc value={busca} onChange={setBusca} />
        </div>
      </div>
      {pagamentos.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{vazio}</p>
      ) : filtrados.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">Nenhum registro para o CPF/CNPJ buscado.</p>
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
              {visiveis.map((p) => (
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
      <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={filtrados.length} onPagina={setPagina} />
    </div>
  );
}

type ClienteNfseResultado = {
  id: number;
  nome: string;
  cpfCnpj: string | null;
  codigoOmie: number | null;
  totalNotas: number;
  qtdDuplicadas: number;
  aviso: string | null;
  notas: Array<{
    numero: string;
    valor: number;
    dataEmissao: string | null;
    numeroOs: string | null;
    codVerificacao: string | null;
    duplicada: boolean;
  }>;
};

function ConsultaPorCliente() {
  const [termo, setTermo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [clientes, setClientes] = useState<ClienteNfseResultado[] | null>(null);

  const buscar = useCallback(async () => {
    const t = termo.trim();
    if (t.length < 3) { setErro('Digite CPF/CNPJ, id do cliente ou nome (mínimo 3 caracteres).'); return; }
    setBuscando(true);
    setErro(null);
    try {
      const res = await axios.get('/api/nfse/cliente', { params: { termo: t } });
      setClientes(res.data.clientes ?? []);
    } catch (err) {
      const msg = (axios.isAxiosError(err) ? err.response?.data?.error : null)
        ?? (err instanceof Error ? err.message : 'Falha na consulta.');
      setErro(msg);
      setClientes(null);
    } finally {
      setBuscando(false);
    }
  }, [termo]);

  return (
    <div className="rounded-lg border border-border">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold">Consultar notas na Omie por cliente</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Busca todo o histórico de NFS-e do cliente direto na Omie e marca possíveis duplicidades
          (mesmo valor no mesmo mês de emissão).
        </p>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
            placeholder="CPF/CNPJ, id do cliente ou nome"
            className="flex-1 min-w-[240px] px-3 py-2 border border-border rounded-lg text-sm bg-background"
          />
          <button
            onClick={buscar}
            disabled={buscando}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Consultar
          </button>
        </div>

        {erro && <p className="text-xs text-destructive">{erro}</p>}

        {clientes && clientes.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum cliente encontrado para “{termo}”.</p>
        )}

        {clientes?.map((c) => (
          <div key={c.id} className="rounded-lg border border-border">
            <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{c.nome}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {c.cpfCnpj ?? '—'} · id {c.id}{c.codigoOmie ? ` · Omie ${c.codigoOmie}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">{c.totalNotas} nota(s)</span>
                {c.qtdDuplicadas > 0 && (
                  <span className="inline-flex items-center gap-1 text-destructive font-semibold">
                    <AlertTriangle size={13} /> {c.qtdDuplicadas} em duplicidade
                  </span>
                )}
              </div>
            </div>

            {c.aviso ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">{c.aviso}</p>
            ) : c.notas.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">Nenhuma NFS-e faturada para este cliente na Omie.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="px-4 py-2.5 font-semibold">NFS-e</th>
                      <th className="px-4 py-2.5 font-semibold">OS</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Valor</th>
                      <th className="px-4 py-2.5 font-semibold">Emissão</th>
                      <th className="px-4 py-2.5 font-semibold text-center">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {c.notas.map((n) => (
                      <tr key={n.numero} className={n.duplicada ? 'bg-destructive/5' : 'hover:bg-muted/50'}>
                        <td className="px-4 py-2.5 text-xs font-semibold tabular-nums">Nº {n.numero}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums">{n.numeroOs ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right text-xs tabular-nums font-semibold">{fmtMoeda(n.valor)}</td>
                        <td className="px-4 py-2.5 text-xs">{fmtData(n.dataEmissao)}</td>
                        <td className="px-4 py-2.5 text-center text-xs">
                          {n.duplicada
                            ? <span className="text-destructive font-semibold">Possível duplicidade</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
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

  // Carga inicial apenas. O filtro só é aplicado ao clicar em "Filtrar",
  // nunca ao trocar o preset ou editar as datas.
  useEffect(() => {
    fetchDados(dataInicial, dataFinal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function filtrar() {
    setReloading(true);
    fetchDados(dataInicial, dataFinal);
  }

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
            <span>· {fmtData(dados.periodo.dataInicial)} a {fmtData(dados.periodo.dataFinal)}</span>
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
          <button onClick={filtrar}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <Search size={14} /> Filtrar
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground -mt-2">
        Confronta os pagamentos do Admin com as NFS-e faturadas na Omie pelo <strong>número da nota</strong>
        {' '}(a mesma chave gravada no Admin), então o casamento é exato — não por cliente.
        A busca na Omie vai até {fmtData(dados.periodo.dataFinalBuscaOmie)} para cobrir notas emitidas com atraso.
        Duplicidade = mesmo cliente e valor com mais notas do que pagamentos no período (uma cobrança faturada mais de uma vez); notas de pagamentos distintos não contam.
      </p>

      {/* Consulta por cliente */}
      <ConsultaPorCliente />

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
        <KpiCard title="Faturamento em aberto" value={dados.kpis.qtdNotasEmAberto.toLocaleString('pt-BR')}
          sub={`${fmtMoeda(dados.kpis.valorNotasEmAberto)} · na Omie ainda não faturadas`}
          icon={FileWarning} color="#B8860B" />
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

      {/* Faturamento em aberto na Omie (NFS-e não faturada) */}
      <div className="space-y-2">
        <div className="flex justify-end">
          <button onClick={() => exportarCsvNotas(`faturamento-em-aberto-${dataInicial}-a-${dataFinal}`, dados.notasEmAberto)}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Download size={13} /> Exportar CSV
          </button>
        </div>
        <TabelaNotas
          titulo="Faturamento em aberto na Omie (NFS-e ainda não faturadas)"
          notas={dados.notasEmAberto}
          vazio="Nenhuma NFS-e em aberto (não faturada) na Omie no período."
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
