import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import prisma from '../services/db';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const secret = process.env.JWT_SECRET || 'node-x-super-secret';
    const decoded = jwt.verify(token, secret) as { sessionId: string; userId: string };

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      }
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      username: session.user.username,
      role: session.user.role
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Authentication invalid' });
  }
}

export async function optionalAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.token;
    if (token) {
      const secret = process.env.JWT_SECRET || 'node-x-super-secret';
      const decoded = jwt.verify(token, secret) as { sessionId: string; userId: string };

      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: true }
      });

      if (session && session.expiresAt > new Date()) {
        req.user = {
          id: session.user.id,
          email: session.user.email,
          username: session.user.username,
          role: session.user.role
        };
      }
    }
  } catch (err) {
    // Ignore validation errors for optional authentication
  }
  next();
}
