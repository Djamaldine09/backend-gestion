import { Router } from 'express';
import { sendSMSCode, verifySMSCode, resendSMSCode } from '../controllers/sms.controller';

const router = Router();

router.post('/send', sendSMSCode);
router.post('/verify', verifySMSCode);
router.post('/resend', resendSMSCode);

export default router;
