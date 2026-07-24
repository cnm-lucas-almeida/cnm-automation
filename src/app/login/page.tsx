'use client';

import { useActionState } from 'react';
import Image from 'next/image';
import { AlertCircle, Loader2 } from 'lucide-react';
import { login } from '@/lib/auth/actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#f5f5f5]">
      <form
        action={action}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm space-y-5"
      >
        <div className="flex flex-col items-center gap-2 mb-2">
          <Image src="/logo.png" alt="Chaves na Mão" width={168} height={90} priority className="h-10 w-auto" />
          <h1 className="text-lg font-semibold tracking-tight">Painel de Automações</h1>
        </div>

        {state?.error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle size={16} /> {state.error}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="username" className="text-sm font-medium">Usuário</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            required
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : null} Entrar
        </button>
      </form>
    </div>
  );
}
