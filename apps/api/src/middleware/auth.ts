import { SESSION_COOKIE } from '@sanjeevani/config';
import type { CookieOptions, RequestHandler, Response } from 'express';
import { AppError } from '../lib/errors';
import type { AuthService, IssuedSession } from '../services/auth-service';

function tokenFrom(req: Parameters<RequestHandler>[0]): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  return cookie ?? null;
}

/** Attaches req.auth when a valid session is present. Never rejects. */
export function loadAuth(auth: AuthService): RequestHandler {
  return async (req, _res, next) => {
    const token = tokenFrom(req);
    if (token) req.auth = (await auth.verify(token)) ?? undefined;
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(AppError.unauthorized());
  next();
};

export function requireRole(role: 'ADMIN'): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(AppError.unauthorized());
    if (req.auth.role !== role) return next(AppError.forbidden());
    next();
  };
}

export function cookieOptions(secure: boolean, expires?: Date): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', ...(expires ? { expires } : {}) };
}

export function setSessionCookie(res: Response, session: IssuedSession, secure: boolean) {
  res.cookie(SESSION_COOKIE, session.token, cookieOptions(secure, session.expiresAt));
}

export function clearSessionCookie(res: Response, secure: boolean) {
  res.clearCookie(SESSION_COOKIE, cookieOptions(secure));
}
