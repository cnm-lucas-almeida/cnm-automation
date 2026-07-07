const GLPI_URL = process.env.GLPI_URL!;
const GLPI_APP_TOKEN = process.env.GLPI_APP_TOKEN!;
const GLPI_USER_TOKEN = process.env.GLPI_USER_TOKEN!;

const CACHE_TTL = 5 * 60 * 1000;

export type TicketItem = {
  id: number;
  nome: string;
  prioridade: number;
  dataAbertura: string;
  dias: number;
};

export type TicketResolvidoItem = {
  id: number;
  nome: string;
  dataResolucao: string;
  diasResolucao: number;
};

export type TechRow = {
  id: string; nome: string; grupo: string;
  emAberto: number; resolvidos: number; tmaDias: number; oldestDias: number;
  ticketsAbertos: TicketItem[];
  ticketsResolvidos: TicketResolvidoItem[];
};

export type DashboardData = {
  generatedAt: string;
  glpiUrl: string;
  kpis: {
    total: number; emAberto: number; statusNovo: number;
    fechadosHoje: number;
    abertosHa7dias: number; abertosHa15dias: number; abertosHa30dias: number;
  };
  porStatus: Array<{ status: number; nome: string; count: number }>;
  porPrioridade: Array<{ priority: number; nome: string; count: number }>;
  porCategoria: Array<{ nome: string; count: number }>;
  porMes: Array<{ mes: string; abertos: number; resolvidos: number; fechados: number; total: number; resolvidosNoMes: number }>;
  porGrupo: Array<{ nome: string; count: number }>;
  grupos: Array<{ id: string; nome: string }>;
  porTecnico: TechRow[];
};

const _cache = new Map<string, { data: DashboardData; ts: number }>();

