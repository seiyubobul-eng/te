"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFiles = uploadFiles;
exports.uploadChunk = uploadChunk;
exports.renameFile = renameFile;
exports.moveFile = moveFile;
exports.deleteFile = deleteFile;
exports.streamFile = streamFile;
exports.downloadFile = downloadFile;
exports.previewFile = previewFile;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const uuid_1 = require("uuid");
const mime = __importStar(require("mime-types"));
const db_1 = __importDefault(require("../services/db"));
const storage_1 = require("../services/storage");
const logger_1 = require("../middleware/logger");
const authorize_1 = require("../middleware/authorize");
// Sanitize filename to avoid injection and path traversal
function sanitizeFilename(filename) {
    const base = path.basename(filename);
    return base.replace(/[^a-zA-Z0-9_.-]/g, '_');
}
// Helper to check if file extension is allowed
async function isExtensionAllowed(filename) {
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    // Hardcoded script/executable blocks
    const hardcodedBlocked = ['exe', 'bat', 'cmd', 'ps1', 'sh'];
    if (hardcodedBlocked.includes(ext))
        return false;
    // Fetch settings from Database
    const allowedSetting = await db_1.default.setting.findUnique({ where: { key: 'allowed_extensions' } });
    const blockedSetting = await db_1.default.setting.findUnique({ where: { key: 'blocked_extensions' } });
    if (blockedSetting && blockedSetting.value) {
        const blockedList = blockedSetting.value.split(',').map(e => e.trim().toLowerCase());
        if (blockedList.includes(ext))
            return false;
    }
    if (allowedSetting && allowedSetting.value && allowedSetting.value !== '*') {
        const allowedList = allowedSetting.value.split(',').map(e => e.trim().toLowerCase());
        if (!allowedList.includes(ext))
            return false;
    }
    return true;
}
// Single / Multiple File Upload (Standard)
async function uploadFiles(req, res) {
    try {
        const folderId = req.body.folderId || null;
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }
        const storageAdapter = storage_1.StorageService.getAdapter();
        const createdFiles = [];
        const maxSetting = await db_1.default.setting.findUnique({ where: { key: 'max_upload_size' } });
        const maxSizeBytes = maxSetting ? BigInt(maxSetting.value) : BigInt(10737418240); // 10 GB
        for (const file of files) {
            const allowed = await isExtensionAllowed(file.originalname);
            if (!allowed) {
                await fs.promises.unlink(file.path).catch(() => { });
                return res.status(400).json({ error: `File type for "${file.originalname}" is blocked.` });
            }
            if (BigInt(file.size) > maxSizeBytes) {
                await fs.promises.unlink(file.path).catch(() => { });
                return res.status(400).json({ error: `File "${file.originalname}" size exceeds configured limit.` });
            }
            const fileId = (0, uuid_1.v4)();
            const sanitizedName = sanitizeFilename(file.originalname);
            const mimeType = mime.lookup(sanitizedName) || 'application/octet-stream';
            // Move file to Storage provider
            await storageAdapter.saveFile(fileId, file.path);
            const dbFile = await db_1.default.file.create({
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
            await (0, logger_1.logActivity)('Upload File', `Uploaded file "${dbFile.originalName}" (ID: ${dbFile.id})`, req);
        }
        return res.json({ success: true, files: createdFiles });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// Chunk Upload logic for handling large files
async function uploadChunk(req, res) {
    try {
        const { chunkIndex, totalChunks, uploadId, fileName, folderId } = req.body;
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No chunk file provided' });
        }
        const sanitizedName = sanitizeFilename(fileName);
        const allowed = await isExtensionAllowed(sanitizedName);
        if (!allowed) {
            await fs.promises.unlink(file.path).catch(() => { });
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
        await fs.promises.unlink(file.path).catch(() => { }); // Delete current chunk
        const currentIdx = parseInt(chunkIndex, 10);
        const total = parseInt(totalChunks, 10);
        // If it's the last chunk, move from temp to storage provider
        if (currentIdx === total - 1) {
            const maxSetting = await db_1.default.setting.findUnique({ where: { key: 'max_upload_size' } });
            const maxSizeBytes = maxSetting ? BigInt(maxSetting.value) : BigInt(10737418240); // 10 GB
            const stats = await fs.promises.stat(tempFilePath);
            if (BigInt(stats.size) > maxSizeBytes) {
                await fs.promises.unlink(tempFilePath).catch(() => { });
                return res.status(400).json({ error: `File "${fileName}" size exceeds configured limit.` });
            }
            const fileId = (0, uuid_1.v4)();
            const storageAdapter = storage_1.StorageService.getAdapter();
            const mimeType = mime.lookup(sanitizedName) || 'application/octet-stream';
            await storageAdapter.saveFile(fileId, tempFilePath);
            const dbFile = await db_1.default.file.create({
                data: {
                    id: fileId,
                    uuidName: fileId,
                    originalName: sanitizedName,
                    mimeType,
                    size: BigInt(stats.size),
                    folderId: folderId || null
                }
            });
            await (0, logger_1.logActivity)('Upload Chunk Complete', `Uploaded large file "${sanitizedName}" (Size: ${stats.size} bytes)`, req);
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
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// Rename File
async function renameFile(req, res) {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'File name is required' });
        }
        const dbFile = await db_1.default.file.update({
            where: { id },
            data: { originalName: name }
        });
        await (0, logger_1.logActivity)('Rename File', `Renamed file ID ${id} to "${name}"`, req);
        return res.json({ success: true, file: dbFile });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// Move File
async function moveFile(req, res) {
    try {
        const { id } = req.params;
        const { folderId } = req.body;
        const dbFile = await db_1.default.file.update({
            where: { id },
            data: { folderId: folderId || null }
        });
        await (0, logger_1.logActivity)('Move File', `Moved file ID ${id} to folder ID ${folderId || 'Root'}`, req);
        return res.json({ success: true, file: dbFile });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// Delete File (Move to Trash)
async function deleteFile(req, res) {
    try {
        const { id } = req.params;
        const file = await db_1.default.file.findUnique({
            where: { id }
        });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        await db_1.default.trash.create({
            data: {
                itemType: 'FILE',
                itemId: id,
                name: file.originalName,
                fileId: id
            }
        });
        await (0, logger_1.logActivity)('Delete File', `Moved file "${file.originalName}" (ID: ${id}) to Trash`, req);
        return res.json({ success: true, message: 'File moved to Trash' });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// Stream file inline (Preview) / Attachment (Download)
async function streamFile(req, res, asAttachment = false) {
    try {
        const { id } = req.params;
        // Fetch file from Database
        const file = await db_1.default.file.findUnique({
            where: { id },
            include: { trashItems: true }
        });
        if (!file || file.trashItems.length > 0) {
            return res.status(404).json({ error: 'File not found' });
        }
        // Verify folder read permissions
        const access = await (0, authorize_1.checkFolderAccess)(file.folderId, 'read', req);
        if (!access.authorized) {
            if (access.reason === 'Password verification required') {
                return res.status(401).json({ error: 'Password verification required', folderId: file.folderId });
            }
            return res.status(403).json({ error: access.reason || 'Access denied' });
        }
        const storageAdapter = storage_1.StorageService.getAdapter();
        const fileSize = Number(file.size);
        const range = req.headers.range;
        let stream;
        const headers = {
            'Content-Type': file.mimeType,
            'Accept-Ranges': 'bytes'
        };
        if (asAttachment) {
            headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(file.originalName)}"`;
        }
        else {
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
        }
        else {
            stream = await storageAdapter.getFileStream(file.uuidName);
            headers['Content-Length'] = fileSize;
            res.writeHead(200, headers);
        }
        if (asAttachment) {
            await db_1.default.downloadLog.create({
                data: {
                    fileId: file.id,
                    ipAddress: req.headers['x-forwarded-for'] || req.ip || null,
                    userAgent: req.headers['user-agent'] || null
                }
            }).catch(() => { });
        }
        stream.pipe(res);
    }
    catch (err) {
        if (!res.headersSent) {
            return res.status(500).json({ error: err.message });
        }
    }
}
// Download File Endpoint
async function downloadFile(req, res) {
    return streamFile(req, res, true);
}
// Preview File Endpoint
async function previewFile(req, res) {
    return streamFile(req, res, false);
}
