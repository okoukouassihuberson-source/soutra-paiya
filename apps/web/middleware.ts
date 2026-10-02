import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_HEADER, PREFIXED_LOCALES, stripLocale } from '@/lib/i18n/config';

/**
 * Routage des langues (voir lib/i18n/config.ts) :
 *   /en/voyages/x  →  réécrit vers /voyages/x avec x-locale: en
 *   /voyages/x     →  x-locale: fr (langue par défaut, URLs historiques inchangées)
 * L'en-tête x-locale est TOUJOURS écrasé : un client ne peut pas le forger.
 * Seule l'accueil '/' redirige vers la langue mémorisée (cookie posé par le sélecteur).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const { locale, path } = stripLocale(pathname);

  const headers = new Headers(req.headers);
  headers.set(LOCALE_HEADER, locale);

  if (locale !== DEFAULT_LOCALE) {
    const url = req.nextUrl.clone();
    url.pathname = path;
    return NextResponse.rewrite(url, { request: { headers } });
  }

  if (pathname === '/') {
    const saved = req.cookies.get(LOCALE_COOKIE)?.value;
    if (saved && (PREFIXED_LOCALES as string[]).includes(saved)) {
      const url = req.nextUrl.clone();
      url.pathname = `/${saved}`;
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next({ request: { headers } });
}

// Hors fichiers statiques (extension), assets Next et API.
export const config = { matcher: ['/((?!_next/|api/|.*\\..*).*)'] };
