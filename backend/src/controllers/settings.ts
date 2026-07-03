import { Request, Response } from 'express';
import prisma from '../services/db';
import { logActivity } from '../middleware/logger';
import { AuthenticatedRequest } from '../middleware/auth';
import { StorageService } from '../services/storage';

// Fetch global settings
export async function getSettings(req: Request, res: Response) {
  try {
    const settings = await prisma.setting.findMany();
    return res.json({ success: true, settings });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Update settings
export async function updateSettings(req: AuthenticatedRequest, res: Response) {
  try {
    const updates = req.body; // Array of { key, value }
    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'Payload must be an array of updates' });
    }

    for (const update of updates) {
      await prisma.setting.upsert({
        where: { key: update.key },
        update: { value: update.value },
        create: { key: update.key, value: update.value, type: 'STRING' }
      });
    }

    await logActivity('Settings Change', 'Updated system settings configurations', req);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Fetch dashboard statistical numbers
export async function getDashboardStats(req: AuthenticatedRequest, res: Response) {
  try {
    const totalFiles = await prisma.file.count({ where: { trashItems: { none: {} } } });
    const totalFolders = await prisma.folder.count({ where: { trashItems: { none: {} } } });
    const totalShares = await prisma.share.count();

    const sumResult = await prisma.file.aggregate({
      _sum: { size: true },
      where: { trashItems: { none: {} } }
    });

    const storageUsedBytes = sumResult._sum.size ? sumResult._sum.size.toString() : '0';

    return res.json({
      success: true,
      stats: {
        totalFiles,
        totalFolders,
        totalShares,
        storageUsedBytes
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Fetch activity logs
export async function getLogs(req: AuthenticatedRequest, res: Response) {
  try {
    const logs = await prisma.activityLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100 // Last 100 entries
    });
    return res.json({ success: true, logs });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Fetch Trash (Recycle Bin) items
export async function getTrash(req: AuthenticatedRequest, res: Response) {
  try {
    const trash = await prisma.trash.findMany({
      orderBy: { deletedAt: 'desc' }
    });
    return res.json({ success: true, trash });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Restore item from Trash
export async function restoreTrash(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;

    const trashItem = await prisma.trash.findUnique({
      where: { id }
    });

    if (!trashItem) {
      return res.status(404).json({ error: 'Recycle bin item not found' });
    }

    // Delete trash entry to restore item (makes it active again)
    await prisma.trash.delete({
      where: { id }
    });

    await logActivity('Restore Trash', `Restored ${trashItem.itemType.toLowerCase()} "${trashItem.name}" from Trash`, req);
    return res.json({ success: true, message: 'Item restored successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Permanently delete item
export async function emptyTrashItem(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;

    const trashItem = await prisma.trash.findUnique({
      where: { id }
    });

    if (!trashItem) {
      return res.status(404).json({ error: 'Recycle bin item not found' });
    }

    const storageAdapter = StorageService.getAdapter();

    if (trashItem.itemType === 'FILE') {
      const file = await prisma.file.findUnique({ where: { id: trashItem.itemId } });
      if (file) {
        // Delete physical file from storage provider
        await storageAdapter.deleteFile(file.uuidName).catch(() => {});
        // Delete from database
        await prisma.file.delete({ where: { id: file.id } }).catch(() => {});
      }
    } else {
      // It's a folder, recursively delete child files from disk & database
      await deleteFolderRecursively(trashItem.itemId, storageAdapter);
    }

    // Delete Trash entry
    await prisma.trash.delete({ where: { id } });

    await logActivity('Empty Trash', `Permanently deleted ${trashItem.itemType.toLowerCase()} "${trashItem.name}"`, req);
    return res.json({ success: true, message: 'Item permanently deleted' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Recursive helper to delete folder contents from storage provider and DB
async function deleteFolderRecursively(folderId: string, storageAdapter: any) {
  // Find child folders
  const subFolders = await prisma.folder.findMany({ where: { parentFolderId: folderId } });
  for (const sub of subFolders) {
    await deleteFolderRecursively(sub.id, storageAdapter);
  }

  // Find files in folder
  const files = await prisma.file.findMany({ where: { folderId } });
  for (const file of files) {
    await storageAdapter.deleteFile(file.uuidName).catch(() => {});
    await prisma.file.delete({ where: { id: file.id } }).catch(() => {});
  }

  // Delete current folder
  await prisma.folder.delete({ where: { id: folderId } }).catch(() => {});
}
