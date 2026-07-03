"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
class StorageService {
    static instance;
    static getAdapter() {
        if (!this.instance) {
            const type = process.env.STORAGE_PROVIDER || 'local';
            switch (type.toLowerCase()) {
                case 'local':
                    const { LocalStorageAdapter } = require('./local');
                    this.instance = new LocalStorageAdapter();
                    break;
                // Other cases like S3, R2, B2 can be added here
                default:
                    throw new Error(`Unsupported storage provider: ${type}`);
            }
        }
        return this.instance;
    }
}
exports.StorageService = StorageService;
