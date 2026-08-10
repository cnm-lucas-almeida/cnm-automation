'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, AlertCircle, ListChecks, Download, Search, Crown } from 'lucide-react';
import type { FilaLeadsData, FilaLeadsRow, VendedorOption, SquadOption } from '@/lib/fila-leads';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { FilterPopover } from '@/components/ui/FilterPopover';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'interno', label: 'Pendente/Interno' },
  { value: '1', label: 'Pendente/Cliente' },
  { value: '2', label: 'Revisão/Cliente' },
  { value: 'pv_agendado', label: 'Revisão/Agendado' },
  { value: '3', label: 'Assinado' },
  { value: '4', label: 'Reprovado' },
  { value: '5', label: 'Aprovação/Agendado' },
];

const TIPO_OPTIONS = [
  { value: '', label: 'Todos os tipos' },
  { value: 'I', label: 'Imóvel' },
  { value: 'V', label: 'Veículo' },
  { value: 'L', label: 'Lançamento' },
];

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDataHora(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtData(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const cor =
    status === 'Assinado' ? 'bg-success-bg text-success' :
    status === 'Reprovado' ? 'bg-destructive/10 text-destructive' :
    status.startsWith('Revisão') || status.startsWith('Aprovação') ? 'bg-warning-bg text-warning' :
    'bg-muted text-muted-foreground';
  return <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${cor}`}>{status}</span>;
}

function TipoBaseBadge({ tipoBase }: { tipoBase: string }) {
  if (!tipoBase) return <span className="text-muted-foreground text-xs">—</span>;
  const cor =
    tipoBase === 'TOP 20' ? 'bg-primary/10 text-primary' :
    tipoBase.startsWith('BASE FOCO') ? 'bg-warning-bg text-warning' :
    'bg-muted text-muted-foreground';
  return <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${cor}`}>{tipoBase}</span>;
}

