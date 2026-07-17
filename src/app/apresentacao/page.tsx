'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Maximize2, Minimize2, X } from 'lucide-react';

type Relatorio = { path: string; label: string };

const RELATORIOS: Relatorio[] = [
  { path: '/vendas', label: 'Relatório de Vendas' },
  { path: '/carrinho', label: 'Abandono de Carrinho' },
];

const INTERVALO_MS = 2 * 60 * 1000; // tempo que cada relatório fica em tela antes de trocar para o próximo

export default function ApresentacaoPage() {
  const [indice, setIndice] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setIndice((i) => (i + 1) % RELATORIOS.length);
    }, INTERVALO_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    }
  }

  const atual = RELATORIOS[indice];

  return (
    <div ref={containerRef} className="fixed inset-0 z-40 bg-background flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Modo Apresentação</span>
          <span className="text-xs text-muted-foreground">{atual.label} · {indice + 1}/{RELATORIOS.length}</span>
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
        <div className="flex items-center gap-2">
          <button onClick={toggleFullscreen}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
            {fullscreen ? <><Minimize2 size={13} /> Sair da tela cheia</> : <><Maximize2 size={13} /> Tela cheia</>}
          </button>
          <Link href="/"
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
            <X size={13} /> Sair
          </Link>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <iframe
          key={atual.path}
          src={`${atual.path}?apresentacao=1`}
          className="w-full h-full border-0"
          allow="fullscreen"
          title={atual.label}
        />
      </div>
      <style jsx global>{`
        @keyframes apresentacaoProgresso {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}
