import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import {
    webhookMobileMoney,
    initiatePaiement,
    checkPaiementStatus,
    getPaiementHistory,
    retryPaiement
} from '../controllers/paiement.controller';

const router = Router();

// Route de callback appelée par l'API Mobile Money (MVola, Orange, etc.)
router.post('/webhook', webhookMobileMoney);

// Routes protégées pour les paiements
router.post('/initier', protect, initiatePaiement);
router.get('/:transactionId/status', protect, checkPaiementStatus);
router.get('/history', protect, getPaiementHistory);
router.post('/:candidatId/retry', protect, retryPaiement);

export default router;