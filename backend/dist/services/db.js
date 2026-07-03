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
const client_1 = require("@prisma/client");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL;
const tmpDbPath = path.join(os.tmpdir(), 'dev.db');
if (isProd) {
    try {
        if (!fs.existsSync(tmpDbPath)) {
            // Look up schema file path to seed from
            const srcDbPath = path.join(process.cwd(), 'prisma', 'dev.db');
            if (fs.existsSync(srcDbPath)) {
                fs.copyFileSync(srcDbPath, tmpDbPath);
            }
        }
    }
    catch (err) {
        console.error('Failed to copy SQLite database to tmp:', err);
    }
}
const prisma = new client_1.PrismaClient({
    datasources: isProd
        ? { db: { url: `file:${tmpDbPath}` } }
        : undefined
});
exports.default = prisma;
