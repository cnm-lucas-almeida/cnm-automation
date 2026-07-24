import Link from "next/link";
import {
  Clock,
  Ticket,
  BarChart3,
  Signature,
  Receipt,
  FileCheck2,
  TrendingDown,
  PhoneCall,
  Sliders,
  ShoppingCart,
  Presentation,
  Users,
  ShieldCheck,
  ArrowUpDown,
  type LucideIcon,
} from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { canAccessScreen } from "@/lib/auth/permissions";

type CardItem = {
  key: string;
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

type CardGroup = {
  key: string;
  label: string;
  items: CardItem[];
};

const groups: CardGroup[] = [
  {
    key: "automacoes",
    label: "Automações",
    items: [
      {
        key: "secullum-ponto",
        name: "Intervalo de Almoço",
        description: "Verificação do intervalo de almoço nas batidas de ponto do dia anterior.",
        href: "/secullum/ponto-d1",
        icon: Clock,
      },
      {
        key: "secullum-banco-horas",
        name: "Banco de Horas — Copa",
        description: "Acompanhamento do banco de horas dos colaboradores durante a Copa.",
        href: "/secullum/banco-horas-copa",
        icon: Clock,
      },
    ],
  },
  {
    key: "relatorios",
    label: "Relatórios",
    items: [
      {
        key: "glpi",
        name: "GLPI — Helpdesk",
        description: "Acompanhamento do time: chamados em aberto, tendência mensal, performance por técnico e equipe.",
        href: "/glpi",
        icon: Ticket,
      },
      {
        key: "vendas",
        name: "Vendas",
        description: "Acompanhamento de vendas, assinaturas e desempenho comercial.",
        href: "/vendas",
        icon: BarChart3,
      },
      {
        key: "carrinho",
        name: "Abandono de Carrinho",
        description: "Recuperação de carrinhos abandonados e desempenho das cadências de contato.",
        href: "/carrinho",
        icon: ShoppingCart,
      },
      {
        key: "assinaturas",
        name: "Assinaturas PF",
        description: "Painel de assinaturas de pessoa física.",
        href: "/assinaturas",
        icon: Signature,
      },
      {
        key: "pagamentos",
        name: "Pagamentos",
        description: "Acompanhamento de pagamentos e recebíveis.",
        href: "/pagamentos",
        icon: Receipt,
      },
      {
        key: "aditivos",
        name: "Movimentações de Aditivo",
        description: "Upgrades e downgrades de plano: impacto em receita e estoque de anúncios.",
        href: "/aditivos",
        icon: ArrowUpDown,
      },
      {
        key: "nfse",
        name: "Verificação NFS-e",
        description: "Verificação de notas fiscais de serviço emitidas.",
        href: "/nfse",
        icon: FileCheck2,
      },
      {
        key: "inadimplencia",
        name: "Inadimplência — Padrão Bonificado",
        description: "Clientes que usam o período bonificado e nunca pagam, e o prejuízo em receita e comissão gerado por esse padrão.",
        href: "/inadimplencia",
        icon: TrendingDown,
      },
      {
        key: "inside-sales",
        name: "Inside Sales",
        description: "Desempenho e indicadores da equipe de Inside Sales.",
        href: "/inside-sales",
        icon: PhoneCall,
      },
    ],
  },
  {
    key: "apresentacao",
    label: "Apresentação",
    items: [
      {
        key: "apresentacao",
        name: "Modo Apresentação",
        description: "Tela em tela cheia que alterna automaticamente entre os relatórios com modo demonstração.",
        href: "/apresentacao",
        icon: Presentation,
      },
    ],
  },
  {
    key: "configuracoes",
    label: "Configurações",
    items: [
      {
        key: "metas",
        name: "Metas — Comercial",
        description: "Cadastro e ajuste das metas comerciais utilizadas nos relatórios.",
        href: "/configuracoes/comercial/metas",
        icon: Sliders,
      },
      {
        key: "usuarios",
        name: "Usuários",
        description: "Cadastro de usuários e atribuição de papéis de acesso.",
        href: "/configuracoes/usuarios",
        icon: Users,
      },
      {
        key: "papeis",
        name: "Papéis",
        description: "Papéis de acesso e as telas liberadas para cada um.",
        href: "/configuracoes/papeis",
        icon: ShieldCheck,
      },
    ],
  },
];

function Card({ item }: { item: CardItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="group flex flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/40"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <h3 className="text-base font-bold text-foreground">{item.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
      </div>
      <span className="text-sm font-medium text-primary group-hover:underline">Acessar →</span>
    </Link>
  );
}

export default async function Home() {
  const session = await getSession();
  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => canAccessScreen(session, item.href)) }))
    .filter((group) => group.items.length > 0);

  return (
    <div>
      <h1 className="text-3xl font-bold text-foreground">Painel de Automações — CNM</h1>
      <p className="mt-2 mb-10 text-muted-foreground">Selecione o projeto que deseja acessar.</p>

      <div className="flex flex-col gap-10">
        {visibleGroups.map((group) => (
          <section key={group.key}>
            <h2 className="mb-4 text-lg font-bold text-foreground">{group.label}</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <Card key={item.key} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
