import { Router } from 'express';
import { webhookMobileMoney } from '../controllers/paiement.controller';

const router = Router();

// Route de callback appelée par l'API Mobile Money (MVola, Orange, etc.)
// Ex: POST https://votre-domaine.com/api/v1/paiements/webhook
router.post('/webhook', webhookMobileMoney);

export default router;