import { Router } from 'express';
import * as multer from 'multer';
import * as os from 'os';
import { authMiddleware } from '../middleware/auth';
import { login, logout, getSession } from '../controllers/auth';
import { listItems, createFolder, renameFolder, moveFolder, deleteFolder } from '../controllers/explorer';
import { uploadFiles, uploadChunk, renameFile, moveFile, deleteFile, previewFile, downloadFile } from '../controllers/file';
import { createShare, getShare, unlockShare } from '../controllers/share';
import { getSettings, updateSettings, getDashboardStats, getLogs, getTrash, restoreTrash, emptyTrashItem } from '../controllers/settings';

const router = Router();
const upload = multer({ dest: os.tmpdir() });

// --- AUTHENTICATION ROUTES ---
router.post('/auth/login', login);
router.post('/auth/logout', authMiddleware, logout);
router.get('/auth/session', authMiddleware, getSession);

// --- EXPLORER / FOLDER MANAGEMENT (Admin Only) ---
router.get('/explorer/items', authMiddleware, listItems);
router.post('/folder', authMiddleware, createFolder);
router.patch('/folder/:id/rename', authMiddleware, renameFolder);
router.patch('/folder/:id/move', authMiddleware, moveFolder);
router.delete('/folder/:id', authMiddleware, deleteFolder);

// --- FILE MANAGEMENT (Admin Only for Upload/Modify) ---
router.post('/file/upload', authMiddleware, upload.array('files'), uploadFiles);
router.post('/file/upload-chunk', authMiddleware, upload.single('file'), uploadChunk);
router.patch('/file/:id/rename', authMiddleware, renameFile);
router.patch('/file/:id/move', authMiddleware, moveFile);
router.delete('/file/:id', authMiddleware, deleteFile);

// --- PUBLIC FILE ACCESS (Supports sharing parameters) ---
router.get('/file/preview/:id', previewFile);
router.get('/file/download/:id', downloadFile);

// --- SHARING MANAGEMENT ---
router.post('/shares', authMiddleware, createShare); // Admin create share
router.get('/shares/:hash', getShare);               // Public share metadata/content
router.post('/shares/:hash/unlock', unlockShare);     // Public unlock share

// --- GLOBAL SETTINGS & TRASH & LOGS (Admin Only) ---
router.get('/settings', getSettings);
router.put('/settings', authMiddleware, updateSettings);
router.get('/settings/stats', authMiddleware, getDashboardStats);
router.get('/settings/logs', authMiddleware, getLogs);
router.get('/settings/trash', authMiddleware, getTrash);
router.post('/settings/trash/:id/restore', authMiddleware, restoreTrash);
router.delete('/settings/trash/:id', authMiddleware, emptyTrashItem);

export default router;