async function glpiFetch(path: string, session: string) {
  const res = await fetch(`${GLPI_URL}/apirest.php${path}`, {
    headers: {
      'App-Token': GLPI_APP_TOKEN,
      'Session-Token': session,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GLPI ${res.status}: ${path}`);
  return res.json();
}

async function initSession(): Promise<string> {
  const res = await fetch(`${GLPI_URL}/apirest.php/initSession`, {
    headers: {
      'App-Token': GLPI_APP_TOKEN,
      Authorization: `user_token ${GLPI_USER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!data.session_token) throw new Error('GLPI initSession failed');
  return data.session_token;
}

async function killSession(token: string) {
  await fetch(`${GLPI_URL}/apirest.php/killSession`, {
    headers: { 'App-Token': GLPI_APP_TOKEN, 'Session-Token': token },
    cache: 'no-store',
  }).catch(() => {});
}

function searchUrl(
  criteria: { field: string; searchtype: string; value: string }[],
  fields: number[]
) {
  const parts: string[] = [];
  criteria.forEach((c, i) => {
    parts.push(
      `criteria[${i}][field]=${c.field}`,
      `criteria[${i}][searchtype]=${c.searchtype}`,
      `criteria[${i}][value]=${encodeURIComponent(c.value)}`
    );
  });
  fields.forEach((f, i) => parts.push(`forcedisplay[${i}]=${f}`));
  parts.push('range=0-9999');
  return `/search/Ticket?${parts.join('&')}`;
}

const STATUS_NAMES: Record<number, string> = {
  1: 'Novo',
  2: 'Em andamento (atribuído)',
  3: 'Em andamento (planejado)',
  4: 'Pendente',
  5: 'Resolvido',
  6: 'Fechado',
};

const PRIORITY_NAMES: Record<number, string> = {
  1: 'Muito Alta',
  2: 'Alta',
  3: 'Média',
  4: 'Baixa',
  5: 'Muito Baixa',
  6: 'Maior',
};

function aggregate(
  tickets: any[],
  users: any[],
  groups: any[],
  resolvedRows: any[],
  openRows: any[],
  glpiUrl: string
) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // User ID → display name
  const userMap: Record<number, string> = {};
  for (const u of users || []) {
    userMap[u.id] =
      [u.firstname, u.realname].filter(Boolean).join(' ') || u.name || `#${u.id}`;
  }

  // Ticket ID → name + priority
  const ticketMap: Record<number, { nome: string; prioridade: number }> = {};
  for (const t of tickets) {
    ticketMap[t.id] = { nome: t.name || `Chamado #${t.id}`, prioridade: t.priority ?? 3 };
  }

  // ── Global aggregations ────────────────────────────────────────

  const abertos = tickets.filter((t) => [1, 2, 3, 4].includes(t.status));

  const openTicketDays = abertos.map((t) => ({
    id: t.id,
    dias: Math.floor((now.getTime() - new Date(t.date_creation).getTime()) / 86400000),
  }));

  // Status
  const statusMap: Record<number, number> = {};
  for (const t of tickets) statusMap[t.status] = (statusMap[t.status] || 0) + 1;
  const porStatus = Object.entries(statusMap)
    .map(([s, count]) => ({
      status: Number(s),
      nome: STATUS_NAMES[Number(s)] || `Status ${s}`,
      count,
    }))
    .sort((a, b) => a.status - b.status);

  // Priority
  const prioMap: Record<number, number> = {};
  for (const t of tickets) prioMap[t.priority] = (prioMap[t.priority] || 0) + 1;
  const porPrioridade = Object.entries(prioMap)
    .map(([p, count]) => ({
      priority: Number(p),
      nome: PRIORITY_NAMES[Number(p)] || `Prio ${p}`,
      count,
    }))
    .sort((a, b) => a.priority - b.priority);

  // Category
  const catMap: Record<string, number> = {};
  for (const t of tickets) {
    const cat =
      t.itilcategories_id && t.itilcategories_id !== '0' && t.itilcategories_id !== 0
        ? String(t.itilcategories_id)
        : 'Sem categoria';
    catMap[cat] = (catMap[cat] || 0) + 1;
  }
  const porCategoria = Object.entries(catMap)
    .map(([nome, count]) => ({ nome, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Monthly trend
  const mesMap: Record<string, { abertos: number; resolvidos: number; fechados: number; total: number }> =
    {};
  for (const t of tickets) {
    const mes = t.date_creation?.slice(0, 7);
    if (!mes) continue;
    if (!mesMap[mes]) mesMap[mes] = { abertos: 0, resolvidos: 0, fechados: 0, total: 0 };
    mesMap[mes].total++;
    if ([1, 2, 3, 4].includes(t.status)) mesMap[mes].abertos++;
    else if (t.status === 5) mesMap[mes].resolvidos++;
    else if (t.status === 6) mesMap[mes].fechados++;
  }
  // Resolved tickets grouped by resolution date (not creation date)
  const mesResolvidoMap: Record<string, number> = {};
  for (const row of resolvedRows || []) {
    const mes = String(row['17'] ?? '').slice(0, 7);
    if (mes) mesResolvidoMap[mes] = (mesResolvidoMap[mes] || 0) + 1;
  }

  const porMes = Object.entries(mesMap)
    .map(([mes, d]) => ({ mes, ...d, resolvidosNoMes: mesResolvidoMap[mes] || 0 }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  // Open by group (from search, field 8 = group name)
  const groupOpenMap: Record<string, number> = {};
  for (const row of openRows || []) {
    const raw = String(row['8'] ?? '').trim();
    if (!raw) continue;
    const main = raw.split(' > ')[0].trim();
    if (main) groupOpenMap[main] = (groupOpenMap[main] || 0) + 1;
  }
  const porGrupo = Object.entries(groupOpenMap)
    .map(([nome, count]) => ({ nome, count }))
    .sort((a, b) => b.count - a.count);

  // Groups for filter dropdown
  const grupos = (groups || [])
    .filter((g: any) => g.is_assign)
    .map((g: any) => ({ id: String(g.id), nome: String(g.name) }));

  // ── Open tickets per technician ────────────────────────────────

  const techOpenMap: Record<string, {
    count: number; group: string; oldestDias: number;
    tickets: { id: number; openDate: string }[];
  }> = {};
  for (const row of openRows || []) {
    const ticketId = Number(row['2'] ?? 0);
    const techStr = String(row['5'] ?? '').trim();
    const group = String(row['8'] ?? '');
    const openDateStr = String(row['15'] ?? '');
    if (!techStr) continue;
    const dias = openDateStr
      ? Math.floor((now.getTime() - new Date(openDateStr).getTime()) / 86400000)
      : 0;
    for (const tid of techStr.split(/\s+/).filter(Boolean)) {
      if (!techOpenMap[tid]) techOpenMap[tid] = { count: 0, group, oldestDias: 0, tickets: [] };
      techOpenMap[tid].count++;
      if (dias > techOpenMap[tid].oldestDias) techOpenMap[tid].oldestDias = dias;
      if (ticketId) techOpenMap[tid].tickets.push({ id: ticketId, openDate: openDateStr });
    }
  }

  // ── Resolved stats per tech per period ────────────────────────

  function resolvedStats(rows: any[]) {
    const m: Record<string, {
      count: number; totalDelay: number; group: string;
      tickets: { id: number; solveDate: string; diasResolucao: number }[];
    }> = {};
    for (const row of rows) {
      const ticketId = Number(row['2'] ?? 0);
      const techStr = String(row['5'] ?? '').trim();
      const delay = Number(row['154'] ?? 0);
      const group = String(row['8'] ?? '');
      const solveDate = String(row['17'] ?? '');
      if (!techStr) continue;
      for (const tid of techStr.split(/\s+/).filter(Boolean)) {
        if (!m[tid]) m[tid] = { count: 0, totalDelay: 0, group, tickets: [] };
        m[tid].count++;
        if (delay > 0) m[tid].totalDelay += delay;
        if (ticketId) m[tid].tickets.push({
          id: ticketId,
          solveDate,
          diasResolucao: delay > 0 ? Math.round(delay / 86400) : 0,
        });
      }
    }
    return m;
  }

  const resolved = resolvedStats(resolvedRows || []);

  function buildTechTable(resMap: Record<string, any>) {
    const allIds = new Set([...Object.keys(resMap), ...Object.keys(techOpenMap)]);
    return Array.from(allIds)
      .map((tid) => {
        const res = resMap[tid];
        const open = techOpenMap[tid];
        const avgDelay = res?.count > 0 ? res.totalDelay / res.count : 0;

        const ticketsAbertos: TicketItem[] = (open?.tickets || []).map(
          ({ id, openDate }: { id: number; openDate: string }) => ({
            id,
            nome: ticketMap[id]?.nome || `Chamado #${id}`,
            prioridade: ticketMap[id]?.prioridade ?? 3,
            dataAbertura: openDate,
            dias: openDate
              ? Math.floor((now.getTime() - new Date(openDate).getTime()) / 86400000)
              : 0,
          })
        ).sort((a: TicketItem, b: TicketItem) => b.dias - a.dias);

        const ticketsResolvidos: TicketResolvidoItem[] = (res?.tickets || []).map(
          ({ id, solveDate, diasResolucao }: { id: number; solveDate: string; diasResolucao: number }) => ({
            id,
            nome: ticketMap[id]?.nome || `Chamado #${id}`,
            dataResolucao: solveDate,
            diasResolucao,
          })
        ).sort((a: TicketResolvidoItem, b: TicketResolvidoItem) =>
          b.dataResolucao.localeCompare(a.dataResolucao)
        );

        return {
          id: tid,
          nome: userMap[Number(tid)] || `Técnico #${tid}`,
          grupo: (open?.group || res?.group || '').split(' > ')[0].trim(),
          emAberto: open?.count || 0,
          resolvidos: res?.count || 0,
          tmaDias: avgDelay > 0 ? Math.round((avgDelay / 86400) * 10) / 10 : 0,
          oldestDias: open?.oldestDias || 0,
          ticketsAbertos,
          ticketsResolvidos,
        };
      })
      .sort((a, b) => b.emAberto - a.emAberto || b.resolvidos - a.resolvidos);
  }

  // KPIs
  const kpis = {
    total: tickets.length,
    emAberto: abertos.length,
    statusNovo: tickets.filter((t) => t.status === 1).length,
    fechadosHoje: tickets.filter((t) => t.closedate?.startsWith(today)).length,
    abertosHa7dias: openTicketDays.filter((t) => t.dias > 7).length,
    abertosHa15dias: openTicketDays.filter((t) => t.dias > 15).length,
    abertosHa30dias: openTicketDays.filter((t) => t.dias > 30).length,
  };

  return {
    generatedAt: now.toISOString(),
    glpiUrl,
    kpis,
    porStatus,
    porPrioridade,
    porCategoria,
    porMes,
    porGrupo,
    grupos,
    porTecnico: buildTechTable(resolved),
  };
}

export async function getDashboardData(
  grupoNome?: string,
  mes?: string,
  dataInicio?: string,
  dataFim?: string,
): Promise<DashboardData> {
  const cacheKey = `${grupoNome || ''}_${mes || ''}_${dataInicio || ''}_${dataFim || ''}`;
  const now = Date.now();
  const cached = _cache.get(cacheKey);
  if (cached && now - cached.ts < CACHE_TTL) return cached.data;

  const session = await initSession();
  try {
    const [tickets, users, groups, resolvedRes, openRes] = await Promise.all([
      glpiFetch('/Ticket?range=0-9999&expand_dropdowns=true', session),
      glpiFetch('/User?range=0-9999', session),
      glpiFetch('/Group?range=0-9999', session),
      glpiFetch(
        searchUrl(
          [{ field: '12', searchtype: 'equals', value: 'old' }],
          [2, 5, 8, 154, 17]
        ),
        session
      ),
      glpiFetch(
        searchUrl(
          [{ field: '12', searchtype: 'equals', value: 'notold' }],
          [2, 5, 8, 15]
        ),
        session
      ),
    ]);

    const allTickets = Array.isArray(tickets) ? tickets : [];
    const allResolvedRows = Array.isArray(resolvedRes?.data) ? resolvedRes.data : [];
    const allOpenRows = Array.isArray(openRes?.data) ? openRes.data : [];

    let filteredTickets = allTickets;
    let filteredOpenRows = allOpenRows;
    let filteredResolvedRows = allResolvedRows;

    if (grupoNome) {
      // Build ticket → group map from all search rows (open ∪ resolved = all tickets)
      const ticketGroupMap: Record<number, string> = {};
      for (const row of [...allOpenRows, ...allResolvedRows]) {
        const id = Number(row['2']);
        const group = String(row['8'] ?? '').split(' > ')[0].trim();
        if (id && group) ticketGroupMap[id] = group;
      }
      filteredTickets = allTickets.filter((t: any) => ticketGroupMap[t.id] === grupoNome);
      filteredOpenRows = allOpenRows.filter(
        (row: any) => String(row['8'] ?? '').split(' > ')[0].trim() === grupoNome
      );
      filteredResolvedRows = allResolvedRows.filter(
        (row: any) => String(row['8'] ?? '').split(' > ')[0].trim() === grupoNome
      );
    }

    if (mes) {
      filteredTickets = filteredTickets.filter(
        (t: any) => String(t.date_creation ?? '').slice(0, 7) === mes
      );
      filteredOpenRows = filteredOpenRows.filter(
        (row: any) => String(row['15'] ?? '').slice(0, 7) === mes
      );
      filteredResolvedRows = filteredResolvedRows.filter(
        (row: any) => String(row['17'] ?? '').slice(0, 7) === mes
      );
    }

    if (dataInicio || dataFim) {
      const inRange = (dateStr: string) => {
        const d = String(dateStr ?? '').slice(0, 10);
        if (!d) return false;
        if (dataInicio && d < dataInicio) return false;
        if (dataFim && d > dataFim) return false;
        return true;
      };
      filteredTickets = filteredTickets.filter((t: any) => inRange(t.date_creation));
      filteredOpenRows = filteredOpenRows.filter((row: any) => inRange(row['15']));
      filteredResolvedRows = filteredResolvedRows.filter((row: any) => inRange(row['17']));
    }

    const data = aggregate(
      filteredTickets,
      Array.isArray(users) ? users : [],
      Array.isArray(groups) ? groups : [],
      filteredResolvedRows,
      filteredOpenRows,
      GLPI_URL
    );

    // statusNovo = tickets sem atribuição (status=1), sempre global independente de filtros
    data.kpis.statusNovo = allTickets.filter((t: any) => t.status === 1).length;

    _cache.set(cacheKey, { data, ts: now });
    return data;
  } finally {
    await killSession(session);
  }
}

