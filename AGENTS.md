# AGENTS.md: Backend (Express.js + TypeScript + MongoDB)

Backend for the exam management system. This guide helps AI agents implement features, fix bugs, and maintain code quality following established patterns.

---

## Quick Start

```bash
npm run dev      # Start on localhost:5000 (auto-restart)
npm run test     # Not implemented (add Jest)
```

**Health endpoint:** `GET http://localhost:5000/api/health`  
**API documentation:** `GET http://localhost:5000/api-docs` (Swagger)

---

## Folder Structure

```
src/
├── app.ts                 # Express setup, middleware, routes registration
├── config/
│   ├── db.ts             # MongoDB connection
│   ├── logger.ts         # Winston setup with context labels
│   ├── swagger.ts        # OpenAPI/Swagger configuration
│   └── validation.ts     # Joi schemas for all endpoints
├── controllers/          # HTTP request handlers (business logic)
├── middlewares/          # Auth, error handling, validation
├── models/               # Mongoose schemas
├── routes/               # Route definitions (use validateRequest middleware)
└── services/             # Additional business logic (e.g., affectation algorithm)
```

---

## Core Patterns

### 1. Request Validation (Joi + Custom Middleware)

**Define schema** in `src/config/validation.ts`:
```typescript
export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  motDePasse: Joi.string().min(8).required(),
});
```

**Use middleware** in routes:
```typescript
router.post('/login', validateRequest(loginSchema), loginController.login);
```

**Middleware behavior:**
- Validates against Joi schema
- **Collects all errors** (abortEarly: false)
- **Strips unknown fields** (security: prevents injection)
- Returns 400 with error array if validation fails
- Injects validated `req.body` into controller

---

### 2. Authentication Pipeline (Middleware Composition)

**Step 1: Verify JWT token** (inject `req.user`)
```typescript
router.get('/protected', protect, controllerFunction);
```

**Step 2: Check role-based access**
```typescript
router.post('/admin', protect, restrictTo('ADMIN', 'RESPONSABLE'), controllerFunction);
```

**How it works:**
```typescript
// protect middleware:
export const protect = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// restrictTo middleware (curried):
export const restrictTo = (...allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  };
};
```

**Roles in system:**
- `ADMIN` - Full system access
- `RESPONSABLE` - Exam oversight, grade review
- `SURVEILLANT` - Attendance scanning (QR)
- `CORRECTEUR` - Grade entry
- `CANDIDAT` - Student (self-service exam status)

---

### 3. Async Error Handling (catchAsync Wrapper)

**Problem:** Express doesn't catch Promise rejections in async controllers

**Solution:** Wrap all async controllers
```typescript
// middlewares/error.middleware.ts
export const catchAsync = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);  // Pass rejected promise to error handler
};

// Usage in controller:
export const createExam = catchAsync(async (req, res, next) => {
  // Errors here automatically go to error handler
  const exam = await Exam.create(req.body);
  res.json(exam);
});
```

**Global error handler** (at end of app.ts):
```typescript
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});
```

---

### 4. Mongoose Pre-Hooks for Automation

**Password hashing on User save:**
```typescript
UserSchema.pre<IUser>('save', async function() {
  if (!this.isModified('motDePasse')) return;
  const salt = await bcrypt.genSalt(10);
  this.motDePasse = await bcrypt.hash(this.motDePasse, salt);
});
```

**Auto-calculate grades on Result save:**
```typescript
ResultatSchema.pre<IResultat>('save', function() {
  if (this.notes.length > 0) {
    const totalPoints = this.notes.reduce((sum, n) => sum + (n.valeur * n.coefficient), 0);
    const totalCoeffs = this.notes.reduce((sum, n) => sum + n.coefficient, 0);
    this.moyenneGenerale = totalPoints / totalCoeffs;
    
    // Auto-set status
    this.statutFinal = this.moyenneGenerale >= 10 ? 'ADMIS'
                     : this.moyenneGenerale >= 8 ? 'REPECHAGE'
                     : 'REFUSE';
  }
});
```

**Key rule:** Pre-hooks run BEFORE save — use for calculated fields, hashing, validation.

---

### 5. QR Code Integrity Verification

**Problem:** QR codes can be tampered with  
**Solution:** HMAC-SHA256 hash embedded in payload

```typescript
// Generate QR with hash
const payload = JSON.stringify({ candidatId, examenId, date });
const hash = crypto.createHmac('sha256', QR_SECRET).update(payload).digest('hex');
const qrCode = QRCode.toDataURL(`${payload}|${hash}`);

// Verify on scan
const [data, receivedHash] = qrCodeContent.split('|');
const expectedHash = crypto.createHmac('sha256', QR_SECRET).update(data).digest('hex');
if (receivedHash !== expectedHash) {
  throw new UnauthorizedError('QR code tampering detected');
}
```

---

### 6. File Upload Sanitization (Multer)

```typescript
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/documents'),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    // Remove special chars to prevent path traversal
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${timestamp}_${sanitized}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }  // 5MB max
});

// Usage in routes:
router.post('/upload', protect, upload.single('document'), uploadController);
```

---

### 7. Logging with Context

