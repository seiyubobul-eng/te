import { Response } from 'express';
import prisma from '../services/db';
import { logActivity } from '../middleware/logger';
import { AuthenticatedRequest } from '../middleware/auth';

export async function listItems(req: AuthenticatedRequest, res: Response) {
  try {
    const folderId = (req.query.folderId as string) || null;

    const visibilityFilter = req.user?.role === 'ADMIN'
      ? undefined
      : { not: 'PRIVATE' };

    // Fetch folders not in trash
    const folders = await prisma.folder.findMany({
      where: {
        parentFolderId: folderId,
        trashItems: { none: {} },
        visibility: visibilityFilter
      },
      orderBy: { name: 'asc' }
    });

    // Fetch files not in trash
    const files = await prisma.file.findMany({
      where: {
        folderId: folderId,
        trashItems: { none: {} }
      },
      orderBy: { originalName: 'asc' }
    });

    // Resolve breadcrumbs
    const breadcrumbs = [];
    let currentFolder = null;
    if (folderId) {
      currentFolder = await prisma.folder.findUnique({
        where: { id: folderId }
      });
      let tempFolder = currentFolder;
      while (tempFolder) {
        breadcrumbs.unshift({ id: tempFolder.id, name: tempFolder.name });
        if (tempFolder.parentFolderId) {
          tempFolder = await prisma.folder.findUnique({
            where: { id: tempFolder.parentFolderId }
          });
        } else {
          tempFolder = null;
        }
      }
    }
    breadcrumbs.unshift({ id: null, name: 'Root' });

    return res.json({
      folderId,
      breadcrumbs,
      currentFolder,
      folders,
      files
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function createFolder(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, parentFolderId } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const folder = await prisma.folder.create({
      data: {
        name,
        parentFolderId: parentFolderId || null
      }
    });

    await logActivity('Create Folder', `Created folder "${name}" (ID: ${folder.id})`, req);
    return res.json({ success: true, folder });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function renameFolder(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const folder = await prisma.folder.update({
      where: { id },
      data: { name }
    });

    await logActivity('Rename Folder', `Renamed folder ID ${id} to "${name}"`, req);
    return res.json({ success: true, folder });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function moveFolder(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { parentFolderId } = req.body;

    if (id === parentFolderId) {
      return res.status(400).json({ error: 'Cannot move folder into itself' });
    }

    const folder = await prisma.folder.update({
      where: { id },
      data: { parentFolderId: parentFolderId || null }
    });

    await logActivity('Move Folder', `Moved folder ID ${id} to parent ID ${parentFolderId || 'Root'}`, req);
    return res.json({ success: true, folder });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteFolder(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;

    const folder = await prisma.folder.findUnique({
      where: { id }
    });

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

    await logActivity('Delete Folder', `Moved folder "${folder.name}" (ID: ${id}) to Trash`, req);
    return res.json({ success: true, message: 'Folder moved to Trash' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
