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
    label: "Relatórios",
    items: [
      { label: "GLPI", href: "/glpi" },
      { label: "Vendas", href: "/vendas" },
      { label: "Abandono de Carrinho", href: "/carrinho" },
      { label: "Assinaturas PF", href: "/assinaturas" },
      { label: "Pagamentos", href: "/pagamentos" },
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
    ],
  },
];

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