```typescript
// config/logger.ts
export const createLog = (label: string) => {
  return {
    info: (msg, context) => logger.info(msg, { label, ...context }),
    error: (msg, error, context) => logger.error(msg, { label, error, ...context })
  };
};

// Usage:
const appLog = createLog('App');
appLog.info('Starting server', { port: 5000 });
appLog.error('Database failed', err, { retrying: true });
```

**Log files:** `logs/combined.log` (all) and `logs/error.log` (errors only)

---

## Implementing Features: Step-by-Step

### Adding a New Endpoint

1. **Add validation schema** → `src/config/validation.ts`
   ```typescript
   export const createExamSchema = Joi.object({
     nom: Joi.string().required(),
     dateExamen: Joi.date().required(),
     // ... other fields
   });
   ```

2. **Create controller** → `src/controllers/exam.controller.ts`
   ```typescript
   export const createExam = catchAsync(async (req, res) => {
     const exam = await Exam.create(req.body);
     res.status(201).json({ success: true, data: exam });
   });
   ```

3. **Add route** → `src/routes/exam.routes.ts`
   ```typescript
   router.post(
     '/create',
     protect,
     restrictTo('ADMIN', 'RESPONSABLE'),
     validateRequest(createExamSchema),
     createExam
   );
   ```

4. **Add Swagger documentation** in controller JSDoc:
   ```typescript
   /**
    * @route POST /api/examens/create
    * @group Examens
    * @param {CreateExamRequest.model} body.body - Request body
    * @returns {200} - Success response
    * @security Bearer
    */
   ```

5. **Register route in app.ts**
   ```typescript
   app.use('/api/examens', examRoutes);
   ```

---

### Modifying a Data Model

1. **Update Mongoose schema** → `src/models/`
2. **Add/update pre-hooks** if calculations needed
3. **Update API response types** in corresponding controller
4. **Update validation schemas** for endpoints that use it
5. **Update Swagger if types changed**
6. **Regenerate API docs** by restarting dev server

**Database migration note:** MongoDB is schemaless, but validate old/new data compatibility in pre-hooks.

---

### Adding Tests

Currently no tests implemented. To add:

```bash
npm install --save-dev jest supertest ts-jest @types/jest
```

Example test:
```typescript
// tests/auth.test.ts
import request from 'supertest';
import app from '../src/app';

describe('Auth', () => {
  it('should login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', motDePasse: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });
});
```

---

## Common Tasks

### Check Database Connection
```bash
npm run dev  # Watch logs for connection messages
# OR check: curl http://localhost:5000/api/health
```

### View API Documentation
Open browser: `http://localhost:5000/api-docs`

### Add a New Role
1. Update `src/models/User.ts` - add to enum
2. Add role check in relevant routes
3. Document in this guide

### Debug a Request
```typescript
// Add logging in controller
const appLog = createLog('Controller');
appLog.info('Request received', { body: req.body });
```

Then check `logs/combined.log` while running dev server.

---

## Pitfalls to Avoid ⚠️

| Issue | Solution |
|-------|----------|
| **Forgetting `catchAsync` wrapper** | Unhandled promise rejections crash silently | Wrap all async controllers |
| **Not stripping unknown fields** | Injection attacks via unexpected fields | Add `stripUnknown: true` to Joi validation |
| **Hardcoding secrets in code** | Credentials exposed in Git | Use `.env` variables only |
| **No pagination on list endpoints** | OOM with millions of records | Add `skip` and `limit` to queries |
| **Mongoose doesn't verify foreign keys** | Invalid references accepted | Manually check refs before save, or use transactions |
| **Pre-hook infinite loops** | Hook modifies field → triggers hook again | Check `isModified()` before changing |
| **Not validating file types** | Malicious files uploaded | Add MIME type check to Multer |

---

## Environment Variables

Required in `.env`:
```env
PORT=5000
NODE_ENV=development
JWT_SECRET=<long_random_string>     # DO NOT COMMIT
MONGO_URI=mongodb+srv://...         # Connection string
QR_SECRET=examgest-secret
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
LOG_LEVEL=info
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "Cannot find module 'express'" | Dependencies not installed | `npm install` |
| "ECONNREFUSED on :27017" | MongoDB not running | Start MongoDB cluster, check MONGO_URI |
| "jwt malformed" | Invalid token format or secret mismatch | Verify JWT_SECRET, token structure |
| "File upload fails silently" | `/uploads/documents` doesn't exist | `mkdir -p uploads/documents && chmod 755 uploads/documents` |
| "Swagger docs return 404" | Routes not registered before Swagger | Ensure `app.use(swaggerUi, swaggerSpec)` is early in middleware stack |

---

## When To Refactor

- **Controller is >100 lines** → Extract business logic to service
- **Schema pre-hook is complex** → Move to separate service method
- **Multiple endpoints share validation** → Create reusable schema
- **Error codes duplicated** → Create error class hierarchy
- **Logging scattered** → Centralize via createLog factory

---

## Related Docs

- **Root project guide:** [../AGENTS.md](../AGENTS.md)
- **API endpoints:** Browse `src/routes/` files
- **Database schemas:** Browse `src/models/` files
- **Swagger/OpenAPI:** `http://localhost:5000/api-docs` (when running)
