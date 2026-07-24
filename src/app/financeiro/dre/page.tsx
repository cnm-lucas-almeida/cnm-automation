'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, AlertCircle, Upload, X, FileSpreadsheet, ChevronRight, ChevronDown, ShieldCheck, Receipt } from 'lucide-react';
import { Select } from '@/components/ui/Select';

type NoDre = {
  classificacao: string;
  nome: string;
  tipo: string | null;
  profundidade: number;
  valoresMensais: number[];
  acumulado: number;
};

// Códigos ancestrais de uma classificação, do mais raso ao mais profundo — ex.:
// "3.1.1.03" -> ["3", "3.1", "3.1.1"]. Usado pra saber se algum ancestral está recolhido.
function ancestrais(classificacao: string): string[] {
  const partes = classificacao.split('.');
  const result: string[] = [];
  for (let i = 1; i < partes.length; i++) result.push(partes.slice(0, i).join('.'));
  return result;
}

type ItemConferencia = {
  grupo: string;
  classificacao: string;
  ytdCalculado: number;
  balanceteDireto: number;
  diferenca: number;
  status: 'OK' | 'DIVERGE';
};

type DreResponse = {
  competencias: string[];
  arvore: NoDre[];
  fechamentos: {
    receitaLiquida: number[];
    totalCustos: number[];
    totalDespesas: number[];
    resultadoDoPeriodo: number[];
    lucroBruto: number[];
    resultadoFinanceiro: number[];
    ebit: number[];
    ebitda: number[];
    irpj: number[];
    csll: number[];
    resultadoLiquido: number[];
  };
  conferencia: ItemConferencia[];
};

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtMesLabel(competencia: string) {
  const [, m] = competencia.split('-');
  return MESES[Number(m) - 1];
}

function anoDaCompetencia(c: string) {
  return c.slice(0, 4);
}

