import { Router } from 'express';
import { sendSMSCode, verifySMSCode, resendSMSCode, sendPaymentNotification, sendRegistrationConfirmation, sendReminder } from '../controllers/sms.controller';

const router = Router();

// SMS de vérification
router.post('/send', sendSMSCode);
router.post('/verify', verifySMSCode);
router.post('/resend', resendSMSCode);

// SMS de notification
router.post('/payment-notification', sendPaymentNotification);
router.post('/registration-confirmation', sendRegistrationConfirmation);
router.post('/reminder', sendReminder);

export default router;
