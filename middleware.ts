import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isDevelopmentEnvironment } from './lib/constants';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/ping')) {
    return new Response('pong', { status: 200 });
  }

  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  const isRegularUser = token?.type === 'regular';

  if (['/login', '/register'].includes(pathname)) {
    return isRegularUser
      ? NextResponse.redirect(new URL('/', request.url))
      : NextResponse.next();
  }

  if (pathname === '/') {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return isRegularUser
      ? NextResponse.next()
      : NextResponse.json(
          { code: 'unauthorized:auth', message: 'Authentication required.' },
          { status: 401 },
        );
  }

  if (!isRegularUser) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/chat/:id',
    '/api/:path*',
    '/login',
    '/register',

    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
