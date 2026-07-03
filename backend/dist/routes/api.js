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
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const os = __importStar(require("os"));
const auth_1 = require("../middleware/auth");
const authorize_1 = require("../middleware/authorize");
const auth_2 = require("../controllers/auth");
const explorer_1 = require("../controllers/explorer");
const file_1 = require("../controllers/file");
const share_1 = require("../controllers/share");
const settings_1 = require("../controllers/settings");
const folders_1 = require("../controllers/folders");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ dest: os.tmpdir() });
// --- AUTHENTICATION ROUTES ---
router.post('/auth/login', auth_2.login);
router.post('/auth/logout', auth_1.authMiddleware, auth_2.logout);
router.get('/auth/session', auth_1.authMiddleware, auth_2.getSession);
// --- EXPLORER / FOLDER MANAGEMENT ---
router.get('/explorer/items', auth_1.optionalAuthMiddleware, (0, authorize_1.folderGate)('read'), explorer_1.listItems);
// New Folder Endpoints (Admin Controlled / Permissions)
router.post('/folders', auth_1.authMiddleware, folders_1.createFolder);
router.post('/folders/:id/unlock', auth_1.optionalAuthMiddleware, folders_1.unlockFolder);
router.patch('/folders/:id', auth_1.authMiddleware, folders_1.updateFolder);
router.delete('/folders/:id', auth_1.authMiddleware, folders_1.deleteFolder);
router.patch('/folders/:id/permissions', auth_1.authMiddleware, folders_1.updateFolderPermissions);
// Deprecated folder paths fallback to align compatibility
router.post('/folder', auth_1.authMiddleware, folders_1.createFolder);
router.patch('/folder/:id/rename', auth_1.authMiddleware, folders_1.updateFolder);
router.patch('/folder/:id/move', auth_1.authMiddleware, folders_1.updateFolder);
router.delete('/folder/:id', auth_1.authMiddleware, folders_1.deleteFolder);
// --- FILE MANAGEMENT (Admin or optional folderGate write uploads) ---
router.post('/file/upload', auth_1.optionalAuthMiddleware, (0, authorize_1.folderGate)('write'), upload.array('files'), file_1.uploadFiles);
router.post('/file/upload-chunk', auth_1.optionalAuthMiddleware, (0, authorize_1.folderGate)('write'), upload.single('file'), file_1.uploadChunk);
router.patch('/file/:id/rename', auth_1.authMiddleware, file_1.renameFile);
router.patch('/file/:id/move', auth_1.authMiddleware, file_1.moveFile);
router.delete('/file/:id', auth_1.authMiddleware, file_1.deleteFile);
// --- PUBLIC FILE ACCESS (Supports sharing parameters & permissions checks) ---
router.get('/file/preview/:id', auth_1.optionalAuthMiddleware, file_1.previewFile);
router.get('/file/download/:id', auth_1.optionalAuthMiddleware, file_1.downloadFile);
// --- SHARING MANAGEMENT ---
router.post('/shares', auth_1.authMiddleware, share_1.createShare);
router.get('/shares/:hash', share_1.getShare);
router.post('/shares/:hash/unlock', share_1.unlockShare);
// --- GLOBAL SETTINGS & TRASH & LOGS (Admin Only) ---
router.get('/settings', settings_1.getSettings);
router.put('/settings', auth_1.authMiddleware, settings_1.updateSettings);
router.get('/settings/stats', auth_1.authMiddleware, settings_1.getDashboardStats);
router.get('/settings/logs', auth_1.authMiddleware, settings_1.getLogs);
router.get('/settings/trash', auth_1.authMiddleware, settings_1.getTrash);
router.post('/settings/trash/:id/restore', auth_1.authMiddleware, settings_1.restoreTrash);
router.delete('/settings/trash/:id', auth_1.authMiddleware, settings_1.emptyTrashItem);
exports.default = router;
