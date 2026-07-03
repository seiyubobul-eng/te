import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import prisma from '../services/db';
import { logActivity } from '../middleware/logger';
import { AuthenticatedRequest } from '../middleware/auth';
import { getUnlockedFolders } from '../middleware/authorize';

// Rate limiting map for unlocks
const unlockAttempts = new Map<string, { count: number; lockedUntil: Date }>();

function checkUnlockRateLimit(ip: string): { allowed: boolean; waitTimeMinutes?: number } {
  const record = unlockAttempts.get(ip);
  if (!record) return { allowed: true };

  const now = new Date();
  if (record.count >= 5 && record.lockedUntil > now) {
    const diff = record.lockedUntil.getTime() - now.getTime();
    return { allowed: false, waitTimeMinutes: Math.ceil(diff / 1000 / 60) };
  }

  if (record.lockedUntil <= now) {
    unlockAttempts.delete(ip);
  }

  return { allowed: true };
}

function registerUnlockFailure(ip: string) {
  const record = unlockAttempts.get(ip);
  const now = new Date();
  if (!record) {
    const lockTime = new Date(now.getTime() + 5 * 60 * 1000); // Lock 5 mins
    unlockAttempts.set(ip, { count: 1, lockedUntil: lockTime });
  } else {
    record.count += 1;
    if (record.count >= 5) {
      record.lockedUntil = new Date(now.getTime() + 5 * 60 * 1000);
    }
  }
}

// 1. Create Folder (Admin Only)
export async function createFolder(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, parentFolderId, visibility, password, allowUpload } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only administrators can create folders' });
    }

    let passwordHash = null;
    if (visibility === 'PROTECTED' && password) {
      const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
      passwordHash = await bcrypt.hash(password, rounds);
    }

    const folder = await prisma.folder.create({
      data: {
        name,
        parentFolderId: parentFolderId || null,
        visibility: visibility || 'PUBLIC',
        passwordHash,
        allowUpload: !!allowUpload,
        ownerId: req.user.id
      }
    });

    await logActivity('Create Folder', `Created folder "${name}" (ID: ${folder.id})`, req);
    return res.json({ success: true, folder });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 2. Unlock Protected Folder
export async function unlockFolder(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const ip = req.headers['x-forwarded-for'] as string || req.ip || 'unknown';

    // Check rate limiter
    const rateCheck = checkUnlockRateLimit(ip);
    if (!rateCheck.allowed) {
      return res.status(429).json({ 
        error: `Too many failed attempts. Try again in ${rateCheck.waitTimeMinutes} minute(s).` 
      });
    }

    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder || folder.visibility !== 'PROTECTED') {
      return res.status(400).json({ error: 'Folder is not protected or not found' });
    }

    if (!folder.passwordHash) {
      return res.status(500).json({ error: 'Folder password config missing' });
    }

    const passwordMatch = await bcrypt.compare(password || '', folder.passwordHash);
    if (!passwordMatch) {
      registerUnlockFailure(ip);
      await logActivity('Folder Unlock Failed', `Failed unlock attempt for folder "${folder.name}"`, req);
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // Clear rate limit record on success
    unlockAttempts.delete(ip);

    // Save unlocked folder to JWT cookie
    const currentList = getUnlockedFolders(req);
    if (!currentList.includes(id)) {
      currentList.push(id);
    }

    const secret = process.env.JWT_SECRET || 'node-x-super-secret';
    const expiresSec = parseInt(process.env.SESSION_EXPIRE || '3600', 10);
    const token = jwt.sign({ unlockedFolders: currentList }, secret, {
      expiresIn: expiresSec
    });

    res.cookie('unlocked_folders', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: expiresSec * 1000
    });

    await logActivity('Folder Unlock Success', `Unlocked folder "${folder.name}"`, req);
    return res.json({ success: true, message: 'Folder unlocked successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 3. Update Folder Permissions (Admin Only)
export async function updateFolderPermissions(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { visibility, password, allowUpload } = req.body;

    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    let passwordHash = folder.passwordHash;
    if (visibility === 'PROTECTED') {
      if (password) {
        const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
        passwordHash = await bcrypt.hash(password, rounds);
      }
    } else {
      passwordHash = null; // Clear password if visibility changes
    }

    const updated = await prisma.folder.update({
      where: { id },
      data: {
        visibility: visibility || folder.visibility,
        passwordHash,
        allowUpload: allowUpload !== undefined ? !!allowUpload : folder.allowUpload
      }
    });

    await logActivity('Folder Permissions Update', `Updated permissions for "${folder.name}"`, req);
    return res.json({ success: true, folder: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 4. Update Folder general/rename/move (Admin Only)
export async function updateFolder(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name, parentFolderId } = req.body;

    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await prisma.folder.update({
      where: { id },
      data: {
        name: name || undefined,
        parentFolderId: parentFolderId !== undefined ? parentFolderId : undefined
      }
    });

    await logActivity('Update Folder', `Renamed/moved folder "${updated.name}"`, req);
    return res.json({ success: true, folder: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// 5. Delete Folder (Admin Only)
export async function deleteFolder(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;

    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    await prisma.trash.create({
      data: {
        itemType: 'FOLDER',
        itemId: id,
        name: folder.name,
        folderId: id
      }
    });

    await logActivity('Delete Folder', `Moved folder "${folder.name}" to Trash`, req);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
