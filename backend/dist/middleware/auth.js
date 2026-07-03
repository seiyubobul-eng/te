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
exports.authMiddleware = authMiddleware;
exports.optionalAuthMiddleware = optionalAuthMiddleware;
const jwt = __importStar(require("jsonwebtoken"));
const db_1 = __importDefault(require("../services/db"));
async function authMiddleware(req, res, next) {
    try {
        const token = req.cookies?.token;
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const secret = process.env.JWT_SECRET || 'node-x-super-secret';
        const decoded = jwt.verify(token, secret);
        const session = await db_1.default.session.findUnique({
            where: { token },
            include: { user: true }
        });
        if (!session || session.expiresAt < new Date()) {
            if (session) {
                await db_1.default.session.delete({ where: { id: session.id } }).catch(() => { });
            }
            return res.status(401).json({ error: 'Session expired or invalid' });
        }
        req.user = {
            id: session.user.id,
            email: session.user.email,
            username: session.user.username,
            role: session.user.role
        };
        next();
    }
    catch (err) {
        return res.status(401).json({ error: 'Authentication invalid' });
    }
}
async function optionalAuthMiddleware(req, res, next) {
    try {
        const token = req.cookies?.token;
        if (token) {
            const secret = process.env.JWT_SECRET || 'node-x-super-secret';
            const decoded = jwt.verify(token, secret);
            const session = await db_1.default.session.findUnique({
                where: { token },
                include: { user: true }
            });
            if (session && session.expiresAt > new Date()) {
                req.user = {
                    id: session.user.id,
                    email: session.user.email,
                    username: session.user.username,
                    role: session.user.role
                };
            }
        }
    }
    catch (err) {
        // Ignore validation errors for optional authentication
    }
    next();
}
