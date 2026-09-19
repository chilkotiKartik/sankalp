import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { sha256 } from '../lib/crypto';
import type { Role, Store } from '../repositories/types';

export interface AuthContext {
  userId: string;
  sessionId: string;
  role: Role;
  anonymous: boolean;
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  context: AuthContext;
}

const ISSUER = 'sanjeevani-api';
const AUDIENCE = 'sanjeevani-web';

/**
 * Stateful JWT sessions: the token is signed (tamper-proof, cheap to verify) and its
 * id is recorded server-side so sessions can be revoked ("delete my data", logout).
 */
export class AuthService {
  private readonly key: Uint8Array;
  private readonly cache = new Map<string, { context: AuthContext; until: number }>();

  constructor(
    private readonly store: Store,
    secret: string,
    private readonly ttlHours: number,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async createAnonymousSession(languagePreference = 'auto'): Promise<IssuedSession> {
    const user = await this.store.users.create({ anonymous: true, languagePreference });
    return this.issue(user.id, user.role, true);
  }

  async createAdminSession(): Promise<IssuedSession> {
    const user = await this.store.users.create({ anonymous: false, role: 'ADMIN' });
    return this.issue(user.id, 'ADMIN', false);
  }

  private async issue(userId: string, role: Role, anonymous: boolean): Promise<IssuedSession> {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + this.ttlHours * 3600_000);
    const session = await this.store.sessions.create({ userId, tokenHash: sha256(jti), expiresAt });
    const token = await new SignJWT({ sid: session.id, role, anon: anonymous })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setJti(jti)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { token, expiresAt, context: { userId, sessionId: session.id, role, anonymous } };
  }

  async verify(token: string): Promise<AuthContext | null> {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] }));
    } catch {
      return null;
    }
    if (!payload.jti || !payload.sub) return null;
    const hash = sha256(payload.jti);
    const cached = this.cache.get(hash);
    if (cached && cached.until > Date.now()) return cached.context;

    const session = await this.store.sessions.findByTokenHash(hash);
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== payload.sub) return null;
    const user = await this.store.users.findById(session.userId);
    if (!user) return null;
    const context: AuthContext = { userId: user.id, sessionId: session.id, role: user.role, anonymous: user.anonymous };
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(hash, { context, until: Date.now() + 30_000 });
    return context;
  }

  async revoke(context: AuthContext): Promise<void> {
    await this.store.sessions.revoke(context.sessionId);
    for (const [hash, entry] of this.cache) if (entry.context.sessionId === context.sessionId) this.cache.delete(hash);
  }

  forgetUser(userId: string): void {
    for (const [hash, entry] of this.cache) if (entry.context.userId === userId) this.cache.delete(hash);
  }
}
