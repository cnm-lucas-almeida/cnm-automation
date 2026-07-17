import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { canAccess } from '@/lib/admin';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/' || canAccess(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 });
  }

  return NextResponse.redirect(new URL('/', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
