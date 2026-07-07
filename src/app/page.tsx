import Link from 'next/link';

const projects = [
  {
    key: 'secullum',
    name: 'Secullum — Ponto',
    description: 'Análise de batidas de ponto e cálculo de Vale Refeição por período.',
    href: '/secullum',
    links: [
      { label: 'Cálculo de VR', href: '/secullum' },
    ],
  },
  {
    key: 'glpi',
    name: 'GLPI — Helpdesk',
    description: 'Acompanhamento do time: chamados em aberto, tendência mensal, performance por técnico e equipe.',
    href: '/glpi',
    links: [
      { label: 'Dashboard de Equipe', href: '/glpi' },
    ],
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 p-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Painel de Automações — CNM</h1>
        <p className="text-slate-500 mb-10">Selecione o projeto que deseja acessar.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projects.map((project) => (
            <div key={project.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">{project.name}</h2>
                <p className="text-sm text-slate-500 mt-1">{project.description}</p>
              </div>
              <ul className="flex flex-col gap-2">
                {project.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                    >
                      {link.label} →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
