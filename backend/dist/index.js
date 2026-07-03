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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = require("express-rate-limit");
const dotenv = __importStar(require("dotenv"));
const bcrypt = __importStar(require("bcryptjs"));
const db_1 = __importDefault(require("./services/db"));
const api_1 = __importDefault(require("./routes/api"));
const logger_1 = require("./middleware/logger");
dotenv.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
// Enforce standard security headers
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:"]
        }
    }
}));
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// Enforce global rate limiter
const limiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Max 1000 requests per IP per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);
// Bind API routing fallback
app.use('/api', api_1.default);
// Express global error handler
app.use((err, req, res, next) => {
    console.error('Express Unhandled Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
});
// Seed default administrator and default drive settings
async function seedDatabase() {
    try {
        const userCount = await db_1.default.user.count();
        if (userCount === 0) {
            const email = process.env.ADMIN_EMAIL || 'admin@node-x.my.id';
            const password = process.env.ADMIN_PASSWORD || 'adminpassword';
            const hashedPassword = await bcrypt.hash(password, 10);
            await db_1.default.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    username: 'Administrator',
                    role: 'ADMIN'
                }
            });
            console.log(`[SEED] Default Administrator created with email: ${email}`);
        }
        const defaultSettings = [
            { key: 'website_name', value: 'Node-X Private Drive', type: 'STRING', description: 'Name of the website' },
            { key: 'allowed_extensions', value: '*', type: 'STRING', description: 'Allowed extensions comma separated (* for all)' },
            { key: 'blocked_extensions', value: 'exe,bat,sh,cmd', type: 'STRING', description: 'Blocked extensions comma separated' },
            { key: 'max_upload_size', value: '10737418240', type: 'NUMBER', description: 'Max file upload size in bytes (10GB default)' }
        ];
        for (const setting of defaultSettings) {
            const exists = await db_1.default.setting.findUnique({ where: { key: setting.key } });
            if (!exists) {
                await db_1.default.setting.create({ data: setting });
                console.log(`[SEED] Seeded default setting: ${setting.key}`);
            }
        }
    }
    catch (err) {
        console.error('Seeding database failed:', err);
    }
}
app.listen(PORT, async () => {
    console.log(`[SERVER] Express Server running at http://localhost:${PORT}`);
    await seedDatabase();
    await (0, logger_1.logActivity)('Server Startup', `Express application listening on port ${PORT}`);
});
