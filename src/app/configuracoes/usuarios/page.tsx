'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, AlertCircle, Users, Save, CheckCircle2, Plus, Trash2, KeyRound } from 'lucide-react';

type Role = { id: number; name: string };
type User = { id: number; username: string; roleId: number; roleName: string };

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);

  const [novoUsername, setNovoUsername] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [novoRoleId, setNovoRoleId] = useState<number | ''>('');
  const [criando, setCriando] = useState(false);

  const [resetId, setResetId] = useState<number | null>(null);
  const [resetSenha, setResetSenha] = useState('');

  const carregar = useCallback(async () => {
    setError(null);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        axios.get('/api/config/usuarios'),
        axios.get('/api/config/papeis'),
      ]);
      setUsers(usersRes.data.users ?? []);
      setRoles(rolesRes.data.roles ?? []);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault();
    if (!novoUsername.trim() || !novaSenha || !novoRoleId) {
      setError('Preencha usuário, senha e papel.');
      return;
    }
    setCriando(true);
    setError(null);
    try {
      await axios.post('/api/config/usuarios', { username: novoUsername, password: novaSenha, roleId: novoRoleId });
      setNovoUsername('');
      setNovaSenha('');
      setNovoRoleId('');
      setSalvo('Usuário criado.');
      await carregar();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setCriando(false);
    }
  }

  async function mudarRole(user: User, roleId: number) {
    setError(null);
    try {
      await axios.put(`/api/config/usuarios/${user.id}`, { roleId });
      setSalvo(`Papel de ${user.username} atualizado.`);
      await carregar();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    }
  }

  async function salvarSenha(user: User) {
    if (!resetSenha) return;
    setError(null);
    try {
      await axios.put(`/api/config/usuarios/${user.id}`, { password: resetSenha });
      setSalvo(`Senha de ${user.username} redefinida.`);
      setResetId(null);
      setResetSenha('');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    }
  }

  async function remover(user: User) {
    if (!confirm(`Remover o usuário "${user.username}"?`)) return;
    setError(null);
    try {
      await axios.delete(`/api/config/usuarios/${user.id}`);
      await carregar();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 size={36} className="animate-spin text-primary" />
        <p className="text-sm font-medium">Carregando usuários…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configurações · Acesso · Usuários</p>
        </div>
        <button onClick={() => { setLoading(true); carregar(); }}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {salvo && !error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-success-bg text-success text-sm">
          <CheckCircle2 size={16} /> {salvo}
        </div>
      )}

      <form onSubmit={criarUsuario} className="rounded-lg border border-border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Plus size={15} className="text-primary" />
          <h2 className="text-sm font-semibold">Novo usuário</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3">
          <input
            placeholder="Usuário"
            value={novoUsername}
            onChange={(e) => setNovoUsername(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            placeholder="Senha"
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={novoRoleId}
            onChange={(e) => setNovoRoleId(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Papel...</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button type="submit" disabled={criando}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {criando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Criar
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Users size={15} className="text-primary" />
          <h2 className="text-sm font-semibold">Usuários cadastrados</h2>
        </div>
        <div className="divide-y divide-border">
          {users.map((user) => (
            <div key={user.id} className="px-5 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium flex-1 min-w-[140px]">{user.username}</span>
                <select
                  value={user.roleId}
                  onChange={(e) => mudarRole(user, Number(e.target.value))}
                  className="px-2 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <button
                  onClick={() => { setResetId(resetId === user.id ? null : user.id); setResetSenha(''); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium hover:bg-muted transition-colors"
                >
                  <KeyRound size={13} /> Redefinir senha
                </button>
                <button
                  onClick={() => remover(user)}
                  className="flex items-center gap-1.5 px-2 py-1.5 border border-destructive/40 text-destructive rounded-lg text-xs font-medium hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {resetId === user.id && (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    placeholder="Nova senha"
                    value={resetSenha}
                    onChange={(e) => setResetSenha(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={() => salvarSenha(user)}
                    className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    Salvar
                  </button>
                </div>
              )}
            </div>
          ))}
          {users.length === 0 && (
            <p className="px-5 py-3 text-sm text-muted-foreground">Nenhum usuário cadastrado ainda.</p>
          )}
        </div>
      </div>
    </div>
  );
}
