"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Clock,
  Headset,
  AlarmClockOff,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  title?: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    items: [{ href: "/", label: "Início", icon: Home }],
  },
  {
    title: "Operações",
    items: [
      { href: "/secullum", label: "VR Ponto", icon: Clock },
      { href: "/secullum/ponto-d1", label: "Intervalo Almoço", icon: AlarmClockOff },
      { href: "/glpi", label: "GLPI", icon: Headset },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col bg-background">
      <Link href="/" className="flex items-center justify-center px-6 py-6">
        <Image src="/logo.png" alt="Chaves na Mão" width={224} height={120} priority className="h-16 w-auto" />
      </Link>
      <nav className="flex-1 rounded-tr-[4rem] bg-[#333232] flex flex-col gap-1 px-3 py-4 overflow-y-auto">
        {groups.map((group, index) => (
          <div key={group.title ?? index} className={index > 0 ? "mt-4" : undefined}>
            {group.title && (
              <p className="px-3 mb-1 text-[11px] font-bold uppercase tracking-wider text-white/50">
                {group.title}
              </p>
            )}
            {group.items.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-primary text-white shadow-sm"
                      : "text-white/85 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
