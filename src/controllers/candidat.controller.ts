import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Candidat, { ICandidat } from '../models/Candidat';
import User from '../models/User';
import CentreExamen from '../models/CentreExamen';
import { buildCentreAffectePayload, ensureCandidateCentreAffecte } from '../utils/centreAffecte';

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
  return Candidat.findOne({ user: userId })
    .populate({ path: 'user', select: 'nom prenom email role' })
    .populate({
      path: 'centreExamen',
      select: 'nom adresse ville region salle numeroPlace latitude longitude telephone email coords photo',
    });
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

    const candidatFormatted = candidat.toObject();
    if (candidatFormatted.dateNaissance) {
      candidatFormatted.dateNaissance = new Date(candidatFormatted.dateNaissance).toISOString().slice(0, 10);
    }

    const centreSource = candidatFormatted.centreAffecte || {};
    const centreRelation = candidatFormatted.centreExamen || {};
    const mergedCentre = {
      ...centreRelation,
      ...centreSource,
      nom: centreSource.nom || centreRelation.nom,
      adresse: centreSource.adresse || centreRelation.adresse,
      ville: centreSource.ville || centreRelation.ville,
      region: centreSource.region || centreRelation.region,
      salle: centreSource.salle || centreRelation.salle,
      numeroPlace: centreSource.numeroPlace || centreRelation.numeroPlace,
      telephone: centreSource.telephone || centreRelation.telephone,
      email: centreSource.email || centreRelation.email,
      coords: centreSource.coords ?? centreRelation.coords,
      latitude: centreSource.latitude ?? centreRelation.latitude,
      longitude: centreSource.longitude ?? centreRelation.longitude,
      photo: centreRelation.photo ?? centreSource.photo,
    };

    const hasCentreData = Boolean(
      mergedCentre.nom ||
      mergedCentre.adresse ||
      mergedCentre.ville ||
      mergedCentre.region ||
      mergedCentre.salle ||
      mergedCentre.numeroPlace ||
      mergedCentre.telephone ||
      mergedCentre.email ||
      (mergedCentre.coords?.lat !== undefined && mergedCentre.coords?.lng !== undefined) ||
      (mergedCentre.latitude !== undefined && mergedCentre.longitude !== undefined)
    );

    const centreAffecte = hasCentreData
      ? buildCentreAffectePayload(
          centreRelation as any,
          {
            ...mergedCentre,
            coords: mergedCentre.coords ?? (mergedCentre.latitude !== undefined || mergedCentre.longitude !== undefined
              ? { lat: mergedCentre.latitude, lng: mergedCentre.longitude }
              : undefined),
          }
        )
      : undefined;

    if (centreAffecte && (!centreAffecte.coords || (centreAffecte.coords.lat === undefined && centreAffecte.coords.lng === undefined))) {
      const ensured = await ensureCandidateCentreAffecte(candidatFormatted, centreRelation as any);
      if (ensured) {
        candidatFormatted.centreAffecte = ensured;
      }
    } else if (centreAffecte && centreAffecte.coords) {
      await Candidat.findByIdAndUpdate(candidat._id, { centreAffecte: { ...centreSource, ...centreAffecte, coords: centreAffecte.coords } });
    }

    res.status(200).json({
      success: true,
      data: {
        ...candidatFormatted,
        centreAffecte,
      },
    });
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

    res.status(200).json({ success: true, data: updated });
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
      planning: candidat.planning || [],
    };

    if (payload.hash && convocation.hash !== payload.hash) {
      convocation.hash = payload.hash;
      await candidat.save();
    }

    res.status(200).json({ success: true, data: responseData });
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

    res.status(200).json({ success: true, data: candidat.planning || [] });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
/**
 * Récupérer les documents (pièces justificatives) du candidat
 */
export const getDocuments = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const candidat = await findCandidate(req.user!.id);
    if (!candidat) {
      res.status(404).json({ success: false, message: 'Candidat introuvable' });
      return;
    }

    res.status(200).json({
      success: true,
      data: candidat.piecesJustificatives || {
        photoIdentite: { status: 'manquant' },
        acteNaissance: { status: 'manquant' },
        diplomePrecedent: { status: 'manquant' },
        photoSupp: { status: 'manquant' },
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
export const uploadDocument = async (req: MulterRequest, res: Response): Promise<void> => {
  try {
    console.log('🔍 uploadDocument START');
    const candidat = await findCandidate(req.user!.id);
    if (!candidat) {
      console.log('❌ Candidat introuvable');
      res.status(404).json({ success: false, message: 'Candidat introuvable' });
      return;
    }

    if (!req.file || !req.body.type) {
      console.log('❌ Fichier ou type manquant');
      res.status(400).json({ success: false, message: 'Fichier ou type manquant' });
      return;
    }

    const { type } = req.body;
    if (!['photoIdentite', 'acteNaissance', 'diplomePrecedent', 'photoSupp'].includes(type)) {
      console.log('❌ Type de document invalide:', type);
      res.status(400).json({ success: false, message: 'Type de document invalide' });
      return;
    }

    const destinationPath = path.relative(path.join(__dirname, '..'), req.file.path).replace(/\\/g, '/');
    console.log(`  📁 Saving ${type} with path: ${destinationPath}`);
    
    // Assigner avec la structure correcte: { status, chemin }
    if (!candidat.piecesJustificatives) {
      candidat.piecesJustificatives = {
        photoIdentite: { status: 'manquant' },
        acteNaissance: { status: 'manquant' },
        diplomePrecedent: { status: 'manquant' },
        photoSupp: { status: 'manquant' },
      };
    }
    
    candidat.piecesJustificatives[type as keyof typeof candidat.piecesJustificatives] = {
      status: 'valide',
      chemin: destinationPath,
    };

    console.log('  💾 Saving candidat...');
    await candidat.save();
    console.log('  ✅ Document saved');

    res.status(201).json({
      success: true,
      message: 'Document téléversé avec succès',
      data: {
        type,
        status: 'valide',
        chemin: destinationPath,
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('❌ Erreur uploadDocument:', error);
    console.error('  Stack:', error.stack);
    res.status(500).json({ success: false, message: error.message });
  }
};