function UploadModal({ onClose, onImportado }: { onClose: () => void; onImportado: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [competencia, setCompetencia] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function enviar() {
    if (!file || !competencia) {
      setErro('Selecione o arquivo e a competência.');
      return;
    }
    setEnviando(true);
    setErro(null);
    setSucesso(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('competencia', `${competencia}-01`);
      const res = await axios.post('/api/dre/balancete/importar', formData);
      setSucesso(`${res.data.linhasImportadas} linhas importadas.`);
      onImportado(); // recarrega a DRE em segundo plano; o modal só fecha quando o usuário clicar em "Fechar"
    } catch (err: any) {
      setErro(err.response?.data?.error || err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-primary" /> Importar balancete
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Envie o export do balancete (xlsx) com as colunas Conta, Classificação, Tipo, Nome da conta
          contábil, Saldo anterior, Débito, Crédito e Saldo atual.
        </p>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Competência</label>
          <input
            type="month"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Arquivo</label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {sucesso && <p className="text-sm text-success">{sucesso}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors">
            Fechar
          </button>
          <button
            onClick={enviar}
            disabled={enviando}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Importar
          </button>
        </div>
      </div>
    </div>
  );
}

function IrCsllModal({ onClose, onSalvo }: { onClose: () => void; onSalvo: () => void }) {
  const [competencia, setCompetencia] = useState('');
  const [irpj, setIrpj] = useState('');
  const [csll, setCsll] = useState('');
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function salvar() {
    if (!competencia) {
      setErro('Selecione a competência.');
      return;
    }
    setEnviando(true);
    setErro(null);
    setSucesso(null);
    try {
      await axios.post('/api/dre/ir-csll', {
        competencia: `${competencia}-01`,
        irpj: Number(irpj.replace(',', '.')) || 0,
        csll: Number(csll.replace(',', '.')) || 0,
        observacao: observacao || null,
      });
      setSucesso('Provisão salva.');
      onSalvo();
    } catch (err: any) {
      setErro(err.response?.data?.error || err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Lançar IR/CSLL</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Provisão de IRPJ + CSLL da apuração da contabilidade (Lucro Real). Não vem do balancete —
          preencha só para as competências em que a apuração já foi feita.
        </p>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Competência</label>
          <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)}
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">IRPJ (total)</label>
            <input type="text" value={irpj} onChange={(e) => setIrpj(e.target.value)} placeholder="0,00"
              className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">CSLL (total)</label>
            <input type="text" value={csll} onChange={(e) => setCsll(e.target.value)} placeholder="0,00"
              className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Observação (opcional)</label>
          <input type="text" value={observacao} onChange={(e) => setObservacao(e.target.value)}
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card" />
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {sucesso && <p className="text-sm text-success">{sucesso}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors">
            Fechar
          </button>
          <button onClick={salvar} disabled={enviando}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {enviando ? <Loader2 size={14} className="animate-spin" /> : null} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function ConferenciaModal({ itens, onClose }: { itens: ItemConferencia[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" /> Conferência
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Bate o acumulado calculado contra o saldo direto do balancete do último mês do período.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground uppercase tracking-wider border-b border-border text-[11px] sticky top-0 bg-card">
                <th className="font-semibold px-5 py-2.5">Grupo</th>
                <th className="font-semibold text-right px-4 py-2.5">Calculado (DRE)</th>
                <th className="font-semibold text-right px-4 py-2.5">Balancete</th>
                <th className="font-semibold text-right px-4 py-2.5">Diferença</th>
                <th className="font-semibold text-right px-5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {itens.map((item) => (
                <tr key={item.grupo} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-2">{item.grupo}</td>
                  <td className="text-right tabular-nums px-4 py-2">{fmtMoeda(item.ytdCalculado)}</td>
                  <td className="text-right tabular-nums px-4 py-2">{fmtMoeda(item.balanceteDireto)}</td>
                  <td className="text-right tabular-nums px-4 py-2">{fmtMoeda(item.diferenca)}</td>
                  <td className="text-right px-5 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${item.status === 'OK' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DrePage() {
  const [competenciasDisponiveis, setCompetenciasDisponiveis] = useState<string[]>([]);
  const [ano, setAno] = useState<string>(String(new Date().getFullYear()));
  const [dados, setDados] = useState<DreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [conferenciaAberta, setConferenciaAberta] = useState(false);
  const [irCsllModalAberto, setIrCsllModalAberto] = useState(false);
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const primeiraCarga = useRef(true);

  function toggleRecolhido(classificacao: string) {
    setRecolhidos((prev) => {
      const next = new Set(prev);
      if (next.has(classificacao)) next.delete(classificacao);
      else next.add(classificacao);
      return next;
    });
  }

  const carregarCompetencias = useCallback(async () => {
    const res = await axios.get('/api/dre/balancete');
    setCompetenciasDisponiveis(res.data.competencias);
    return res.data.competencias as string[];
  }, []);

  const carregarDre = useCallback(async (anoAlvo: string, competencias: string[]) => {
    setError(null);
    const doAno = competencias.filter((c) => anoDaCompetencia(c) === anoAlvo);
    if (doAno.length === 0) {
      setDados({
        competencias: [], arvore: [],
        fechamentos: {
          receitaLiquida: [], totalCustos: [], totalDespesas: [], resultadoDoPeriodo: [],
          lucroBruto: [], resultadoFinanceiro: [], ebit: [], ebitda: [], irpj: [], csll: [], resultadoLiquido: [],
        },
        conferencia: [],
      });
      setLoading(false);
      setReloading(false);
      return;
    }
    try {
      const inicio = `${anoAlvo}-01-01`;
      const fim = doAno[doAno.length - 1];
      const res = await axios.get('/api/dre', { params: { inicio, fim } });
      setDados(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  const recarregarTudo = useCallback(async (anoAlvo: string) => {
    const competencias = await carregarCompetencias();
    await carregarDre(anoAlvo, competencias);
  }, [carregarCompetencias, carregarDre]);

  useEffect(() => {
    if (primeiraCarga.current) {
      primeiraCarga.current = false;
      recarregarTudo(ano);
      return;
    }
    setReloading(true);
    carregarDre(ano, competenciasDisponiveis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano]);

  const anosDisponiveis = useMemo(() => {
    const anos = Array.from(new Set(competenciasDisponiveis.map(anoDaCompetencia))).sort();
    if (!anos.includes(ano)) anos.push(ano);
    return anos.sort();
  }, [competenciasDisponiveis, ano]);

  // Marca quais linhas têm filhos (pra mostrar o chevron) e filtra as que estão escondidas
  // porque algum ancestral foi recolhido.
  const linhasVisiveis = useMemo(() => {
    if (!dados) return [];
    const codigos = dados.arvore.map((n) => n.classificacao);
    return dados.arvore
      .map((n) => ({ ...n, temFilhos: codigos.some((c) => c !== n.classificacao && c.startsWith(`${n.classificacao}.`)) }))
      .filter((n) => !ancestrais(n.classificacao).some((a) => recolhidos.has(a)));
  }, [dados, recolhidos]);

  // Não fecha o modal aqui — deixa o usuário ver a mensagem de sucesso e fechar quando quiser.
  function aoImportarComSucesso() {
    setReloading(true);
    recarregarTudo(ano);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando DRE…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <AlertCircle size={40} className="text-destructive" />
        <p className="font-semibold text-foreground">Falha ao carregar dados</p>
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => { setLoading(true); recarregarTudo(ano); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    );
  }

  const semDados = !dados || dados.competencias.length === 0;

  return (
    <div className={`space-y-5 transition-opacity duration-150 ${reloading ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">DRE — Demonstração do Resultado</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Calculada a partir dos balancetes importados por competência</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={ano} onChange={setAno} className="min-w-[110px]"
            options={anosDisponiveis.map((a) => ({ value: a, label: a }))} />
          <button onClick={() => setConferenciaAberta(true)} disabled={semDados}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">
            <ShieldCheck size={14} /> Conferência
          </button>
          <button onClick={() => setIrCsllModalAberto(true)}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Receipt size={14} /> Lançar IR/CSLL
          </button>
          <button onClick={() => setModalAberto(true)}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <Upload size={14} /> Importar balancete
          </button>
          <button onClick={() => { setReloading(true); recarregarTudo(ano); }}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {semDados ? (
        <div className="rounded-lg border border-border p-10 text-center text-muted-foreground">
          <p className="font-medium text-foreground">Nenhum balancete importado para {ano}.</p>
          <p className="text-sm mt-1">Clique em "Importar balancete" para carregar o primeiro mês.</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground uppercase tracking-wider border-b border-border text-[11px]">
                  <th className="font-semibold px-5 py-2.5 sticky left-0 bg-card">Conta</th>
                  {dados!.competencias.map((c) => (
                    <th key={c} className="font-semibold text-right px-4 py-2.5 whitespace-nowrap">{fmtMesLabel(c)}</th>
                  ))}
                  <th className="font-semibold text-right px-5 py-2.5 whitespace-nowrap">Acum. período</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhasVisiveis.map((no) => {
                  const negativo = no.acumulado < 0;
                  const isTotal = no.tipo === 'T';
                  const recolhido = recolhidos.has(no.classificacao);
                  return (
                    <tr key={no.classificacao} className={`hover:bg-muted/50 transition-colors ${isTotal ? 'font-semibold' : ''}`}>
                      <td className="px-5 py-2 sticky left-0 bg-card whitespace-nowrap" style={{ paddingLeft: `${20 + (no.profundidade - 2) * 16}px` }}>
                        <span className="inline-flex items-center gap-1">
                          {no.temFilhos ? (
                            <button onClick={() => toggleRecolhido(no.classificacao)}
                              className="text-muted-foreground hover:text-foreground flex-shrink-0">
                              {recolhido ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                            </button>
                          ) : (
                            <span className="inline-block flex-shrink-0" style={{ width: 14 }} />
                          )}
                          {no.nome}
                        </span>
                      </td>
                      {no.valoresMensais.map((v, i) => (
                        <td key={i} className={`text-right tabular-nums px-4 py-2 ${v < 0 ? 'text-destructive' : ''}`}>{fmtMoeda(v)}</td>
                      ))}
                      <td className={`text-right tabular-nums px-5 py-2 font-semibold ${negativo ? 'text-destructive' : ''}`}>{fmtMoeda(no.acumulado)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-border">
                {[
                  { label: 'Receita Líquida', valores: dados!.fechamentos.receitaLiquida },
                  { label: 'Total Custos', valores: dados!.fechamentos.totalCustos },
                  { label: 'Lucro Bruto', valores: dados!.fechamentos.lucroBruto },
                  { label: 'Total Despesas Operacionais', valores: dados!.fechamentos.totalDespesas },
                  { label: 'EBIT (Resultado Operacional)', valores: dados!.fechamentos.ebit },
                  { label: 'EBITDA', valores: dados!.fechamentos.ebitda, memo: true },
                  { label: 'Resultado Financeiro', valores: dados!.fechamentos.resultadoFinanceiro },
                  { label: 'Resultado do Período', valores: dados!.fechamentos.resultadoDoPeriodo, destaque: true },
                  {
                    label: 'IR/CSLL',
                    valores: dados!.fechamentos.irpj.map((v, i) => -(v + dados!.fechamentos.csll[i])),
                  },
                  { label: 'Resultado Líquido do Exercício', valores: dados!.fechamentos.resultadoLiquido, destaque: true },
                ].map((linha) => {
                  const acumulado = linha.valores.reduce((a, b) => a + b, 0);
                  return (
                    <tr key={linha.label} className={`font-semibold ${linha.destaque ? 'bg-success/10 text-success' : ''} ${linha.memo ? 'text-muted-foreground border-y border-dashed border-border' : ''}`}>
                      <td className="px-5 py-2.5 sticky left-0 bg-card">
                        {linha.label}
                        {linha.memo && <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wider">(memo)</span>}
                      </td>
                      {linha.valores.map((v, i) => (
                        <td key={i} className={`text-right tabular-nums px-4 py-2.5 ${v < 0 ? 'text-destructive' : ''}`}>{fmtMoeda(v)}</td>
                      ))}
                      <td className={`text-right tabular-nums px-5 py-2.5 ${acumulado < 0 ? 'text-destructive' : ''}`}>{fmtMoeda(acumulado)}</td>
                    </tr>
                  );
                })}
              </tfoot>
            </table>
          </div>
        </>
      )}

      {modalAberto && <UploadModal onClose={() => setModalAberto(false)} onImportado={aoImportarComSucesso} />}
      {conferenciaAberta && dados && <ConferenciaModal itens={dados.conferencia} onClose={() => setConferenciaAberta(false)} />}
      {irCsllModalAberto && (
        <IrCsllModal onClose={() => setIrCsllModalAberto(false)} onSalvo={() => { setReloading(true); recarregarTudo(ano); }} />
      )}
    </div>
  );
}
