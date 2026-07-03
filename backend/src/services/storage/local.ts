import { StorageAdapter } from './index';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

export class LocalStorageAdapter implements StorageAdapter {
  private storageRoot: string;

  constructor() {
    this.storageRoot = path.resolve(process.env.STORAGE_PATH || '../storage');
    if (!fs.existsSync(this.storageRoot)) {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    }
  }

  private getFilePath(fileId: string): string {
    return path.join(this.storageRoot, fileId);
  }

  async saveFile(fileId: string, sourcePath: string): Promise<string> {
    const destPath = this.getFilePath(fileId);
    await fs.promises.rename(sourcePath, destPath).catch(async (err) => {
      // Fallback if cross-device link error occurs (e.g. Docker volumes / temporary folders)
      if (err.code === 'EXDEV') {
        await fs.promises.copyFile(sourcePath, destPath);
        await fs.promises.unlink(sourcePath);
      } else {
        throw err;
      }
    });
    return destPath;
  }

  async getFileStream(fileId: string, range?: { start: number; end: number }): Promise<Readable> {
    const filePath = this.getFilePath(fileId);
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found in storage');
    }
    if (range) {
      return fs.createReadStream(filePath, { start: range.start, end: range.end });
    }
    return fs.createReadStream(filePath);
  }

  async deleteFile(fileId: string): Promise<void> {
    const filePath = this.getFilePath(fileId);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  async getFileSize(fileId: string): Promise<number> {
    const filePath = this.getFilePath(fileId);
    const stats = await fs.promises.stat(filePath);
    return stats.size;
  }
}
