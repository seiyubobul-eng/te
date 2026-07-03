import { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import * as mime from 'mime-types';
import prisma from '../services/db';
import { StorageService } from '../services/storage';
import { logActivity } from '../middleware/logger';
import { AuthenticatedRequest } from '../middleware/auth';
import { checkFolderAccess } from '../middleware/authorize';

// Sanitize filename to avoid injection and path traversal
function sanitizeFilename(filename: string): string {
  const base = path.basename(filename);
  return base.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

// Helper to check if file extension is allowed
async function isExtensionAllowed(filename: string): Promise<boolean> {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  
  // Hardcoded script/executable blocks
  const hardcodedBlocked = ['exe', 'bat', 'cmd', 'ps1', 'sh'];
  if (hardcodedBlocked.includes(ext)) return false;

  // Fetch settings from Database
  const allowedSetting = await prisma.setting.findUnique({ where: { key: 'allowed_extensions' } });
  const blockedSetting = await prisma.setting.findUnique({ where: { key: 'blocked_extensions' } });

  if (blockedSetting && blockedSetting.value) {
    const blockedList = blockedSetting.value.split(',').map(e => e.trim().toLowerCase());
    if (blockedList.includes(ext)) return false;
  }

  if (allowedSetting && allowedSetting.value && allowedSetting.value !== '*') {
    const allowedList = allowedSetting.value.split(',').map(e => e.trim().toLowerCase());
    if (!allowedList.includes(ext)) return false;
  }

  return true;
}

// Single / Multiple File Upload (Standard)
export async function uploadFiles(req: AuthenticatedRequest, res: Response) {
  try {
    const folderId = (req.body.folderId as string) || null;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const storageAdapter = StorageService.getAdapter();
    const createdFiles = [];

    const maxSetting = await prisma.setting.findUnique({ where: { key: 'max_upload_size' } });
    const maxSizeBytes = maxSetting ? BigInt(maxSetting.value) : BigInt(10737418240); // 10 GB

    for (const file of files) {
      const allowed = await isExtensionAllowed(file.originalname);
      if (!allowed) {
        await fs.promises.unlink(file.path).catch(() => {});
        return res.status(400).json({ error: `File type for "${file.originalname}" is blocked.` });
      }

      if (BigInt(file.size) > maxSizeBytes) {
        await fs.promises.unlink(file.path).catch(() => {});
        return res.status(400).json({ error: `File "${file.originalname}" size exceeds configured limit.` });
      }

      const fileId = uuidv4();
      const sanitizedName = sanitizeFilename(file.originalname);
      const mimeType = mime.lookup(sanitizedName) || 'application/octet-stream';
      
      // Move file to Storage provider
      await storageAdapter.saveFile(fileId, file.path);

      const dbFile = await prisma.file.create({
        data: {
          id: fileId,
          uuidName: fileId,
          originalName: sanitizedName,
          mimeType,
          size: BigInt(file.size),
          folderId: folderId || null
        }
      });

      createdFiles.push({
        id: dbFile.id,
        name: dbFile.originalName,
        mimeType: dbFile.mimeType,
        size: dbFile.size.toString()
      });

      await logActivity('Upload File', `Uploaded file "${dbFile.originalName}" (ID: ${dbFile.id})`, req);
    }

    return res.json({ success: true, files: createdFiles });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Chunk Upload logic for handling large files
export async function uploadChunk(req: AuthenticatedRequest, res: Response) {
  try {
    const { chunkIndex, totalChunks, uploadId, fileName, folderId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No chunk file provided' });
    }

    const sanitizedName = sanitizeFilename(fileName);
    const allowed = await isExtensionAllowed(sanitizedName);
    if (!allowed) {
      await fs.promises.unlink(file.path).catch(() => {});
      return res.status(400).json({ error: `File type for "${fileName}" is blocked.` });
    }

    const tempDir = path.join(os.tmpdir(), 'node-x-chunks');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, `upload_${uploadId}.tmp`);

    // Append chunk to temporary file
    const chunkData = await fs.promises.readFile(file.path);
    await fs.promises.appendFile(tempFilePath, chunkData);
    await fs.promises.unlink(file.path).catch(() => {}); // Delete current chunk

    const currentIdx = parseInt(chunkIndex, 10);
    const total = parseInt(totalChunks, 10);

    // If it's the last chunk, move from temp to storage provider
    if (currentIdx === total - 1) {
      const maxSetting = await prisma.setting.findUnique({ where: { key: 'max_upload_size' } });
      const maxSizeBytes = maxSetting ? BigInt(maxSetting.value) : BigInt(10737418240); // 10 GB

      const stats = await fs.promises.stat(tempFilePath);
      if (BigInt(stats.size) > maxSizeBytes) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
        return res.status(400).json({ error: `File "${fileName}" size exceeds configured limit.` });
      }

      const fileId = uuidv4();
      const storageAdapter = StorageService.getAdapter();
      const mimeType = mime.lookup(sanitizedName) || 'application/octet-stream';

      await storageAdapter.saveFile(fileId, tempFilePath);

      const dbFile = await prisma.file.create({
        data: {
          id: fileId,
          uuidName: fileId,
          originalName: sanitizedName,
          mimeType,
          size: BigInt(stats.size),
          folderId: folderId || null
        }
      });

      await logActivity('Upload Chunk Complete', `Uploaded large file "${sanitizedName}" (Size: ${stats.size} bytes)`, req);

      return res.json({
        success: true,
        complete: true,
        file: {
          id: dbFile.id,
          name: dbFile.originalName,
          size: dbFile.size.toString()
        }
      });
    }

    return res.json({ success: true, complete: false });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Rename File
export async function renameFile(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'File name is required' });
    }

    const dbFile = await prisma.file.update({
      where: { id },
      data: { originalName: name }
    });

    await logActivity('Rename File', `Renamed file ID ${id} to "${name}"`, req);
    return res.json({ success: true, file: dbFile });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Move File
export async function moveFile(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { folderId } = req.body;

    const dbFile = await prisma.file.update({
      where: { id },
      data: { folderId: folderId || null }
    });

    await logActivity('Move File', `Moved file ID ${id} to folder ID ${folderId || 'Root'}`, req);
    return res.json({ success: true, file: dbFile });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Delete File (Move to Trash)
export async function deleteFile(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;

    const file = await prisma.file.findUnique({
      where: { id }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    await prisma.trash.create({
      data: {
        itemType: 'FILE',
        itemId: id,
        name: file.originalName,
        fileId: id
      }
    });

    await logActivity('Delete File', `Moved file "${file.originalName}" (ID: ${id}) to Trash`, req);
    return res.json({ success: true, message: 'File moved to Trash' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// Stream file inline (Preview) / Attachment (Download)
export async function streamFile(req: Request, res: Response, asAttachment = false) {
  try {
    const { id } = req.params;
    
    // Fetch file from Database
    const file = await prisma.file.findUnique({
      where: { id },
      include: { trashItems: true }
    });

    if (!file || file.trashItems.length > 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Verify folder read permissions
    const access = await checkFolderAccess(file.folderId, 'read', req as any);
    if (!access.authorized) {
      if (access.reason === 'Password verification required') {
        return res.status(401).json({ error: 'Password verification required', folderId: file.folderId });
      }
      return res.status(403).json({ error: access.reason || 'Access denied' });
    }

    const storageAdapter = StorageService.getAdapter();
    const fileSize = Number(file.size);
    const range = req.headers.range;

    let stream;
    const headers: Record<string, string | number> = {
      'Content-Type': file.mimeType,
      'Accept-Ranges': 'bytes'
    };

    if (asAttachment) {
      headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(file.originalName)}"`;
    } else {
      headers['Content-Disposition'] = `inline; filename="${encodeURIComponent(file.originalName)}"`;
    }

    // Support HTTP Range Requests (for video/audio scrubbing and resumable downloads)
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        return res.end();
      }

      const chunksize = (end - start) + 1;
      stream = await storageAdapter.getFileStream(file.uuidName, { start, end });

      headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
      headers['Content-Length'] = chunksize;

      res.writeHead(206, headers);
    } else {
      stream = await storageAdapter.getFileStream(file.uuidName);
      headers['Content-Length'] = fileSize;
      res.writeHead(200, headers);
    }

    if (asAttachment) {
      await prisma.downloadLog.create({
        data: {
          fileId: file.id,
          ipAddress: req.headers['x-forwarded-for'] as string || req.ip || null,
          userAgent: req.headers['user-agent'] || null
        }
      }).catch(() => {});
    }

    stream.pipe(res);
  } catch (err: any) {
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message });
    }
  }
}

// Download File Endpoint
export async function downloadFile(req: Request, res: Response) {
  return streamFile(req, res, true);
}

// Preview File Endpoint
export async function previewFile(req: Request, res: Response) {
  return streamFile(req, res, false);
}
