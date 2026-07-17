import type { Metadata } from "next";
import { Open_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Image from "next/image";
import Link from "next/link";
import NavMenu from "@/components/NavMenu";
import { menus, filterMenusForAccess } from "@/lib/nav-menu";
import { canAccess } from "@/lib/admin";

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

function Navbar() {
  const visibleMenus = filterMenusForAccess(menus, canAccess);
  return (
    <nav className="bg-card border-b border-border px-6 py-3 flex items-center gap-8 shadow-sm">
      <Link href="/" className="flex items-center">
        <Image src="/logo.png" alt="Chaves na Mão" width={224} height={120} priority className="h-12 w-auto" />
      </Link>
      <NavMenu menus={visibleMenus} />
    </nav>
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
      <body className="min-h-full flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
