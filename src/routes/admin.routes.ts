import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import {
  createCentre,
  createUser,
  deleteCentre,
  deleteCentrePhoto,
  deleteUser,
  getNationalDashboard,
  getNationalReport,
  listCentres,
  listUsers,
  listCandidats,
  updateCentre,
  updateUser,
  uploadCentrePhoto,
  getDetailedStats,
  getReportByRegion,
  getAuditLogs,
  affectCandidatsToCentres,
  getAffectations,
  exportReport,
  resetCandidatStatus,
  validateCandidat
} from '../controllers/admin.controller';

const router = Router();

// Stockage des photos de centres d'examen
const centrePhotoDir = path.join(__dirname, '../../uploads/centres');
if (!fs.existsSync(centrePhotoDir)) {
  fs.mkdirSync(centrePhotoDir, { recursive: true });
}

const centrePhotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, centrePhotoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${req.params.id}_${Date.now()}${ext}`);
  },
});

const uploadCentrePhotoMiddleware = multer({
  storage: centrePhotoStorage,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error("Format d'image non supporté. Utilisez JPG, PNG, WEBP ou GIF."));
      return;
    }
    cb(null, true);
  },
});

// Routes requiring ADMIN only
const adminRouter = Router();
adminRouter.use(protect, restrictTo('ADMIN'));
adminRouter.get('/dashboard', getNationalDashboard);
adminRouter.get('/reports/national', getNationalReport);
adminRouter.get('/reports/export', exportReport);
adminRouter.get('/stats/detailed', getDetailedStats);
adminRouter.get('/reports/region/:region', getReportByRegion);
adminRouter.get('/audit', getAuditLogs);
adminRouter.get('/users', listUsers);
adminRouter.post('/users', createUser);
adminRouter.put('/users/:id', updateUser);
adminRouter.delete('/users/:id', deleteUser);
adminRouter.post('/affectation', affectCandidatsToCentres);
adminRouter.get('/affectations', getAffectations);
adminRouter.post('/candidats/reset-status', resetCandidatStatus);
adminRouter.put('/candidats/:candidatId/validate', validateCandidat);

// Routes accessible to both ADMIN and RESPONSABLE
router.use(protect, restrictTo('ADMIN', 'RESPONSABLE'));
router.get('/candidats', listCandidats);
router.get('/centres', listCentres);
router.post('/centres', createCentre);
router.put('/centres/:id', updateCentre);
router.delete('/centres/:id', deleteCentre);
router.post('/centres/:id/photo', uploadCentrePhotoMiddleware.single('photo'), uploadCentrePhoto);
router.delete('/centres/:id/photo', deleteCentrePhoto);

// Mount admin-only routes
router.use('/', adminRouter);

export default router;