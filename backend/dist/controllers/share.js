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
exports.createShare = createShare;
exports.getShare = getShare;
exports.unlockShare = unlockShare;
const crypto = __importStar(require("crypto"));
const bcrypt = __importStar(require("bcryptjs"));
const db_1 = __importDefault(require("../services/db"));
const logger_1 = require("../middleware/logger");
// Create a new Share Link
async function createShare(req, res) {
    try {
        const { folderId, fileId, password, expiresAt, maxDownloads, readOnly, downloadOnly, disableDownload, disablePreview, isPublic } = req.body;
        if (!folderId && !fileId) {
            return res.status(400).json({ error: 'Folder ID or File ID is required' });
        }
        // Generate random 10-character link hash
        const hash = crypto.randomBytes(5).toString('hex');
        let passwordHash = null;
        if (password) {
            passwordHash = await bcrypt.hash(password, 10);
        }
        const share = await db_1.default.share.create({
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
        await (0, logger_1.logActivity)('Create Share', `Created share link for ${folderId ? 'folder' : 'file'} ID ${folderId || fileId} (Hash: ${hash})`, req);
        return res.json({ success: true, share });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// Get Share details (Visitor Endpoint)
async function getShare(req, res) {
    try {
        const { hash } = req.params;
        const share = await db_1.default.share.findUnique({
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
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// Unlock password protected share link
async function unlockShare(req, res) {
    try {
        const { hash } = req.params;
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }
        const share = await db_1.default.share.findUnique({
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
            await (0, logger_1.logActivity)('Password Failed', `Failed unlock attempt for share hash ${hash}`, req);
            return res.status(401).json({ error: 'Incorrect password' });
        }
        await (0, logger_1.logActivity)('Password Success', `Successful unlock for share hash ${hash}`, req);
        // Fetch authorized items
        const content = await fetchShareContent(share, req.query.folderId || null);
        return res.json({
            success: true,
            share,
            content
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// Helper to fetch files and subfolders in shared folder recursively/selectively
async function fetchShareContent(share, subFolderId) {
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
        let checkId = subFolderId;
        while (checkId) {
            const checkFolder = await db_1.default.folder.findUnique({ where: { id: checkId } });
            if (!checkFolder)
                break;
            if (checkFolder.id === share.folderId) {
                isValidChild = true;
                break;
            }
            checkId = checkFolder.parentFolderId;
        }
        if (!isValidChild) {
            throw new Error('Access denied: folder is not in share path');
        }
    }
    const folders = await db_1.default.folder.findMany({
        where: {
            parentFolderId: currentFolderId,
            trashItems: { none: {} }
        },
        orderBy: { name: 'asc' }
    });
    const files = await db_1.default.file.findMany({
        where: {
            folderId: currentFolderId,
            trashItems: { none: {} }
        },
        orderBy: { originalName: 'asc' }
    });
    const folderDetails = await db_1.default.folder.findUnique({
        where: { id: currentFolderId }
    });
    // Calculate sharing breadcrumbs starting from shared root
    const breadcrumbs = [];
    let currentId = currentFolderId;
    while (currentId) {
        const f = await db_1.default.folder.findUnique({ where: { id: currentId } });
        if (!f)
            break;
        breadcrumbs.unshift({ id: f.id, name: f.name });
        if (f.id === share.folderId)
            break; // Stop at shared parent root
        currentId = f.parentFolderId;
    }
    return {
        breadcrumbs,
        currentFolder: folderDetails,
        folders,
        files
    };
}
