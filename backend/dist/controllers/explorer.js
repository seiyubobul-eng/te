"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listItems = listItems;
exports.createFolder = createFolder;
exports.renameFolder = renameFolder;
exports.moveFolder = moveFolder;
exports.deleteFolder = deleteFolder;
const db_1 = __importDefault(require("../services/db"));
const logger_1 = require("../middleware/logger");
async function listItems(req, res) {
    try {
        const folderId = req.query.folderId || null;
        const visibilityFilter = req.user?.role === 'ADMIN'
            ? undefined
            : { not: 'PRIVATE' };
        // Fetch folders not in trash
        const folders = await db_1.default.folder.findMany({
            where: {
                parentFolderId: folderId,
                trashItems: { none: {} },
                visibility: visibilityFilter
            },
            orderBy: { name: 'asc' }
        });
        // Fetch files not in trash
        const files = await db_1.default.file.findMany({
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
            currentFolder = await db_1.default.folder.findUnique({
                where: { id: folderId }
            });
            let tempFolder = currentFolder;
            while (tempFolder) {
                breadcrumbs.unshift({ id: tempFolder.id, name: tempFolder.name });
                if (tempFolder.parentFolderId) {
                    tempFolder = await db_1.default.folder.findUnique({
                        where: { id: tempFolder.parentFolderId }
                    });
                }
                else {
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
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
async function createFolder(req, res) {
    try {
        const { name, parentFolderId } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Folder name is required' });
        }
        const folder = await db_1.default.folder.create({
            data: {
                name,
                parentFolderId: parentFolderId || null
            }
        });
        await (0, logger_1.logActivity)('Create Folder', `Created folder "${name}" (ID: ${folder.id})`, req);
        return res.json({ success: true, folder });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
async function renameFolder(req, res) {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Folder name is required' });
        }
        const folder = await db_1.default.folder.update({
            where: { id },
            data: { name }
        });
        await (0, logger_1.logActivity)('Rename Folder', `Renamed folder ID ${id} to "${name}"`, req);
        return res.json({ success: true, folder });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
async function moveFolder(req, res) {
    try {
        const { id } = req.params;
        const { parentFolderId } = req.body;
        if (id === parentFolderId) {
            return res.status(400).json({ error: 'Cannot move folder into itself' });
        }
        const folder = await db_1.default.folder.update({
            where: { id },
            data: { parentFolderId: parentFolderId || null }
        });
        await (0, logger_1.logActivity)('Move Folder', `Moved folder ID ${id} to parent ID ${parentFolderId || 'Root'}`, req);
        return res.json({ success: true, folder });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
async function deleteFolder(req, res) {
    try {
        const { id } = req.params;
        const folder = await db_1.default.folder.findUnique({
            where: { id }
        });
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
        await (0, logger_1.logActivity)('Delete Folder', `Moved folder "${folder.name}" (ID: ${id}) to Trash`, req);
        return res.json({ success: true, message: 'Folder moved to Trash' });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
