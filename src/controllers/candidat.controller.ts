import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Candidat, { ICandidat } from '../models/Candidat';
import User from '../models/User';

type MulterRequest = AuthenticatedRequest & {
  file?: Express.Multer.File;
};

const QR_SECRET = process.env.QR_SECRET || 'examgest-secret';
const UPLOAD_DIR = path.join(__dirname, '../../uploads/documents');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function createQrHash(payload: string): string {
  return crypto.createHmac('sha256', QR_SECRET).update(payload).digest('hex');
}

async function findCandidate(userId: string) {
  return Candidat.findOne({ user: userId }).populate({ path: 'user', select: 'nom prenom email role' });
}

function buildConvocationPayload(candidat: ICandidat) {
  const convocation = candidat.convocation;
  if (!convocation) {
    throw new Error('Convocation non générée pour ce candidat.');
  }

  const payloadBase = {
    v: 1,
    candidatId: String(candidat._id),
    matricule: candidat.numeroMatricule || 'UNKNOWN',
    examenId: convocation.examenId,
    salle: convocation.salle,
    place: convocation.numeroPlace,
  };
  const serialized = `${payloadBase.candidatId}|${payloadBase.matricule}|${payloadBase.examenId}|${payloadBase.salle}|${payloadBase.place}`;
  return { ...payloadBase, hash: createQrHash(serialized) };
}

export const getCurrentCandidat = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const candidat = await findCandidate(req.user!.id);
    if (!candidat) {
      res.status(404).json({ message: 'Candidat introuvable' });
      return;
    }

    // Convertir les dates en format yyyy-MM-dd pour le frontend
    const candidatFormatted = candidat.toObject();
    if (candidatFormatted.dateNaissance) {
      candidatFormatted.dateNaissance = new Date(candidatFormatted.dateNaissance).toISOString().slice(0, 10);
    }

    res.status(200).json(candidatFormatted);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCurrentCandidat = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const candidat = await findCandidate(req.user!.id);
    if (!candidat) {
      res.status(404).json({ message: 'Candidat introuvable' });
      return;
    }

    const updates = { ...req.body };
    if (updates.user) {
      await User.findByIdAndUpdate(candidat.user, updates.user, { new: true, runValidators: true });
      delete updates.user;
    }

    const updated = await Candidat.findOneAndUpdate({ user: req.user!.id }, updates, {
      new: true,
      runValidators: true,
      context: 'query',
    }).populate({ path: 'user', select: 'nom prenom email role' });

    res.status(200).json(updated);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getConvocation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const candidat = await findCandidate(req.user!.id);
    if (!candidat) {
      res.status(404).json({ message: 'Candidat introuvable' });
      return;
    }

    const convocation = candidat.convocation;
    if (!convocation) {
      res.status(404).json({ message: 'Convocation non générée pour ce candidat.' });
      return;
    }

    const payload = buildConvocationPayload(candidat);
    const responseData = {
      qrPayload: JSON.stringify(payload),
      candidatId: String(candidat._id),
      examenId: payload.examenId,
      examenTitre: candidat.examen,
      dateEpreuve: convocation.dateEpreuve ? convocation.dateEpreuve.toISOString().slice(0, 10) : '',
      heureDebut: convocation.heureDebut,
      heureFin: convocation.heureFin,
      centre: {
        nom: convocation.centre?.nom || '',
        adresse: convocation.centre?.adresse || '',
        ville: convocation.centre?.ville || '',
      },
      salle: payload.salle,
      numeroPlace: payload.place,
      matricule: candidat.numeroMatricule || 'N/A',
      prenom: (candidat.user as any)?.prenom || '',
      nom: (candidat.user as any)?.nom || '',
    };

    if (payload.hash && convocation.hash !== payload.hash) {
      convocation.hash = payload.hash;
      await candidat.save();
    }

    res.status(200).json(responseData);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getPlanning = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const candidat = await findCandidate(req.user!.id);
    if (!candidat) {
      res.status(404).json({ message: 'Candidat introuvable' });
      return;
    }

    res.status(200).json(candidat.planning || []);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const uploadDocument = async (req: MulterRequest, res: Response): Promise<void> => {
  try {
    const candidat = await findCandidate(req.user!.id);
    if (!candidat) {
      res.status(404).json({ message: 'Candidat introuvable' });
      return;
    }

    if (!req.file || !req.body.type) {
      res.status(400).json({ message: 'Fichier ou type manquant' });
      return;
    }

    const { type } = req.body;
    if (!['photoIdentite', 'acteNaissance', 'diplomePrecedent'].includes(type)) {
      res.status(400).json({ message: 'Type de document invalide' });
      return;
    }

    const destinationPath = path.relative(path.join(__dirname, '..'), req.file.path).replace(/\\/g, '/');
    candidat.piecesJustificatives = {
      ...candidat.piecesJustificatives,
      [type]: destinationPath,
    } as any;

    await candidat.save();

    // Retourner la structure attendue par le frontend
    res.status(201).json({
      message: 'Document téléversé avec succès',
      type,
      url: destinationPath,
      status: 'valide',
      uploadedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
