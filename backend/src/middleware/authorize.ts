import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import prisma from '../services/db';
import { AuthenticatedRequest } from './auth';

// Helper to extract unlocked folders from cookies
export function getUnlockedFolders(req: Request): string[] {
  try {
    const token = req.cookies?.unlocked_folders;
    if (!token) return [];
    const secret = process.env.JWT_SECRET || 'node-x-super-secret';
    const decoded = jwt.verify(token, secret) as { unlockedFolders: string[] };
    return decoded.unlockedFolders || [];
  } catch (_) {
    return [];
  }
}

// Main access check helper
export async function checkFolderAccess(
  folderId: string | null,
  action: 'read' | 'write' | 'delete',
  req: AuthenticatedRequest
): Promise<{ authorized: boolean; reason?: string; folder?: any }> {
  // 1. Admin bypass
  if (req.user && req.user.role === 'ADMIN') {
    return { authorized: true };
  }

  // 2. Modify operations (delete, rename, move) are restricted to admin
  if (action === 'delete') {
    return { authorized: false, reason: 'Only administrators are allowed to modify structure' };
  }

  // 3. Root directory access rules
  if (!folderId) {
    if (action === 'write') {
      return { authorized: false, reason: 'Only administrators can write at the root level' };
    }
    return { authorized: true };
  }

  // 4. Fetch requested folder
  const folder = await prisma.folder.findUnique({
    where: { id: folderId }
  });

  if (!folder) {
    return { authorized: false, reason: 'Folder not found' };
  }

  // 5. Visibility check
  if (folder.visibility === 'PRIVATE') {
    return { authorized: false, reason: 'This folder is private' };
  }

  const unlockedList = getUnlockedFolders(req);
  if (folder.visibility === 'PROTECTED' && !unlockedList.includes(folderId)) {
    return { authorized: false, reason: 'Password verification required', folder };
  }

  // 6. Chain validation (check all parents for PRIVATE or PROTECTED)
  let currentId: string | null = folder.parentFolderId;
  while (currentId) {
    const parent = await prisma.folder.findUnique({ where: { id: currentId } });
    if (!parent) break;
    if (parent.visibility === 'PRIVATE') {
      return { authorized: false, reason: 'Parent folder is private' };
    }
    if (parent.visibility === 'PROTECTED' && !unlockedList.includes(parent.id)) {
      return { authorized: false, reason: 'Parent folder is protected', folder: parent };
    }
    currentId = parent.parentFolderId;
  }

  // 7. Write upload checks
  if (action === 'write' && !folder.allowUpload) {
    return { authorized: false, reason: 'Upload is disabled for this folder' };
  }

  return { authorized: true, folder };
}

// Express Middleware for folder gating
export function folderGate(action: 'read' | 'write' | 'delete') {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const folderId = (req.query.folderId as string) || (req.body.folderId as string) || (req.body.parentFolderId as string) || null;
      const access = await checkFolderAccess(folderId, action, req);
      
      if (!access.authorized) {
        if (access.reason === 'Password verification required') {
          return res.status(401).json({ error: 'Password verification required', folderId });
        }
        return res.status(403).json({ error: access.reason || 'Access denied' });
      }

      next();
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  };
}
