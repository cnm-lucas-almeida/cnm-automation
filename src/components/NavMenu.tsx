"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { isSubmenu, type NavGroup } from "@/lib/nav-menu";

export default function NavMenu({ menus }: { menus: NavGroup[] }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
        setOpenSubmenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const closeAll = () => {
    setOpenMenu(null);
    setOpenSubmenu(null);
  };

  return (
    <div ref={rootRef} className="flex items-center gap-4 text-sm font-semibold">
      <Link href="/" className="text-muted-foreground hover:text-primary transition-colors" onClick={closeAll}>
        Início
      </Link>

      {menus.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            type="button"
            onClick={() =>
              setOpenMenu((current) => {
                const next = current === menu.label ? null : menu.label;
                setOpenSubmenu(null);
                return next;
              })
            }
            className="text-muted-foreground hover:text-primary transition-colors cursor-pointer"
          >
            {menu.label}
          </button>

          {openMenu === menu.label && (
            <div className="absolute left-0 top-full mt-2 min-w-48 rounded-lg border border-border bg-card shadow-md py-1 z-50">
              {menu.items.map((item) =>
                isSubmenu(item) ? (
                  <div key={item.label} className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSubmenu((current) => (current === item.label ? null : item.label))
                      }
                      className="w-full flex items-center justify-between px-4 py-2 text-left text-foreground hover:bg-accent transition-colors cursor-pointer"
                    >
                      {item.label}
                      <span className="text-muted-foreground text-xs">▶</span>
                    </button>

                    {openSubmenu === item.label && (
                      <div className="absolute left-full top-0 ml-1 min-w-48 rounded-lg border border-border bg-card shadow-md py-1 z-50">
                        {item.items.map((subItem) => (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            onClick={closeAll}
                            className="block px-4 py-2 text-foreground hover:bg-accent transition-colors"
                          >
                            {subItem.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeAll}
                    className="block px-4 py-2 text-foreground hover:bg-accent transition-colors"
                  >
                    {item.label}
                  </Link>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
