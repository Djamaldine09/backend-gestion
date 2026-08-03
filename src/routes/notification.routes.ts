import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { getAllNotifications, markAsRead, markAllAsRead, sendBroadcast } from '../controllers/notification.controller';

const router = Router();

router.get('/', protect, getAllNotifications);
router.put('/read-all', protect, markAllAsRead);
router.put('/:notificationId/read', protect, markAsRead);
router.post('/broadcast', protect, restrictTo('ADMIN', 'RESPONSABLE'), sendBroadcast);

export default router;