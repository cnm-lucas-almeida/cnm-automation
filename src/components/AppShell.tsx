"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Menu, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Breadcrumbs from "./Breadcrumbs";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

export default function AppShell(props: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <Suspense fallback={<>{props.children}</>}>
      <AppShellInner {...props} />
    </Suspense>
  );
}

function AppShellInner({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Fecha o drawer mobile ao trocar de rota.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lido após o mount para não gerar divergência de hidratação (servidor não conhece o localStorage).
  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  // Modo apresentação (iframes em tela cheia) e login não usam o shell.
  if (searchParams.get("apresentacao") === "1" || pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar fixa (desktop) */}
      <aside
        data-collapsed={collapsed}
        className={`hidden md:flex md:shrink-0 h-screen bg-card border-r border-border/50 flex-col group/sidebar transition-[width] duration-200 ${
          collapsed ? "md:w-16" : "md:w-64"
        }`}
      >
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{sidebar}</div>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="flex items-center gap-2 border-t border-border/50 px-3 py-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0 group-data-[collapsed=true]/sidebar:justify-center"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          <span className="group-data-[collapsed=true]/sidebar:hidden">Recolher menu</span>
        </button>
      </aside>

      {/* Drawer (mobile) */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-card border-r border-border/50 flex flex-col shadow-lg">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
              className="absolute right-3 top-3 p-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Coluna de conteúdo */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Top bar mobile com hambúrguer + logo */}
        <div className="md:hidden flex items-center gap-3 border-b border-border/50 bg-card px-4 py-3 shrink-0">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Menu size={20} />
          </button>
          <Link href="/" className="flex items-center">
            <Image src="/logo.png" alt="Chaves na Mão" width={224} height={120} priority className="h-8 w-auto" />
          </Link>
        </div>

        {/* Único container de scroll da aplicação, com barra oculta */}
        <main className="flex-1 min-h-0 overflow-y-auto scrollbar-hidden">
          <div className="mx-auto max-w-[1600px] 2xl:max-w-[2200px] px-4 sm:px-6 py-6">
            <Breadcrumbs className="mb-5" />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
