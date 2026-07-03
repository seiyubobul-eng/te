import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcryptjs';
import prisma from './services/db';
import router from './routes/api';
import { logActivity } from './middleware/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Enforce standard security headers
app.use(helmet({
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

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Enforce global rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Max 1000 requests per IP per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Bind API routing fallback
app.use('/api', router);

// Express global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Express Unhandled Error:', err);
  return res.status(500).json({ error: 'Internal Server Error' });
});

// Seed default administrator and default drive settings
async function seedDatabase() {
  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      const email = process.env.ADMIN_EMAIL || 'admin@node-x.my.id';
      const password = process.env.ADMIN_PASSWORD || 'adminpassword';
      const hashedPassword = await bcrypt.hash(password, 10);
      
      await prisma.user.create({
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
      const exists = await prisma.setting.findUnique({ where: { key: setting.key } });
      if (!exists) {
        await prisma.setting.create({ data: setting });
        console.log(`[SEED] Seeded default setting: ${setting.key}`);
      }
    }
  } catch (err) {
    console.error('Seeding database failed:', err);
  }
}

app.listen(PORT, async () => {
  console.log(`[SERVER] Express Server running at http://localhost:${PORT}`);
  await seedDatabase();
  await logActivity('Server Startup', `Express application listening on port ${PORT}`);
});
