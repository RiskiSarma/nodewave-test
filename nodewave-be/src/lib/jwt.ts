import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface JwtPayload {
  sub: string;
  tv: number;
}

export const signToken = (userId: string, tokenVersion: number) =>
  jwt.sign({ sub: userId, tv: tokenVersion } satisfies JwtPayload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });

export function verifyToken(token: string): JwtPayload | null {
  try {
    const p = jwt.verify(token, config.JWT_SECRET);
    if (typeof p === 'object' && typeof p.sub === 'string' && typeof p.tv === 'number') {
      return { sub: p.sub, tv: p.tv };
    }
    return null;
  } catch {
    return null;
  }
}
