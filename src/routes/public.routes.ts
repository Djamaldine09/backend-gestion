import { Router } from 'express';
import { getPublicResultatByMatricule } from '../controllers/resultat.controller';

const router = Router();

router.get('/resultats/:matricule', getPublicResultatByMatricule);

export default router;
