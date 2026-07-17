'use client';

import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';

// Relatórios embutidos via iframe em /apresentacao carregam com ?apresentacao=1 e são
// documentos completos (passam pelo RootLayout de novo) — sem isso, a topbar global
// apareceria duplicada dentro do iframe durante a apresentação em tela cheia.
export default function HideInApresentacao({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  if (searchParams.get('apresentacao') === '1') return null;
  return <>{children}</>;
}
