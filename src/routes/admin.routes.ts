import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import {
  createCentre,
  createUser,
  deleteCentre,
  deleteUser,
  getNationalDashboard,
  getNationalReport,
  listCentres,
  listUsers,
  listCandidats,
  updateCentre,
  updateUser,
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

// Mount admin-only routes
router.use('/', adminRouter);

export default router;
