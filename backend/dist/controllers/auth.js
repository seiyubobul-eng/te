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
exports.login = login;
exports.logout = logout;
exports.getSession = getSession;
const bcrypt = __importStar(require("bcryptjs"));
const jwt = __importStar(require("jsonwebtoken"));
const db_1 = __importDefault(require("../services/db"));
const logger_1 = require("../middleware/logger");
async function login(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const user = await db_1.default.user.findUnique({ where: { email } });
        if (!user) {
            await (0, logger_1.logActivity)('Login Failed', `Invalid credentials for ${email}`, req);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            await (0, logger_1.logActivity)('Login Failed', `Invalid password for ${email}`, req);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const secret = process.env.JWT_SECRET || 'node-x-super-secret';
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration
        // Create session placeholder first
        const session = await db_1.default.session.create({
            data: {
                userId: user.id,
                token: 'temp_token_' + Math.random(),
                expiresAt
            }
        });
        // Create JWT containing session information
        const token = jwt.sign({ sessionId: session.id, userId: user.id }, secret, {
            expiresIn: '7d'
        });
        // Update with real signed JWT token
        await db_1.default.session.update({
            where: { id: session.id },
            data: { token }
        });
        // Set cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            expires: expiresAt
        });
        await (0, logger_1.logActivity)('Login Success', `User ${user.username} logged in`, req);
        return res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                username: user.username
            }
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
async function logout(req, res) {
    try {
        const token = req.cookies?.token;
        if (token) {
            await db_1.default.session.delete({ where: { token } }).catch(() => { });
        }
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });
        if (req.user) {
            await (0, logger_1.logActivity)('Logout Success', `User ${req.user.username} logged out`, req);
        }
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
async function getSession(req, res) {
    return res.json({
        authenticated: true,
        user: req.user
    });
}
