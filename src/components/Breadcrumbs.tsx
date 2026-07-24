"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { menus, getBreadcrumbTrail } from "@/lib/nav-menu";

export default function Breadcrumbs({ className = "" }: { className?: string }) {
  const pathname = usePathname();

  if (pathname === "/") {
    return (
      <nav className={`text-sm font-medium text-foreground ${className}`} aria-label="breadcrumb">
        Início
      </nav>
    );
  }

  const trail = getBreadcrumbTrail(menus, pathname);

  return (
    <nav className={`flex items-center gap-1.5 text-sm text-muted-foreground ${className}`} aria-label="breadcrumb">
      <Link href="/" className="hover:text-foreground transition-colors">
        Início
      </Link>
      {trail.map((label, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ChevronRight size={14} className="text-muted-foreground/60" />
          <span className={i === trail.length - 1 ? "text-foreground font-medium" : ""}>{label}</span>
        </span>
      ))}
    </nav>
  );
}
