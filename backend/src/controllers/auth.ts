import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import prisma from '../services/db';
import { logActivity } from '../middleware/logger';
import { AuthenticatedRequest } from '../middleware/auth';

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await logActivity('Login Failed', `Invalid credentials for ${email}`, req);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      await logActivity('Login Failed', `Invalid password for ${email}`, req);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const secret = process.env.JWT_SECRET || 'node-x-super-secret';
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    // Create session placeholder first
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        token: 'temp_token_' + Math.random(),
        expiresAt
      }
    });

    // Create JWT containing session information
    const token = jwt.sign({ sessionId: session.id, userId: user.id }, secret, {
      expiresIn: '7d'
    });

    // Update with real signed JWT token
    await prisma.session.update({
      where: { id: session.id },
      data: { token }
    });

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: expiresAt
    });

    await logActivity('Login Success', `User ${user.username} logged in`, req);

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function logout(req: AuthenticatedRequest, res: Response) {
  try {
    const token = req.cookies?.token;
    if (token) {
      await prisma.session.delete({ where: { token } }).catch(() => {});
    }

    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    if (req.user) {
      await logActivity('Logout Success', `User ${req.user.username} logged out`, req);
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function getSession(req: AuthenticatedRequest, res: Response) {
  return res.json({
    authenticated: true,
    user: req.user
  });
}
