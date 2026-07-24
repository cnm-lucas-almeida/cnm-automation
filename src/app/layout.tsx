import type { Metadata } from "next";
import { Suspense } from "react";
import { Open_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Image from "next/image";
import Link from "next/link";
import NavMenu from "@/components/NavMenu";
import AppShell from "@/components/AppShell";
import { menus, filterMenusForAccess } from "@/lib/nav-menu";
import { getSession } from "@/lib/auth/session";
import { canAccessScreen } from "@/lib/auth/permissions";
import { logout } from "@/lib/auth/actions";
import { LogOut } from "lucide-react";

const openSans = Open_Sans({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chaves na Mão - Painel de Gestão",
  description: "Painel de gestão e relatórios",
};

async function SidebarContent() {
  const session = await getSession();
  const visibleMenus = filterMenusForAccess(menus, (href) => canAccessScreen(session, href));
  return (
    <>
      <Link href="/" className="flex items-center px-6 py-8 shrink-0">
        <Image src="/logo.png" alt="Chaves na Mão" width={224} height={120} priority className="h-14 w-auto" />
      </Link>
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-5 scrollbar-hidden">
        <NavMenu menus={visibleMenus} />
      </nav>
      {session && (
        <form action={logout} className="border-t border-border/50 p-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground truncate">{session.username}</span>
          <button
            type="submit"
            className="flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <LogOut size={14} /> Sair
          </button>
        </form>
      )}
    </>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${openSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-screen">
        <AppShell sidebar={<Suspense fallback={null}><SidebarContent /></Suspense>}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
