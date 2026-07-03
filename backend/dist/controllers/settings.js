"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettings = getSettings;
exports.updateSettings = updateSettings;
exports.getDashboardStats = getDashboardStats;
exports.getLogs = getLogs;
exports.getTrash = getTrash;
exports.restoreTrash = restoreTrash;
exports.emptyTrashItem = emptyTrashItem;
const db_1 = __importDefault(require("../services/db"));
const logger_1 = require("../middleware/logger");
const storage_1 = require("../services/storage");
// Fetch global settings
async function getSettings(req, res) {
    try {
        const settings = await db_1.default.setting.findMany();
        return res.json({ success: true, settings });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// Update settings
async function updateSettings(req, res) {
    try {
        const updates = req.body; // Array of { key, value }
        if (!Array.isArray(updates)) {
            return res.status(400).json({ error: 'Payload must be an array of updates' });
        }
        for (const update of updates) {
            await db_1.default.setting.upsert({
                where: { key: update.key },
                update: { value: update.value },
                create: { key: update.key, value: update.value, type: 'STRING' }
            });
        }
        await (0, logger_1.logActivity)('Settings Change', 'Updated system settings configurations', req);
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// Fetch dashboard statistical numbers
async function getDashboardStats(req, res) {
    try {
        const totalFiles = await db_1.default.file.count({ where: { trashItems: { none: {} } } });
        const totalFolders = await db_1.default.folder.count({ where: { trashItems: { none: {} } } });
        const totalShares = await db_1.default.share.count();
        const sumResult = await db_1.default.file.aggregate({
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
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// Fetch activity logs
async function getLogs(req, res) {
    try {
        const logs = await db_1.default.activityLog.findMany({
            orderBy: { timestamp: 'desc' },
            take: 100 // Last 100 entries
        });
        return res.json({ success: true, logs });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// Fetch Trash (Recycle Bin) items
async function getTrash(req, res) {
    try {
        const trash = await db_1.default.trash.findMany({
            orderBy: { deletedAt: 'desc' }
        });
        return res.json({ success: true, trash });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// Restore item from Trash
async function restoreTrash(req, res) {
    try {
        const { id } = req.params;
        const trashItem = await db_1.default.trash.findUnique({
            where: { id }
        });
        if (!trashItem) {
            return res.status(404).json({ error: 'Recycle bin item not found' });
        }
        // Delete trash entry to restore item (makes it active again)
        await db_1.default.trash.delete({
            where: { id }
        });
        await (0, logger_1.logActivity)('Restore Trash', `Restored ${trashItem.itemType.toLowerCase()} "${trashItem.name}" from Trash`, req);
        return res.json({ success: true, message: 'Item restored successfully' });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// Permanently delete item
async function emptyTrashItem(req, res) {
    try {
        const { id } = req.params;
        const trashItem = await db_1.default.trash.findUnique({
            where: { id }
        });
        if (!trashItem) {
            return res.status(404).json({ error: 'Recycle bin item not found' });
        }
        const storageAdapter = storage_1.StorageService.getAdapter();
        if (trashItem.itemType === 'FILE') {
            const file = await db_1.default.file.findUnique({ where: { id: trashItem.itemId } });
            if (file) {
                // Delete physical file from storage provider
                await storageAdapter.deleteFile(file.uuidName).catch(() => { });
                // Delete from database
                await db_1.default.file.delete({ where: { id: file.id } }).catch(() => { });
            }
        }
        else {
            // It's a folder, recursively delete child files from disk & database
            await deleteFolderRecursively(trashItem.itemId, storageAdapter);
        }
        // Delete Trash entry
        await db_1.default.trash.delete({ where: { id } });
        await (0, logger_1.logActivity)('Empty Trash', `Permanently deleted ${trashItem.itemType.toLowerCase()} "${trashItem.name}"`, req);
        return res.json({ success: true, message: 'Item permanently deleted' });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
// Recursive helper to delete folder contents from storage provider and DB
async function deleteFolderRecursively(folderId, storageAdapter) {
    // Find child folders
    const subFolders = await db_1.default.folder.findMany({ where: { parentFolderId: folderId } });
    for (const sub of subFolders) {
        await deleteFolderRecursively(sub.id, storageAdapter);
    }
    // Find files in folder
    const files = await db_1.default.file.findMany({ where: { folderId } });
    for (const file of files) {
        await storageAdapter.deleteFile(file.uuidName).catch(() => { });
        await db_1.default.file.delete({ where: { id: file.id } }).catch(() => { });
    }
    // Delete current folder
    await db_1.default.folder.delete({ where: { id: folderId } }).catch(() => { });
}
