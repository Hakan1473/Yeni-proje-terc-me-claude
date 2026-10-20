import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config';

export function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return (first || req.socket.remoteAddress || 'unknown').trim();
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** True when no access code is configured, or the request carries the right one. */
export function hasAccess(code: string | undefined | null): boolean {
  if (!config.accessCode) return true;
  return !!code && safeEqual(code, config.accessCode);
}

export function requireAccess(req: Request, res: Response, next: NextFunction): void {
  if (hasAccess(req.header('x-access-code'))) return next();
  res.status(401).json({ error: 'access_required' });
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
  next();
}

/**
 * Token bucket per client IP and route group. Protects the API key's quota
 * when the app is reachable from the internet.
 */
export function rateLimit(group: string, perMinute: number) {
  const buckets = new Map<string, { tokens: number; updated: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = `${group}:${clientIp(req)}`;
    const now = Date.now();
    const bucket = buckets.get(id) ?? { tokens: perMinute, updated: now };
    bucket.tokens = Math.min(perMinute, bucket.tokens + ((now - bucket.updated) / 60_000) * perMinute);
    bucket.updated = now;
    if (bucket.tokens < 1) {
      buckets.set(id, bucket);
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    bucket.tokens -= 1;
    buckets.set(id, bucket);
    if (buckets.size > 5000) buckets.clear();
    next();
  };
}

/** Bounded string from untrusted JSON. Strips control characters. */
export function cleanString(raw: unknown, max = 2000): string {
  if (typeof raw !== 'string') return '';
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
