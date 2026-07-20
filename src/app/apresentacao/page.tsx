'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, Pause, TrendingUp, ShoppingCart, Ticket, CreditCard, Landmark, X } from 'lucide-react';

type Relatorio = { path: string; label: string; descricao: string; icon: typeof TrendingUp };

const RELATORIOS: Relatorio[] = [
  { path: '/vendas', label: 'Relatório de Vendas', descricao: 'KPIs, evolução de vendas e ranking de vendedores.', icon: TrendingUp },
  { path: '/carrinho', label: 'Abandono de Carrinho', descricao: 'Funil de recuperação e conversão por segmento.', icon: ShoppingCart },
  { path: '/glpi', label: 'GLPI', descricao: 'Visão geral do mês, tendência mensal e desempenho por equipe.', icon: Ticket },
  { path: '/assinaturas', label: 'Assinaturas PF', descricao: 'Evolução de assinaturas, padrão por horário/dia e divisão de planos.', icon: CreditCard },
  { path: '/pagamentos', label: 'Relatório de Pagamentos', descricao: 'Um slide por tipo de pagamento: Geral, PF, PJ e Aditivo.', icon: Landmark },
];

// Cada relatório embutido tem seus próprios slides internos trocando a cada 10s (ver TOTAL_SLIDES
// em src/app/vendas/page.tsx e src/app/carrinho/page.tsx — sempre 3), começando a contar assim que
// os dados terminam de carregar dentro do iframe. O GLPI (src/app/glpi/page.tsx) é diferente: sua
// quantidade de slides varia mês a mês (um slide por equipe com movimento no mês), então ele avisa
// o número real via postMessage (`apresentacao:totalSlides`) assim que os dados carregam — até essa
// mensagem chegar, usamos DEFAULT_SLIDES_POR_RELATORIO como estimativa.
//
// A troca de relatório aqui precisa acontecer no máximo depois desse ciclo interno completo: se
// demorasse mais (ex.: com uma folga extra), o ciclo de slides já teria dado a volta e voltado pro
// primeiro slide antes da troca, gerando um "flash" visível de volta ao slide 1 bem na hora de trocar.
const DEFAULT_SLIDES_POR_RELATORIO = 3;
const DURACAO_SLIDE_MS = 10 * 1000;

