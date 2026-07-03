import { Request, Response } from 'express';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import prisma from '../services/db';
import { logActivity } from '../middleware/logger';
import { AuthenticatedRequest } from '../middleware/auth';

// Create a new Share Link
export async function createShare(req: AuthenticatedRequest, res: Response) {
  try {
    const {
      folderId,
      fileId,
      password,
      expiresAt,
      maxDownloads,
      readOnly,
      downloadOnly,
      disableDownload,
      disablePreview,
      isPublic
    } = req.body;

    if (!folderId && !fileId) {
      return res.status(400).json({ error: 'Folder ID or File ID is required' });
    }

    // Generate random 10-character link hash
    const hash = crypto.randomBytes(5).toString('hex');
    let passwordHash = null;

    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const share = await prisma.share.create({
      data: {
        hash,
        passwordHash,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        maxDownloads: maxDownloads ? parseInt(maxDownloads, 10) : null,
        readOnly: !!readOnly,
        downloadOnly: !!downloadOnly,
        disableDownload: !!disableDownload,
        disablePreview: !!disablePreview,
        isPublic: !!isPublic,
        folderId: folderId || null,
        fileId: fileId || null
      }
    });

    await logActivity('Create Share', `Created share link for ${folderId ? 'folder' : 'file'} ID ${folderId || fileId} (Hash: ${hash})`, req);
    return res.json({ success: true, share });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Get Share details (Visitor Endpoint)
export async function getShare(req: Request, res: Response) {
  try {
    const { hash } = req.params;

    const share = await prisma.share.findUnique({
      where: { hash },
      include: {
        folder: true,
        file: true
      }
    });

    if (!share) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    // Check expiration
    if (share.expiresAt && share.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Share link has expired' });
    }

    // Check maximum downloads limit
    if (share.maxDownloads && share.currentDownloads >= share.maxDownloads) {
      return res.status(410).json({ error: 'Maximum downloads limit reached' });
    }

    // Gated check: If share has password, prompt for password first
    if (share.passwordHash) {
      return res.json({
        success: true,
        passwordRequired: true,
        share: {
          id: share.id,
          hash: share.hash,
          isFolder: !!share.folderId,
          name: share.folder ? share.folder.name : share.file?.originalName,
          disableDownload: share.disableDownload,
          disablePreview: share.disablePreview
        }
      });
    }

    // Otherwise load content directly
    const content = await fetchShareContent(share, null);
    return res.json({
      success: true,
      passwordRequired: false,
      share,
      content
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Unlock password protected share link
export async function unlockShare(req: Request, res: Response) {
  try {
    const { hash } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const share = await prisma.share.findUnique({
      where: { hash },
      include: {
        folder: true,
        file: true
      }
    });

    if (!share) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    // Verify hashed password
    const passwordMatch = await bcrypt.compare(password, share.passwordHash || '');
    if (!passwordMatch) {
      await logActivity('Password Failed', `Failed unlock attempt for share hash ${hash}`, req);
      return res.status(401).json({ error: 'Incorrect password' });
    }

    await logActivity('Password Success', `Successful unlock for share hash ${hash}`, req);

    // Fetch authorized items
    const content = await fetchShareContent(share, req.query.folderId as string || null);
    return res.json({
      success: true,
      share,
      content
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Helper to fetch files and subfolders in shared folder recursively/selectively
async function fetchShareContent(share: any, subFolderId: string | null) {
  // If sharing a single file
  if (share.fileId) {
    return {
      file: share.file,
      folder: null
    };
  }

  // If sharing a folder
  const currentFolderId = subFolderId || share.folderId;
  
  // Security verification: verify subFolderId is a child of the shared folder
  if (subFolderId) {
    let isValidChild = false;
    let checkId: string | null = subFolderId;
    while (checkId) {
      const folder = await prisma.folder.findUnique({ where: { id: checkId } });
      if (!folder) break;
      if (folder.id === share.folderId) {
        isValidChild = true;
        break;
      }
      checkId = folder.parentFolderId;
    }
    if (!isValidChild) {
      throw new Error('Access denied: folder is not in share path');
    }
  }

  const folders = await prisma.folder.findMany({
    where: {
      parentFolderId: currentFolderId,
      trashItems: { none: {} }
    },
    orderBy: { name: 'asc' }
  });

  const files = await prisma.file.findMany({
    where: {
      folderId: currentFolderId,
      trashItems: { none: {} }
    },
    orderBy: { originalName: 'asc' }
  });

  const folderDetails = await prisma.folder.findUnique({
    where: { id: currentFolderId }
  });

  // Calculate sharing breadcrumbs starting from shared root
  const breadcrumbs = [];
  let currentId: string | null = currentFolderId;
  while (currentId) {
    const f = await prisma.folder.findUnique({ where: { id: currentId } });
    if (!f) break;
    breadcrumbs.unshift({ id: f.id, name: f.name });
    if (f.id === share.folderId) break; // Stop at shared parent root
    currentId = f.parentFolderId;
  }

  return {
    breadcrumbs,
    currentFolder: folderDetails,
    folders,
    files
  };
}
