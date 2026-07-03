import { Router } from 'express';
import multer from 'multer';
import * as os from 'os';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { folderGate } from '../middleware/authorize';
import { login, logout, getSession } from '../controllers/auth';
import { listItems } from '../controllers/explorer';
import { uploadFiles, uploadChunk, renameFile, moveFile, deleteFile, previewFile, downloadFile } from '../controllers/file';
import { createShare, getShare, unlockShare } from '../controllers/share';
import { getSettings, updateSettings, getDashboardStats, getLogs, getTrash, restoreTrash, emptyTrashItem } from '../controllers/settings';
import { createFolder, unlockFolder, updateFolderPermissions, updateFolder, deleteFolder } from '../controllers/folders';

const router = Router();
const upload = multer({ dest: os.tmpdir() });

// --- AUTHENTICATION ROUTES ---
router.post('/auth/login', login);
router.post('/auth/logout', authMiddleware, logout);
router.get('/auth/session', authMiddleware, getSession);

// --- EXPLORER / FOLDER MANAGEMENT ---
router.get('/explorer/items', optionalAuthMiddleware, folderGate('read'), listItems);

// New Folder Endpoints (Admin Controlled / Permissions)
router.post('/folders', authMiddleware, createFolder);
router.post('/folders/:id/unlock', optionalAuthMiddleware, unlockFolder);
router.patch('/folders/:id', authMiddleware, updateFolder);
router.delete('/folders/:id', authMiddleware, deleteFolder);
router.patch('/folders/:id/permissions', authMiddleware, updateFolderPermissions);

// Deprecated folder paths fallback to align compatibility
router.post('/folder', authMiddleware, createFolder);
router.patch('/folder/:id/rename', authMiddleware, updateFolder);
router.patch('/folder/:id/move', authMiddleware, updateFolder);
router.delete('/folder/:id', authMiddleware, deleteFolder);

// --- FILE MANAGEMENT (Admin or optional folderGate write uploads) ---
router.post('/file/upload', optionalAuthMiddleware, folderGate('write'), upload.array('files'), uploadFiles);
router.post('/file/upload-chunk', optionalAuthMiddleware, folderGate('write'), upload.single('file'), uploadChunk);
router.patch('/file/:id/rename', authMiddleware, renameFile);
router.patch('/file/:id/move', authMiddleware, moveFile);
router.delete('/file/:id', authMiddleware, deleteFile);

// --- PUBLIC FILE ACCESS (Supports sharing parameters & permissions checks) ---
router.get('/file/preview/:id', optionalAuthMiddleware, previewFile);
router.get('/file/download/:id', optionalAuthMiddleware, downloadFile);

// --- SHARING MANAGEMENT ---
router.post('/shares', authMiddleware, createShare);
router.get('/shares/:hash', getShare);
router.post('/shares/:hash/unlock', unlockShare);

// --- GLOBAL SETTINGS & TRASH & LOGS (Admin Only) ---
router.get('/settings', getSettings);
router.put('/settings', authMiddleware, updateSettings);
router.get('/settings/stats', authMiddleware, getDashboardStats);
router.get('/settings/logs', authMiddleware, getLogs);
router.get('/settings/trash', authMiddleware, getTrash);
router.post('/settings/trash/:id/restore', authMiddleware, restoreTrash);
router.delete('/settings/trash/:id', authMiddleware, emptyTrashItem);

export default router;
