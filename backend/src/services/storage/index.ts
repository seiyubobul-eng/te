import { Readable } from 'stream';

export interface StorageAdapter {
  saveFile(fileId: string, sourcePath: string): Promise<string>;
  getFileStream(fileId: string, range?: { start: number; end: number }): Promise<Readable>;
  deleteFile(fileId: string): Promise<void>;
  getFileSize(fileId: string): Promise<number>;
}

export class StorageService {
  private static instance: StorageAdapter;

  public static getAdapter(): StorageAdapter {
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