export default function ApresentacaoPage() {
  const [apresentando, setApresentando] = useState(false);
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});

  // Número real de slides reportado por cada relatório (via postMessage), quando difere do
  // padrão. Fica num ref (e não só em state) porque o timer de troca precisa ler o valor mais
  // recente de dentro de um setTimeout, sem depender de re-render.
  const [slidesPorRelatorio, setSlidesPorRelatorio] = useState<Record<string, number>>({});
  const slidesPorRelatorioRef = useRef(slidesPorRelatorio);
  useEffect(() => { slidesPorRelatorioRef.current = slidesPorRelatorio; }, [slidesPorRelatorio]);

  function intervaloDe(path: string) {
    return (slidesPorRelatorioRef.current[path] ?? DEFAULT_SLIDES_POR_RELATORIO) * DURACAO_SLIDE_MS;
  }

  // Controle imperativo do relógio de troca de relatório, em vez de um setInterval simples, pra
  // dar pra pausar e retomar exatamente de onde parou (sem reiniciar do zero ao retomar).
  const restanteRef = useRef(intervaloDe(RELATORIOS[0].path));
  const inicioTickRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function limparTimer() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function armarTimer(ms: number) {
    limparTimer();
    inicioTickRef.current = Date.now();
    timeoutRef.current = setTimeout(() => {
      setIndice((i) => (i + 1) % RELATORIOS.length);
    }, ms);
  }

  // Rotação automática entre relatórios: só roda enquanto a apresentação está ativa e não
  // pausada. Reagir também a `indice` (em vez de só `apresentando`) é o que permite que cada
  // relatório tenha sua própria duração de ciclo — ao trocar de relatório, rearma o timer com o
  // intervalo daquele relatório específico.
  useEffect(() => {
    if (!apresentando) {
      limparTimer();
      return;
    }
    const atual = RELATORIOS[indice];
    restanteRef.current = intervaloDe(atual.path);
    armarTimer(restanteRef.current);
    return () => limparTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apresentando, indice]);

  // Escuta o aviso de cada relatório embutido informando quantos slides internos ele tem (só o
  // GLPI usa isso hoje, pois sua contagem varia mês a mês — vendas/carrinho ficam no padrão).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== 'apresentacao:totalSlides') return;
      const path = Object.keys(iframeRefs.current).find(
        (p) => iframeRefs.current[p]?.contentWindow === e.source
      );
      if (!path || typeof e.data.total !== 'number' || e.data.total <= 0) return;
      setSlidesPorRelatorio((prev) => (prev[path] === e.data.total ? prev : { ...prev, [path]: e.data.total }));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Avisa o relatório que acabou de virar o ativo pra ele reiniciar seu ciclo de slides do zero.
  // Sem isso, o relatório continua rodando seu próprio timer de slides escondido em segundo plano
  // desde que carregou, e pode reaparecer já quase voltando pro primeiro slide.
  useEffect(() => {
    if (!apresentando) return;
    const atual = RELATORIOS[indice];
    const iframe = iframeRefs.current[atual.path];
    iframe?.contentWindow?.postMessage({ type: 'apresentacao:ativar' }, window.location.origin);
  }, [indice, apresentando]);

  // Propaga o estado de pausa pro relatório em exibição, pra congelar também a troca de slides
  // internos dele (KPIs → squads → ranking) enquanto a apresentação estiver pausada.
  useEffect(() => {
    if (!apresentando) return;
    const atual = RELATORIOS[indice];
    const iframe = iframeRefs.current[atual.path];
    iframe?.contentWindow?.postMessage({ type: 'apresentacao:pausar', pausado }, window.location.origin);
  }, [pausado, indice, apresentando]);

  function alternarPausa() {
    if (pausado) {
      setPausado(false);
      armarTimer(restanteRef.current);
    } else {
      restanteRef.current = Math.max(0, restanteRef.current - (Date.now() - inicioTickRef.current));
      limparTimer();
      setPausado(true);
    }
  }

  // Se o usuário sair do fullscreen pelo Esc (sem passar pelo botão "Sair"), encerra a apresentação também.
  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) setApresentando(false);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  function iniciar(indiceInicial: number) {
    setIndice(indiceInicial);
    setPausado(false);
    setApresentando(true);
    containerRef.current?.requestFullscreen?.().catch(() => {});
  }

  function sair() {
    setApresentando(false);
    setPausado(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  return (
    <div ref={containerRef} className={apresentando ? 'fixed inset-0 z-40 bg-background flex flex-col' : ''}>
      {!apresentando ? (
        <div className="max-w-5xl mx-auto p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Modo Apresentação</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Escolha um relatório para começar ou inicie a apresentação completa em sequência.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {RELATORIOS.map((r, i) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.path}
                  onClick={() => iniciar(i)}
                  className="text-left rounded-lg border border-border p-6 hover:border-primary hover:shadow-md transition-all group"
                >
                  <Icon size={28} className="text-primary mb-3" />
                  <h2 className="font-semibold">{r.label}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{r.descricao}</p>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play size={12} /> Apresentar este relatório
                  </span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => iniciar(0)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Play size={15} /> Iniciar apresentação
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">Modo Apresentação</span>
              <span className="text-xs text-muted-foreground">{RELATORIOS[indice].label} · {indice + 1}/{RELATORIOS.length}</span>
              <div className="flex items-center gap-1">
                {RELATORIOS.map((r, i) => (
                  <span key={r.path} className="relative h-1.5 w-10 rounded-full bg-border overflow-hidden">
                    {i === indice && (
                      <span
                        key={`${r.path}-${indice}`}
                        className="absolute inset-y-0 left-0 bg-primary rounded-full animate-[apresentacaoProgresso_linear_forwards]"
                        style={{ animationDuration: `${intervaloDe(r.path)}ms`, animationPlayState: pausado ? 'paused' : 'running' }}
                      />
                    )}
                    {i < indice && <span className="absolute inset-0 bg-primary rounded-full" />}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={alternarPausa}
                className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                {pausado ? <><Play size={13} /> Retomar</> : <><Pause size={13} /> Pausar</>}
              </button>
              <button
                onClick={sair}
                className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                <X size={13} /> Sair da apresentação
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 relative">
            {RELATORIOS.map((r, i) => (
              <iframe
                key={r.path}
                ref={(el) => { iframeRefs.current[r.path] = el; }}
                src={`${r.path}?apresentacao=1`}
                className={`absolute inset-0 w-full h-full border-0 ${i === indice ? '' : 'invisible pointer-events-none'}`}
                title={r.label}
              />
            ))}
          </div>
        </>
      )}
      <style jsx global>{`
        @keyframes apresentacaoProgresso {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}
