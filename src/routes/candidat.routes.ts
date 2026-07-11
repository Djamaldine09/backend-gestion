import express, { Request } from 'express';
import multer from 'multer';
import path from 'path';
import { protect, restrictTo } from '../middlewares/auth.middleware';
import { validateRequest, candidatUpdateSchema } from '../config/validation';
import {
  getCurrentCandidat,
  updateCurrentCandidat,
  getConvocation,
  getPlanning,
  getDocuments,
  uploadDocument,
} from '../controllers/candidat.controller';

const router = express.Router();
const uploadDir = path.join(__dirname, '../../uploads/documents');

const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => cb(null, uploadDir),
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const timestamp = Date.now();
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.\-\_]/g, '_');
    cb(null, `${timestamp}_${sanitized}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

/**
 * @swagger
 * /api/candidats/me:
 *   get:
 *     summary: Récupérer le profil du candidat connecté
 *     tags:
 *       - Candidats
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profil du candidat
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Candidat'
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Accès réservé aux candidats
 */
router.get('/me', protect, restrictTo('CANDIDAT'), getCurrentCandidat);

/**
 * @swagger
 * /api/candidats/me:
 *   put:
 *     summary: Mettre à jour le profil du candidat
 *     tags:
 *       - Candidats
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               numeroMatricule:
 *                 type: string
 *               dateNaissance:
 *                 type: string
 *                 format: date
 *               lieuNaissance:
 *                 type: string
 *               adresse:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profil mis à jour
 *       400:
 *         description: Erreur de validation
 *       401:
 *         description: Non authentifié
 */
router.put('/me', protect, restrictTo('CANDIDAT'), validateRequest(candidatUpdateSchema), updateCurrentCandidat);

/**
 * @swagger
 * /api/candidats/me/convocation:
 *   get:
 *     summary: Récupérer la convocation du candidat
 *     tags:
 *       - Candidats
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Convocation du candidat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 examenId:
 *                   type: string
 *                 dateEpreuve:
 *                   type: string
 *                   format: date
 *                 centre:
 *                   type: object
 *                 salle:
 *                   type: string
 *       404:
 *         description: Convocation non trouvée
 */
router.get('/me/convocation', protect, restrictTo('CANDIDAT'), getConvocation);

/**
 * @swagger
 * /api/candidats/me/planning:
 *   get:
 *     summary: Récupérer le calendrier des épreuves
 *     tags:
 *       - Candidats
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Calendrier des épreuves
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   matiere:
 *                     type: string
 *                   date:
 *                     type: string
 *                     format: date
 *                   heureDebut:
 *                     type: string
 *                   heureFin:
 *                     type: string
 */
router.get('/me/planning', protect, restrictTo('CANDIDAT'), getPlanning);

/**
 * @swagger
 * /api/candidats/me/documents:
 *   get:
 *     summary: Récupérer les pièces justificatives du candidat
 *     tags:
 *       - Candidats
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des pièces justificatives
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     photoIdentite:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         chemin:
 *                           type: string
 */
router.get('/me/documents', protect, restrictTo('CANDIDAT'), getDocuments);

/*
 * @swagger
 * /api/candidats/me/documents:
 *   post:
 *     summary: Uploader un document (pièce justificative)
 *     tags:
 *       - Candidats
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               type:
 *                 type: string
 *                 enum: [photoIdentite, acteNaissance, diplomePrecedent, photoSupp]
 *     responses:
 *       201:
 *         description: Document uploadé avec succès
 *       400:
 *         description: Erreur de fichier
 *       413:
 *         description: Fichier trop volumineux (max 5MB)
 */
router.post('/me/documents', protect, restrictTo('CANDIDAT'), upload.single('file'), uploadDocument);

export default router;