function ConversaoBadge({ conversao }: { conversao: FilaLeadsRow['conversao'] }) {
  if (!conversao) return <span className="text-muted-foreground text-xs">—</span>;
  const cor = conversao === 'Base' ? 'bg-success-bg text-success' : 'bg-muted text-muted-foreground';
  return <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${cor}`}>{conversao}</span>;
}

export default function FilaLeadsPage() {
  const [dataInicial, setDataInicial] = useState(isoHoje);
  const [dataFinal, setDataFinal] = useState(isoHoje);
  const [busca, setBusca] = useState('');
  const [statusLink, setStatusLink] = useState('');
  const [tipo, setTipo] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [squadId, setSquadId] = useState('');

  const [vendedores, setVendedores] = useState<VendedorOption[]>([]);
  const [squads, setSquads] = useState<SquadOption[]>([]);
  const [dados, setDados] = useState<FilaLeadsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/fila-leads/vendedores').then((res) => setVendedores(res.data)).catch(() => {});
    axios.get('/api/fila-leads/squads').then((res) => setSquads(res.data)).catch(() => {});
  }, []);

  const carregar = useCallback(async () => {
    setError(null);
    try {
      const res = await axios.get('/api/fila-leads', {
        params: {
          dataInicial, dataFinal,
          busca: busca || undefined,
          statusLink: statusLink || undefined,
          tipo: tipo || undefined,
          vendedorId: vendedorId || undefined,
          squadId: squadId || undefined,
        },
      });
      setDados(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicial, dataFinal, busca, statusLink, tipo, vendedorId, squadId]);

  useEffect(() => {
    setReloading(true);
    const id = setTimeout(carregar, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicial, dataFinal, busca, statusLink, tipo, vendedorId, squadId]);

  const activeFilterCount = [statusLink, tipo, vendedorId, squadId].filter(Boolean).length;

  function limparFiltros() {
    setStatusLink('');
    setTipo('');
    setVendedorId('');
    setSquadId('');
  }

  const linhas = dados?.linhas ?? [];

  function exportarCsv() {
    if (!dados) return;
    const header = [
      'ID Cliente', 'Nome Fantasia', 'Razão Social', 'UF', 'Cidade', 'Bairro', 'Vendedor', 'Squad', 'Ciclo',
      'Status', 'Cadastro PV', 'Criação Link', 'Data Assinatura', 'Responsável',
      'Nome Tipo', 'Dias Bonificados', 'Plano Ativo', 'Valor Contrato',
      'CRM Cadastro', 'CRM Contato', 'CRM Conversão', 'Deal Flow',
      '20+', 'Conversão', 'Estoque', 'Cidade Foco', 'Tipo Base',
    ];
    const linhasCsv = linhas.map((r) => [
      r.idCliente, r.nomeFantasia, r.razaoSocial, r.siglaUf ?? '', r.nomeCidade ?? '', r.bairro ?? '',
      r.nomeVendedor, r.squad ?? '', r.ciclo ?? '',
      r.statusLink, fmtData(r.cadastroPv), fmtData(r.criacaoLink), fmtDataHora(r.dataAssinatura), r.responsavel ?? '',
      r.nomeTipo ?? '', r.diasBonificados, r.planoAtivoNome ?? '', r.valorContrato.toFixed(2),
      fmtData(r.crmCadastro), fmtData(r.crmContato), r.crmConversaoTitulo ?? '', r.crmDealFlow ?? '',
      r.top20 ? 'Sim' : 'Não', r.conversao ?? '', r.estoque ?? '', r.cidadeFoco ? 'Sim' : 'Não', r.tipoBase,
    ]);
    const csv = [header, ...linhasCsv].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `base-fila-leads-${dataInicial}-a-${dataFinal}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando base de fila de leads…</p>
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
          <h1 className="text-2xl font-semibold tracking-tight">Base diária de Fila de Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{linhas.length} registro(s) · {fmtData(dataInicial)} a {fmtData(dataFinal)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DatePicker value={dataInicial} onChange={setDataInicial} placeholder="Data inicial" maxDate={dataFinal} />
          <span className="text-muted-foreground text-xs">até</span>
          <DatePicker value={dataFinal} onChange={setDataFinal} placeholder="Data final" minDate={dataInicial} />
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, ID, CPF/CNPJ…"
              className="pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring w-[180px]"
            />
          </div>
          <FilterPopover activeCount={activeFilterCount} onClear={limparFiltros}>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
              <Select value={statusLink} onChange={setStatusLink} className="w-full mt-1" options={STATUS_OPTIONS} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo</label>
              <Select value={tipo} onChange={setTipo} className="w-full mt-1" options={TIPO_OPTIONS} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendedor</label>
              <Select
                value={vendedorId}
                onChange={setVendedorId}
                className="w-full mt-1"
                placeholder="Todos os vendedores"
                options={[{ value: '', label: 'Todos os vendedores' }, ...vendedores.map((v) => ({ value: String(v.id), label: v.nome }))]}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Squad</label>
              <Select
                value={squadId}
                onChange={setSquadId}
                className="w-full mt-1"
                placeholder="Todos os squads"
                options={[{ value: '', label: 'Todos os squads' }, ...squads.map((s) => ({ value: String(s.id), label: s.nome }))]}
              />
            </div>
          </FilterPopover>
          <button onClick={exportarCsv}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Download size={14} /> Exportar CSV
          </button>
          <button onClick={() => { setReloading(true); carregar(); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <ListChecks size={15} className="text-primary" /> Fila de leads
          </h2>
        </div>

        {linhas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Nenhum registro para este filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border">
                  <th className="px-5 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Vendedor</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Plano</th>
                  <th className="px-4 py-3 font-semibold">CRM Info</th>
                  <th className="px-4 py-3 font-semibold text-center">20+</th>
                  <th className="px-4 py-3 font-semibold">Conversão</th>
                  <th className="px-4 py-3 font-semibold text-right">Estoque</th>
                  <th className="px-5 py-3 font-semibold">Tipo Base</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map((r) => (
                  <tr key={r.idLink} className="hover:bg-muted/50 transition-colors align-top">
                    <td className="px-5 py-3">
                      <div className="font-medium">{r.nomeFantasia}</div>
                      <div className="text-xs text-muted-foreground">{r.razaoSocial}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {r.siglaUf && r.nomeCidade ? `${r.siglaUf} - ${r.nomeCidade}` : '—'}{r.bairro ? ` - ${r.bairro}` : ''}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">ID {r.idCliente}{r.cidadeFoco && <span className="ml-1 text-warning font-semibold">· Cidade Foco</span>}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium text-sm">{r.nomeVendedor}</div>
                      {r.squad && <div className="text-muted-foreground">{r.squad}</div>}
                      {r.ciclo && <div className="text-muted-foreground">Ciclo {r.ciclo}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs space-y-1">
                      <StatusBadge status={r.statusLink} />
                      <div className="text-muted-foreground">Cadastro do PV: <b className="text-foreground">{fmtData(r.cadastroPv)}</b></div>
                      <div className="text-muted-foreground">Criação do Link: <b className="text-foreground">{fmtData(r.criacaoLink)}</b></div>
                      <div className="text-muted-foreground">Assinatura: <b className="text-foreground">{fmtDataHora(r.dataAssinatura)}</b></div>
                      {r.responsavel && <div className="text-muted-foreground">Resp.: {r.responsavel}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div>{r.nomeTipo}{r.diasBonificados > 0 && ` com ${r.diasBonificados} dias bonificados`}</div>
                      <div className="text-muted-foreground">{r.planoAtivoNome ?? '—'}</div>
                      <div className="font-semibold">{fmtMoeda(r.valorContrato)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs space-y-0.5">
                      {r.crmCadastro && <div className="text-muted-foreground">Cadastro: <b className="text-foreground">{fmtData(r.crmCadastro)}</b></div>}
                      {r.crmContato && <div className="text-muted-foreground">Contato: {fmtData(r.crmContato)}</div>}
                      {r.crmConversaoTitulo && <div className="text-muted-foreground">Conversão: {r.crmConversaoTitulo}</div>}
                      {r.crmDealFlow && <div className="text-muted-foreground">Deal Flow: {r.crmDealFlow}</div>}
                      {!r.crmCadastro && !r.crmContato && <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.top20 ? <Crown size={16} className="text-warning inline-block" /> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3"><ConversaoBadge conversao={r.conversao} /></td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{r.estoque ?? '—'}</td>
                    <td className="px-5 py-3"><TipoBaseBadge tipoBase={r.tipoBase} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
