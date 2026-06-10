import express, { Request, Response } from 'express';
import { registerCandidat, updateCandidatProfile, submitInscription } from '../controllers/inscription.controller';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { createLog } from '../config/logger';

const router = express.Router();
const inscriptionLog = createLog('Inscription');

/**
 * @swagger
 * /api/inscription/candidat:
 *   post:
 *     summary: Inscrire un nouveau candidat
 *     tags:
 *       - Inscription
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom:
 *                 type: string
 *               prenom:
 *                 type: string
 *               email:
 *                 type: string
 *               motDePasse:
 *                 type: string
 *               telephone:
 *                 type: string
 *               dateNaissance:
 *                 type: string
 *                 format: date
 *               lieuNaissance:
 *                 type: string
 *               genre:
 *                 type: string
 *                 enum: [M, F]
 *               cin:
 *                 type: string
 *               examen:
 *                 type: string
 *               serieFiliere:
 *                 type: string
 *               etablissementPrecedent:
 *                 type: string
 *               mentionPrecedente:
 *                 type: string
 *               adresse:
 *                 type: string
 *               emailParent:
 *                 type: string
 *     responses:
 *       201:
 *         description: Candidat inscrit avec succès
 *       400:
 *         description: Erreur de validation
 *       500:
 *         description: Erreur serveur
 */
router.post('/candidat', async (req: Request, res: Response) => {
  inscriptionLog.info('Nouvelle inscription candidat', { email: req.body.email });
  await registerCandidat(req, res);
});

/**
 * @swagger
 * /api/inscription/create:
 *   post:
 *     summary: Créer un dossier candidat pour l'utilisateur connecté
 *     tags:
 *       - Inscription
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Dossier candidat créé
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès réservé aux candidats
 *       500:
 *         description: Erreur serveur
 */
router.post('/create', protect, async (req: Request, res: Response) => {
  const userRole = (req as any).user?.role;
  if (userRole !== 'CANDIDAT') {
    res.status(403).json({ success: false, message: 'Accès réservé aux candidats' });
    return;
  }
  inscriptionLog.info('Création dossier candidat', { userId: (req as any).user?.id });
  await updateCandidatProfile(req, res);
});

/**
 * @swagger
 * /api/inscription/profile:
 *   put:
 *     summary: Mettre à jour le profil candidat
 *     tags:
 *       - Inscription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dateNaissance:
 *                 type: string
 *                 format: date
 *               lieuNaissance:
 *                 type: string
 *               genre:
 *                 type: string
 *                 enum: [M, F]
 *               cin:
 *                 type: string
 *               examen:
 *                 type: string
 *               serieFiliere:
 *                 type: string
 *               etablissementPrecedent:
 *                 type: string
 *               mentionPrecedente:
 *                 type: string
 *               adresse:
 *                 type: string
 *               emailParent:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profil mis à jour
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès réservé aux candidats
 *       500:
 *         description: Erreur serveur
 */
router.put('/profile', protect, restrictTo('CANDIDAT'), async (req: Request, res: Response) => {
  inscriptionLog.info('Mise à jour profil candidat', { userId: (req as any).user?.id });
  await updateCandidatProfile(req, res);
});

/**
 * @swagger
 * /api/inscription/submit:
 *   post:
 *     summary: Soumettre l'inscription pour validation
 *     tags:
 *       - Inscription
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Inscription soumise
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès réservé aux candidats
 *       404:
 *         description: Candidat non trouvé
 *       500:
 *         description: Erreur serveur
 */
router.post('/submit', protect, restrictTo('CANDIDAT'), async (req: Request, res: Response) => {
  inscriptionLog.info('Soumission inscription candidat', { userId: (req as any).user?.id });
  await submitInscription(req, res);
});

export default router;
