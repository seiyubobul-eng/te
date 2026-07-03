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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalStorageAdapter = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
class LocalStorageAdapter {
    storageRoot;
    constructor() {
        this.storageRoot = process.env.STORAGE_PATH
            ? path.resolve(process.env.STORAGE_PATH)
            : path.join(os.tmpdir(), 'node-x', 'storage');
        if (!fs.existsSync(this.storageRoot)) {
            fs.mkdirSync(this.storageRoot, { recursive: true });
        }
    }
    getFilePath(fileId) {
        return path.join(this.storageRoot, fileId);
    }
    async saveFile(fileId, sourcePath) {
        const destPath = this.getFilePath(fileId);
        await fs.promises.rename(sourcePath, destPath).catch(async (err) => {
            // Fallback if cross-device link error occurs (e.g. Docker volumes / temporary folders)
            if (err.code === 'EXDEV') {
                await fs.promises.copyFile(sourcePath, destPath);
                await fs.promises.unlink(sourcePath);
            }
            else {
                throw err;
            }
        });
        return destPath;
    }
    async getFileStream(fileId, range) {
        const filePath = this.getFilePath(fileId);
        if (!fs.existsSync(filePath)) {
            throw new Error('File not found in storage');
        }
        if (range) {
            return fs.createReadStream(filePath, { start: range.start, end: range.end });
        }
        return fs.createReadStream(filePath);
    }
    async deleteFile(fileId) {
        const filePath = this.getFilePath(fileId);
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
    }
    async getFileSize(fileId) {
        const filePath = this.getFilePath(fileId);
        const stats = await fs.promises.stat(filePath);
        return stats.size;
    }
}
exports.LocalStorageAdapter = LocalStorageAdapter;
