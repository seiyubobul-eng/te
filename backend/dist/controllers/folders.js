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
exports.createFolder = createFolder;
exports.unlockFolder = unlockFolder;
exports.updateFolderPermissions = updateFolderPermissions;
exports.updateFolder = updateFolder;
exports.deleteFolder = deleteFolder;
const bcrypt = __importStar(require("bcryptjs"));
const jwt = __importStar(require("jsonwebtoken"));
const db_1 = __importDefault(require("../services/db"));
const logger_1 = require("../middleware/logger");
const authorize_1 = require("../middleware/authorize");
// Rate limiting map for unlocks
const unlockAttempts = new Map();
function checkUnlockRateLimit(ip) {
    const record = unlockAttempts.get(ip);
    if (!record)
        return { allowed: true };
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
function registerUnlockFailure(ip) {
    const record = unlockAttempts.get(ip);
    const now = new Date();
    if (!record) {
        const lockTime = new Date(now.getTime() + 5 * 60 * 1000); // Lock 5 mins
        unlockAttempts.set(ip, { count: 1, lockedUntil: lockTime });
    }
    else {
        record.count += 1;
        if (record.count >= 5) {
            record.lockedUntil = new Date(now.getTime() + 5 * 60 * 1000);
        }
    }
}
// 1. Create Folder (Admin Only)
async function createFolder(req, res) {
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
        const folder = await db_1.default.folder.create({
            data: {
                name,
                parentFolderId: parentFolderId || null,
                visibility: visibility || 'PUBLIC',
                passwordHash,
                allowUpload: !!allowUpload,
                ownerId: req.user.id
            }
        });
        await (0, logger_1.logActivity)('Create Folder', `Created folder "${name}" (ID: ${folder.id})`, req);
        return res.json({ success: true, folder });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// 2. Unlock Protected Folder
async function unlockFolder(req, res) {
    try {
        const { id } = req.params;
        const { password } = req.body;
        const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
        // Check rate limiter
        const rateCheck = checkUnlockRateLimit(ip);
        if (!rateCheck.allowed) {
            return res.status(429).json({
                error: `Too many failed attempts. Try again in ${rateCheck.waitTimeMinutes} minute(s).`
            });
        }
        const folder = await db_1.default.folder.findUnique({ where: { id } });
        if (!folder || folder.visibility !== 'PROTECTED') {
            return res.status(400).json({ error: 'Folder is not protected or not found' });
        }
        if (!folder.passwordHash) {
            return res.status(500).json({ error: 'Folder password config missing' });
        }
        const passwordMatch = await bcrypt.compare(password || '', folder.passwordHash);
        if (!passwordMatch) {
            registerUnlockFailure(ip);
            await (0, logger_1.logActivity)('Folder Unlock Failed', `Failed unlock attempt for folder "${folder.name}"`, req);
            return res.status(401).json({ error: 'Incorrect password' });
        }
        // Clear rate limit record on success
        unlockAttempts.delete(ip);
        // Save unlocked folder to JWT cookie
        const currentList = (0, authorize_1.getUnlockedFolders)(req);
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
        await (0, logger_1.logActivity)('Folder Unlock Success', `Unlocked folder "${folder.name}"`, req);
        return res.json({ success: true, message: 'Folder unlocked successfully' });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// 3. Update Folder Permissions (Admin Only)
async function updateFolderPermissions(req, res) {
    try {
        const { id } = req.params;
        const { visibility, password, allowUpload } = req.body;
        if (req.user?.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const folder = await db_1.default.folder.findUnique({ where: { id } });
        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }
        let passwordHash = folder.passwordHash;
        if (visibility === 'PROTECTED') {
            if (password) {
                const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
                passwordHash = await bcrypt.hash(password, rounds);
            }
        }
        else {
            passwordHash = null; // Clear password if visibility changes
        }
        const updated = await db_1.default.folder.update({
            where: { id },
            data: {
                visibility: visibility || folder.visibility,
                passwordHash,
                allowUpload: allowUpload !== undefined ? !!allowUpload : folder.allowUpload
            }
        });
        await (0, logger_1.logActivity)('Folder Permissions Update', `Updated permissions for "${folder.name}"`, req);
        return res.json({ success: true, folder: updated });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// 4. Update Folder general/rename/move (Admin Only)
async function updateFolder(req, res) {
    try {
        const { id } = req.params;
        const { name, parentFolderId } = req.body;
        if (req.user?.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const updated = await db_1.default.folder.update({
            where: { id },
            data: {
                name: name || undefined,
                parentFolderId: parentFolderId !== undefined ? parentFolderId : undefined
            }
        });
        await (0, logger_1.logActivity)('Update Folder', `Renamed/moved folder "${updated.name}"`, req);
        return res.json({ success: true, folder: updated });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// 5. Delete Folder (Admin Only)
async function deleteFolder(req, res) {
    try {
        const { id } = req.params;
        if (req.user?.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const folder = await db_1.default.folder.findUnique({ where: { id } });
        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }
        await db_1.default.trash.create({
            data: {
                itemType: 'FOLDER',
                itemId: id,
                name: folder.name,
                folderId: id
            }
        });
        await (0, logger_1.logActivity)('Delete Folder', `Moved folder "${folder.name}" to Trash`, req);
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
