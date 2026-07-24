export type NavLink = { label: string; href: string };
export type NavSubmenu = { label: string; items: NavLink[] };
export type NavGroup = { label: string; items: (NavLink | NavSubmenu)[] };

export const isSubmenu = (item: NavLink | NavSubmenu): item is NavSubmenu =>
  "items" in item;

export const menus: NavGroup[] = [
  {
    label: "Automações",
    items: [
      {
        label: "RH",
        items: [
          { label: "Intervalo Almoço", href: "/secullum/ponto-d1" },
          { label: "Banco de Horas - Copa", href: "/secullum/banco-horas-copa" },
        ],
      },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { label: "DRE", href: "/financeiro/dre" },
      { label: "Projeção", href: "/financeiro/projecao" },
      { label: "Quadro Comercial", href: "/financeiro/quadro-comercial" },
    ],
  },
  {
    label: "Relatórios",
    items: [
      { label: "GLPI", href: "/glpi" },
      { label: "Vendas", href: "/vendas" },
      { label: "Abandono de Carrinho", href: "/carrinho" },
      { label: "Assinaturas PF", href: "/assinaturas" },
      { label: "Pagamentos", href: "/pagamentos" },
      { label: "Movimentações de Aditivo", href: "/aditivos" },
      { label: "Verificação NFS-e", href: "/nfse" },
      { label: "Inadimplência", href: "/inadimplencia" },
      { label: "Inside Sales", href: "/inside-sales" },
    ],
  },
  {
    label: "Apresentação",
    items: [
      { label: "Modo Apresentação", href: "/apresentacao" },
    ],
  },
  {
    label: "Configurações",
    items: [
      {
        label: "Comercial",
        items: [
          { label: "Metas", href: "/configuracoes/comercial/metas" },
        ],
      },
      { label: "Automações", href: "/configuracoes/automacoes" },
      {
        label: "Acesso",
        items: [
          { label: "Usuários", href: "/configuracoes/usuarios" },
          { label: "Papéis", href: "/configuracoes/papeis" },
        ],
      },
    ],
  },
];

// Monta a trilha de breadcrumb (grupo > submenu? > tela) a partir do pathname atual,
// varrendo a árvore de menus. Retorna [] quando a rota não está no menu (ex.: "/").
export function getBreadcrumbTrail(source: NavGroup[], pathname: string): string[] {
  for (const group of source) {
    for (const item of group.items) {
      if (isSubmenu(item)) {
        for (const link of item.items) {
          if (link.href === pathname) return [group.label, item.label, link.label];
        }
      } else if (item.href === pathname) {
        return [group.label, item.label];
      }
    }
  }
  return [];
}

// Achata os grupos/submenus numa lista simples de { grupo, label, href },
// usada pela tela de Papéis para listar as telas existentes e liberar por checkbox.
export function flattenNavLinks(source: NavGroup[]): { grupo: string; label: string; href: string }[] {
  const result: { grupo: string; label: string; href: string }[] = [];
  for (const group of source) {
    for (const item of group.items) {
      if (isSubmenu(item)) {
        for (const link of item.items) {
          result.push({ grupo: `${group.label} · ${item.label}`, label: link.label, href: link.href });
        }
      } else {
        result.push({ grupo: group.label, label: item.label, href: item.href });
      }
    }
  }
  return result;
}

// Remove links/submenus/grupos que o usuário não pode acessar, com base em canAccess(href).
export function filterMenusForAccess(
  source: NavGroup[],
  canAccess: (href: string) => boolean
): NavGroup[] {
  return source
    .map((group) => {
      const items = group.items
        .map((item) => {
          if (isSubmenu(item)) {
            const filteredSub = item.items.filter((link) => canAccess(link.href));
            return filteredSub.length > 0 ? { ...item, items: filteredSub } : null;
          }
          return canAccess(item.href) ? item : null;
        })
        .filter((item): item is NavLink | NavSubmenu => item !== null);
      return items.length > 0 ? { ...group, items } : null;
    })
    .filter((group): group is NavGroup => group !== null);
}
