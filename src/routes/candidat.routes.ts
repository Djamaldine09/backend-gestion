import express, { Request } from 'express';
import multer from 'multer';
import path from 'path';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import {
  getCurrentCandidat,
  updateCurrentCandidat,
  getConvocation,
  getPlanning,
  uploadDocument,
} from '../controllers/candidat.controller';

const router = express.Router();
const uploadDir = path.join(__dirname, '../../uploads/documents');

const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => cb(null, uploadDir),
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const timestamp = Date.now();
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.\-\_]/g, '_');
    cb(null, `${timestamp}_${sanitized}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get('/me', protect, restrictTo('CANDIDAT'), getCurrentCandidat);
router.put('/me', protect, restrictTo('CANDIDAT'), updateCurrentCandidat);
router.get('/me/convocation', protect, restrictTo('CANDIDAT'), getConvocation);
router.get('/me/planning', protect, restrictTo('CANDIDAT'), getPlanning);
router.post('/me/documents', protect, restrictTo('CANDIDAT'), upload.single('file'), uploadDocument);

export default router;
