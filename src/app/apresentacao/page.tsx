'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, TrendingUp, ShoppingCart, X } from 'lucide-react';

type Relatorio = { path: string; label: string; descricao: string; icon: typeof TrendingUp };

const RELATORIOS: Relatorio[] = [
  { path: '/vendas', label: 'Relatório de Vendas', descricao: 'KPIs, evolução de vendas e ranking de vendedores.', icon: TrendingUp },
  { path: '/carrinho', label: 'Abandono de Carrinho', descricao: 'Funil de recuperação e conversão por segmento.', icon: ShoppingCart },
];

// Cada relatório (vendas/carrinho) tem 3 slides internos trocando a cada 10s (ver TOTAL_SLIDES
// em src/app/vendas/page.tsx e src/app/carrinho/page.tsx), começando a contar assim que os dados
// terminam de carregar dentro do iframe. Por isso a troca de relatório aqui precisa acontecer no
// máximo nesses mesmos 3×10s: se demorasse mais (ex.: com uma folga extra), o ciclo interno de
// slides já teria dado a volta e voltado pro primeiro slide antes da troca, gerando um "flash"
// visível de volta ao slide 1 bem na hora de trocar de relatório.
const SLIDES_POR_RELATORIO = 3;
const DURACAO_SLIDE_MS = 10 * 1000;
const INTERVALO_MS = SLIDES_POR_RELATORIO * DURACAO_SLIDE_MS;

export default function ApresentacaoPage() {
  const [apresentando, setApresentando] = useState(false);
  const [indice, setIndice] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});

  // Rotação automática entre relatórios: só roda enquanto a apresentação está ativa.
  useEffect(() => {
    if (!apresentando) return;
    const id = setInterval(() => {
      setIndice((i) => (i + 1) % RELATORIOS.length);
    }, INTERVALO_MS);
    return () => clearInterval(id);
  }, [apresentando]);

  // Avisa o relatório que acabou de virar o ativo pra ele reiniciar seu ciclo de slides do zero.
  // Sem isso, o relatório continua rodando seu próprio timer de slides escondido em segundo plano
  // desde que carregou, e pode reaparecer já quase voltando pro primeiro slide.
  useEffect(() => {
    if (!apresentando) return;
    const atual = RELATORIOS[indice];
    const iframe = iframeRefs.current[atual.path];
    iframe?.contentWindow?.postMessage({ type: 'apresentacao:ativar' }, window.location.origin);
  }, [indice, apresentando]);

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
    setApresentando(true);
    containerRef.current?.requestFullscreen?.().catch(() => {});
  }

  function sair() {
    setApresentando(false);
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
                        style={{ animationDuration: `${INTERVALO_MS}ms` }}
                      />
                    )}
                    {i < indice && <span className="absolute inset-0 bg-primary rounded-full" />}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={sair}
              className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              <X size={13} /> Sair da apresentação
            </button>
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
