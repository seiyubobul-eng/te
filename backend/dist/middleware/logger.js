"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logActivity = logActivity;
const db_1 = __importDefault(require("../services/db"));
async function logActivity(event, details = null, req) {
    try {
        const ipAddress = req ? (req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || null) : null;
        const userAgent = req ? (req.headers['user-agent'] || null) : null;
        await db_1.default.activityLog.create({
            data: {
                event,
                details,
                ipAddress,
                userAgent
            }
        });
    }
    catch (err) {
        console.error('Failed to write activity log:', err);
    }
}
