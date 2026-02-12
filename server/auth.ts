import { SignJWT, jwtVerify } from 'jose';
import type { Request, Response, NextFunction } from 'express';

const PASSPHRASE = process.env.AUTH_PASSPHRASE || 'change-me';
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'dev-secret-replace-in-production-min32chars!'
);
const MAX_AGE_HOURS = parseInt(process.env.COOKIE_MAX_AGE_HOURS || '24', 10);
const COOKIE_NAME = 'cc_auth';

export async function login(passphrase: string): Promise<string | null> {
  if (passphrase !== PASSPHRASE) return null;

  const token = await new SignJWT({ sub: 'user' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${MAX_AGE_HOURS}h`)
    .setIssuedAt()
    .sign(SECRET);

  return token;
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, SECRET);
    return true;
  } catch {
    return false;
  }
}

/** Express middleware — protects /api/* routes */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip login endpoint (req.path is relative to the mount point)
  if (req.path === '/auth/login') return next();

  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  verifyToken(token).then((valid) => {
    if (!valid) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    next();
  });
}

/** Verify auth for WebSocket upgrade requests */
export async function verifyWsAuth(cookie: string | undefined): Promise<boolean> {
  if (!cookie) return false;

  // Parse cookie header to find our token
  const cookies = cookie.split(';').reduce((acc, c) => {
    const [key, ...val] = c.trim().split('=');
    acc[key] = val.join('=');
    return acc;
  }, {} as Record<string, string>);

  const token = cookies[COOKIE_NAME];
  return token ? verifyToken(token) : false;
}

export { COOKIE_NAME, MAX_AGE_HOURS };
