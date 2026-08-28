import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import {
  affecterCandidatsNationaux,
  corrigerSallesAuto,
  getAffectationStats
} from '../controllers/affectation-auto.controller';

const router = Router();

/**
 * POST /api/affectation-auto/lancer
 * 
 * Lancer l'affectation automatique pour un examen
 * 
 * Permissions: ADMIN, RESPONSABLE
 * 
 * Body:
 * {
 *   "examenId": "507f1f77bcf86cd799439011"
 * }
 * 
 * Response:
 * {
 *   "succes": true,
 *   "message": "Affectation automatique terminée",
 *   "resultats": {
 *     "totalCandidatsAffectes": 4567,
 *     "totalCentresUtilises": 87,
 *     "regionsTraitees": 22,
 *     "erreurs": ["Sofia: Capacité insuffisante..."]
 *   }
 * }
 */
router.post(
  '/lancer',
  protect,
  restrictTo('ADMIN', 'RESPONSABLE'),
  affecterCandidatsNationaux
);

router.post(
  '/corriger-salles',
  protect,
  restrictTo('ADMIN', 'RESPONSABLE'),
  corrigerSallesAuto
);

/**
 * GET /api/affectation-auto/stats/:examenId
 * 
 * Obtenir les statistiques d'affectation pour un examen
 * 
 * Permissions: ADMIN, RESPONSABLE
 * 
 * Response:
 * {
 *   "totalCandidats": 5234,
 *   "affectes": 4987,
 *   "nonAffectes": 247,
 *   "tauxAffectation": "95.3",
 *   "centresUtilises": 87,
 *   "regionsAffectees": ["Analamanga", "Vakinankaratra", ...]
 * }
 */
router.get(
  '/stats/:examenId',
  protect,
  restrictTo('ADMIN', 'RESPONSABLE'),
  getAffectationStats
);

export default router;
