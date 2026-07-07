# Estrutura de Pastas — Automações CNM

Todo novo projeto deve seguir o padrão abaixo. Cada sistema externo (Omie, Pipedrive, etc.) é um **projeto** com sua própria fatia em cada camada.

---

## Estrutura Geral

```
Automacoes_CNM/
├── src/
│   ├── app/
│   │   ├── page.tsx                    ← Hub: lista todos os projetos (não editar por projeto)
│   │   ├── layout.tsx                  ← Layout global + Navbar (adicionar link do novo projeto aqui)
│   │   │
│   │   ├── <projeto>/                  ← Páginas do projeto (ex: omie/, pipedrive/)
│   │   │   ├── page.tsx                ← Página principal do projeto (URL: /<projeto>)
│   │   │   └── <funcionalidade>/
│   │   │       └── page.tsx            ← Sub-página (URL: /<projeto>/<funcionalidade>)
│   │   │
│   │   └── api/
│   │       └── <projeto>/              ← API Routes do projeto (ex: api/omie/, api/pipedrive/)
│   │           ├── <recurso>/
│   │           │   └── route.ts
│   │           └── relatorios/
│   │               └── <nome>/
│   │                   └── route.ts
│   │
│   └── lib/
│       ├── <projeto>/                  ← Client/SDK do projeto (ex: lib/omie/, lib/pipedrive/)
│       │   └── index.ts                ← Ponto de entrada; importar com @/lib/<projeto>
│       ├── db.ts                       ← Conexão com banco (compartilhado, não mover)
│       └── logger.ts                   ← Logger (compartilhado, não mover)
│
├── scripts/
│   └── <projeto>/                      ← Scripts Python/Shell do projeto
│       ├── requirements.txt
│       └── *.py
│
└── logs/
    └── <projeto>/                      ← Logs de execução dos scripts
        └── *.csv / *.log
```

---

## Estado Atual

| Projeto | Pages | API Routes | Lib | Scripts | Logs |
|---------|-------|------------|-----|---------|------|
| **Omie** | `src/app/omie/` | `src/app/api/omie/` | `src/lib/omie/` | `scripts/omie/` | `logs/omie/` |

---

## Adicionando um Novo Projeto

### 1. Lib (cliente do sistema externo)
Crie `src/lib/<projeto>/index.ts` com as funções de comunicação com a API externa.

```typescript
// src/lib/pipedrive/index.ts
export async function listarNegocios() { ... }
```

Importe em qualquer lugar com:
```typescript
import { listarNegocios } from '@/lib/pipedrive';
```

### 2. API Routes
Crie as rotas em `src/app/api/<projeto>/`:

```
src/app/api/<projeto>/
├── <recurso>/route.ts       ← GET/POST para um recurso
└── relatorios/<nome>/route.ts
```

Cada `route.ts` importa de `@/lib/<projeto>` ou `@/lib/db` conforme necessário.

### 3. Pages (frontend)
Crie as páginas em `src/app/<projeto>/`:

```
src/app/<projeto>/
├── page.tsx                 ← Página principal (URL: /<projeto>)
└── <funcionalidade>/
    └── page.tsx             ← Sub-página (URL: /<projeto>/<funcionalidade>)
```

As chamadas de API dentro das pages devem sempre usar o prefixo `/api/<projeto>/`.

### 4. Navbar
Adicione o link no array do navbar em `src/app/layout.tsx`:

```tsx
<Link href="/<projeto>">Nome do Projeto</Link>
```

### 5. Hub (página inicial)
Adicione o projeto ao array `projects` em `src/app/page.tsx`:

```typescript
{
  key: '<projeto>',
  name: 'Nome do Sistema',
  description: 'Descrição curta das automações.',
  href: '/<projeto>',
  links: [
    { label: 'Funcionalidade X', href: '/<projeto>/funcionalidade-x' },
  ],
},
```

### 6. Scripts Python
Coloque em `scripts/<projeto>/` com um `requirements.txt` próprio se tiver dependências específicas.

### 7. Logs
Os scripts devem gravar logs em `logs/<projeto>/` seguindo o padrão de nome:
```
<nome_script>_YYYYMMDD_HHMMSS.csv
```

---

## Convenções

- **Nomes de pasta**: `kebab-case` (ex: `contas-a-pagar`, `relatorios`)
- **URLs de API**: sempre `/api/<projeto>/<recurso>` — nunca `/api/<recurso>` solto
- **Imports de lib**: sempre via alias `@/lib/<projeto>`, nunca caminho relativo
- **db.ts e logger.ts**: são utilitários globais, ficam direto em `src/lib/` e são importados por qualquer projeto
