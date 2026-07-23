import { Router } from 'express';
import {
    sendSMSCode,
    verifySMSCode,
    resendSMSCode,
    sendPaymentNotification,
    sendRegistrationConfirmation,
    sendReminder,
    sendLoginOTP,
    verifyLoginOTP,
} from '../controllers/sms.controller';
import { validateRequest, otpLoginSendSchema, otpLoginVerifySchema } from '../config/validation';

const router = Router();

// SMS de vérification
router.post('/send', sendSMSCode);
router.post('/verify', verifySMSCode);
router.post('/resend', resendSMSCode);

// SMS de notification
router.post('/payment-notification', sendPaymentNotification);
router.post('/registration-confirmation', sendRegistrationConfirmation);
router.post('/reminder', sendReminder);

// Connexion par téléphone (OTP SMS)
router.post('/login/send', validateRequest(otpLoginSendSchema), sendLoginOTP);
router.post('/login/verify', validateRequest(otpLoginVerifySchema), verifyLoginOTP);

export default router;
