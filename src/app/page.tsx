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
  type LucideIcon,
} from "lucide-react";

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

export default function Home() {
  return (
    <div className="min-h-full bg-muted p-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold text-foreground">Painel de Automações — CNM</h1>
        <p className="mt-2 mb-10 text-muted-foreground">Selecione o projeto que deseja acessar.</p>

        <div className="flex flex-col gap-10">
          {groups.map((group) => (
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
    </div>
  );
}
