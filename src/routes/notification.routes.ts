import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import {
    getAllNotifications,
    markAsRead,
    markAllAsRead,
    sendBroadcast,
    registerFcmToken,
    removeFcmToken
} from '../controllers/notification.controller';

const router = Router();

router.get('/', protect, getAllNotifications);
router.put('/read-all', protect, markAllAsRead);
router.put('/:notificationId/read', protect, markAsRead);
router.post('/broadcast', protect, restrictTo('ADMIN', 'RESPONSABLE'), sendBroadcast);
router.post('/fcm-token', protect, registerFcmToken);
router.delete('/fcm-token', protect, removeFcmToken);

export default router;
