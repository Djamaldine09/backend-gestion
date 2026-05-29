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
  updateCentre,
  updateUser,
} from '../controllers/admin.controller';

const router = Router();

router.use(protect, restrictTo('ADMIN'));

router.get('/dashboard', getNationalDashboard);
router.get('/reports/national', getNationalReport);

router.get('/users', listUsers);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

router.get('/centres', listCentres);
router.post('/centres', createCentre);
router.put('/centres/:id', updateCentre);
router.delete('/centres/:id', deleteCentre);

export default router;
