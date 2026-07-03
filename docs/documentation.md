# Node-X Private Cloud Storage - System Documentation

Node-X is a production-ready private cloud drive application tailored for administrator-controlled file and folder management. Visitors can view shared contents or download shared files but have no upload/create abilities.

---

## 1. Project Directory Structure

```text
node-x/
├── backend/                  # Express.js REST API
│   ├── prisma/               # Schema configuration
│   └── src/
│       ├── controllers/      # Route controllers (Auth, Explorer, File, Share, Settings)
│       ├── middleware/       # Auth validation, Rate limiting, Custom Logging
│       └── services/         # DB (Prisma Client) & Polymorphic Storage Adapters
├── frontend/                 # Next.js 15 App Router Frontend
│   ├── src/
│   │   ├── app/              # Routes: Login, Dashboard Console, Share View /s/[shareId]
│   │   └── lib/              # Custom Fetch API credentials wrappers
├── nginx/                    # Reverse Proxy configuration and HTTPS SSL certificates
├── docker/                   # Deployment compilation Dockerfiles
├── storage/                  # Local drive uploads repository folder (Root outside web folders)
├── docker-compose.yml        # Multi-container conductor
└── implementation_plan.md    # Architecture outline
```

---

## 2. Environment Variables

### Backend (`backend/.env`)
- `PORT`: Port Express listens on (default `4000`).
- `NODE_ENV`: Runtime environment (`development` / `production`).
- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: Signing token secret key.
- `ADMIN_EMAIL`: Default administrator email (seeded if no admins exist on boot).
- `ADMIN_PASSWORD`: Default administrator login password.
- `STORAGE_PROVIDER`: Storage provider switch (`local`, adaptable to `s3`, `r2`, etc.).
- `STORAGE_PATH`: Disk path for uploads (relative to backend folder or absolute path).
- `FRONTEND_URL`: URL of Next.js frontend (used for CORS mapping).

### Frontend (`frontend/.env.local`)
- `NEXT_PUBLIC_BACKEND_URL`: Base URL pointing to the Express server API (default `http://localhost:4000`).

---

## 3. Database Schema

Managed via Prisma ORM:

```prisma
// Users credentials
model User {
  id        String    @id @default(uuid())
  email     String    @unique
  password  String
  username  String
  sessions  Session[]
}

// Drive Folders Tree structure
model Folder {
  id             String    @id @default(uuid())
  name           String
  parentFolderId String?
  parentFolder   Folder?   @relation("SubFolders", fields: [parentFolderId], references: [id])
  subFolders     Folder[]  @relation("SubFolders")
  files          File[]
}

// Uploaded file metadata
model File {
  id           String        @id @default(uuid())
  originalName String
  uuidName     String        @unique // Physical file name on disk
  mimeType     String
  size         BigInt
  folderId     String?
  folder       Folder?       @relation(fields: [folderId], references: [id])
}

// Share Configuration Gating
model Share {
  id               String    @id @default(uuid())
  hash             String    @unique // Unique URL token
  passwordHash     String?   // bcrypt password for folder locks
  expiresAt        DateTime?
  maxDownloads     Int?
  currentDownloads Int
  readOnly         Boolean
  downloadOnly     Boolean
  disableDownload  Boolean
  disablePreview   Boolean
  isPublic         Boolean
}
```

---

## 4. API Documentation

### Administrator Console

#### Auth
- `POST /api/auth/login` - Authenticate admin credentials and generate cookie token.
- `POST /api/auth/logout` - Invalidate session token.
- `GET /api/auth/session` - Return active session metadata.

#### Explorer
- `GET /api/explorer/items?folderId=[id]` - Returns subfolders and files inside folder.
- `POST /api/folder` - Create folder.
- `PATCH /api/folder/:id/rename` - Rename folder.
- `PATCH /api/folder/:id/move` - Move folder to another location.
- `DELETE /api/folder/:id` - Move folder tree to Recycle bin.

#### Files
- `POST /api/file/upload` - Standard multipart upload.
- `POST /api/file/upload-chunk` - Upload file chunks sequentially.
- `PATCH /api/file/:id/rename` - Rename file.
- `PATCH /api/file/:id/move` - Move file.
- `DELETE /api/file/:id` - Move file to Recycle bin.

#### Settings and Logs
- `GET /api/settings/stats` - Fetch storage size and counters.
- `GET /api/settings/logs` - Fetch audit logs.
- `GET /api/settings/trash` - Fetch Recycle bin items list.
- `POST /api/settings/trash/:id/restore` - Restore deleted item.
- `DELETE /api/settings/trash/:id` - Delete permanently.

---

## 5. Security Architecture Notes

1. **Path Traversal Protection**: Uploaded files are renamed on disk to random UUIDs. Streaming controllers serve items based on database ID mappings. No real folders are created on disk.
2. **Visitor Upload Block**: Only APIs matching active session validation tokens are authorized to execute write/upload parameters. Rate limiting restricts brute force on verification links.
3. **HTTP Range & Resume Streaming**: File downloads support scrubbing/seek on video players and resumable download queues.

---

## 6. Backup & Restore Operations

### Database Backup
```bash
docker exec -t node-x-db pg_dumpall -c -U postgres > backup.sql
```

### Database Restore
```bash
cat backup.sql | docker exec -i node-x-db psql -U postgres
```

### Storage Files Backup
Simply backup `/storage` folder recursively containing files renamed to UUIDs.

---

## 7. Troubleshooting

- **Large file upload fails**: Ensure Nginx `client_max_body_size` is matching configuration limits.
- **Prisma Client error**: Run `npx prisma generate` to rebuild TypeScript types.
