"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChevronDown,
  Home,
  Users,
  Clock,
  Hourglass,
  Ticket,
  BarChart3,
  ShoppingCart,
  Signature,
  Receipt,
  ArrowUpDown,
  FileCheck2,
  TrendingDown,
  PhoneCall,
  Presentation,
  Briefcase,
  Sliders,
  Settings2,
  KeyRound,
  ShieldCheck,
  Landmark,
  TrendingUp,
  Users2,
  Megaphone,
  Snowflake,
  Wallet,
  Target,
  CalendarDays,
  Percent,
  type LucideIcon,
} from "lucide-react";
import { isSubmenu, type NavGroup, type NavLink as NavLinkType, type NavSubmenu } from "@/lib/nav-menu";

// Ícones resolvidos aqui (client component) por label, e não no lib/nav-menu.ts, porque
// componentes do lucide-react não podem atravessar a fronteira Server -> Client como props.
const ICONS: Record<string, LucideIcon> = {
  "Início": Home,
  "GLPI": Ticket,
  "Vendas": BarChart3,
  "Abandono de Carrinho": ShoppingCart,
  "Assinaturas PF": Signature,
  "Congelamentos": Snowflake,
  "Pagamentos": Receipt,
  "Movimentações de Aditivo": ArrowUpDown,
  "Verificação NFS-e": FileCheck2,
  "Inadimplência": TrendingDown,
  "Painel mensal": PhoneCall,
  "IS 30/60/90": Target,
  "Vendas Dia a Dia": CalendarDays,
  "Modo Apresentação": Presentation,
  "RH": Users,
  "Intervalo Almoço": Clock,
  "Banco de Horas": Hourglass,
  "Fechamento de Folha": Wallet,
  "Comercial": Briefcase,
  "Metas": Sliders,
  "Automações": Settings2,
  "Acesso": KeyRound,
  "Usuários": Users,
  "Papéis": ShieldCheck,
  "DRE": Landmark,
  "Projeção": TrendingUp,
  "Quadro Comercial": Users2,
  "Comissões": Percent,
  "Investimento em Mídia": Megaphone,
};

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
}

function LeafLink({ item, pathname }: { item: NavLinkType; pathname: string }) {
  const Icon = ICONS[item.label];
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      title={item.label}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-2 ${
        active
          ? "bg-muted text-foreground font-semibold"
          : "text-muted-foreground hover:bg-accent hover:text-foreground font-medium"
      }`}
    >
      {Icon && <Icon size={17} className={active ? "text-primary" : ""} />}
      <span className="group-data-[collapsed=true]/sidebar:hidden">{item.label}</span>
    </Link>
  );
}

function SubmenuBlock({ item, pathname }: { item: NavSubmenu; pathname: string }) {
  const hasActiveChild = item.items.some((link) => isActive(pathname, link.href));
  const [open, setOpen] = useState(hasActiveChild);
  const Icon = ICONS[item.label];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        title={item.label}
        className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-2 ${
          hasActiveChild ? "text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
      >
        {Icon && <Icon size={17} />}
        <span className="flex-1 text-left group-data-[collapsed=true]/sidebar:hidden">{item.label}</span>
        <ChevronDown
          size={14}
          className={`transition-transform group-data-[collapsed=true]/sidebar:hidden ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-1 ml-4 flex flex-col gap-1 border-l border-border/50 pl-4 group-data-[collapsed=true]/sidebar:hidden">
          {item.items.map((link) => (
            <LeafLink key={link.href} item={link} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function NavMenu({ menus }: { menus: NavGroup[] }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6">
      <LeafLink item={{ label: "Início", href: "/" }} pathname={pathname} />

      {menus.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <span className="px-3 text-xs font-semibold text-muted-foreground/80 group-data-[collapsed=true]/sidebar:hidden">
            {group.label}
          </span>
          {group.items.map((item) =>
            isSubmenu(item) ? (
              <SubmenuBlock key={item.label} item={item} pathname={pathname} />
            ) : (
              <LeafLink key={item.href} item={item} pathname={pathname} />
            )
          )}
        </div>
      ))}
    </div>
  );
}
