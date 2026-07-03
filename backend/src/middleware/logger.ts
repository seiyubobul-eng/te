import { Request } from 'express';
import prisma from '../services/db';

export async function logActivity(event: string, details: string | null = null, req?: Request) {
  try {
    const ipAddress = req ? (req.headers['x-forwarded-for'] as string || req.ip || req.socket.remoteAddress || null) : null;
    const userAgent = req ? (req.headers['user-agent'] || null) : null;

    await prisma.activityLog.create({
      data: {
        event,
        details,
        ipAddress,
        userAgent
      }
    });
  } catch (err) {
    console.error('Failed to write activity log:', err);
  }
}
