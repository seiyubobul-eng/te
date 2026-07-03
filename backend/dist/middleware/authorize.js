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
exports.getUnlockedFolders = getUnlockedFolders;
exports.checkFolderAccess = checkFolderAccess;
exports.folderGate = folderGate;
const jwt = __importStar(require("jsonwebtoken"));
const db_1 = __importDefault(require("../services/db"));
// Helper to extract unlocked folders from cookies
function getUnlockedFolders(req) {
    try {
        const token = req.cookies?.unlocked_folders;
        if (!token)
            return [];
        const secret = process.env.JWT_SECRET || 'node-x-super-secret';
        const decoded = jwt.verify(token, secret);
        return decoded.unlockedFolders || [];
    }
    catch (_) {
        return [];
    }
}
// Main access check helper
async function checkFolderAccess(folderId, action, req) {
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
    const folder = await db_1.default.folder.findUnique({
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
    let currentId = folder.parentFolderId;
    while (currentId) {
        const parent = await db_1.default.folder.findUnique({ where: { id: currentId } });
        if (!parent)
            break;
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
function folderGate(action) {
    return async (req, res, next) => {
        try {
            const folderId = req.query.folderId || req.body.folderId || req.body.parentFolderId || null;
            const access = await checkFolderAccess(folderId, action, req);
            if (!access.authorized) {
                if (access.reason === 'Password verification required') {
                    return res.status(401).json({ error: 'Password verification required', folderId });
                }
                return res.status(403).json({ error: access.reason || 'Access denied' });
            }
            next();
        }
        catch (err) {
            return res.status(500).json({ error: err.message });
        }
    };
}
