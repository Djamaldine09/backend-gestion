import { Response } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Candidat from '../models/Candidat';

const QR_SECRET = process.env.QR_SECRET || 'examgest-secret';

function createQrHash(payload: string): string {
  return crypto.createHmac('sha256', QR_SECRET).update(payload).digest('hex');
}

export const scanPresence = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { qrPayload } = req.body;
    if (!qrPayload) {
      res.status(400).json({ message: 'Payload QR manquant' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(qrPayload);
    } catch {
      res.status(400).json({ message: 'Payload QR invalide' });
      return;
    }

    const { candidatId, matricule, examenId, salle, place, hash } = parsed;
    if (!candidatId || !matricule || !examenId || !salle || !place || !hash) {
      res.status(400).json({ message: 'Payload QR incomplet' });
      return;
    }

    const serialized = `${candidatId}|${matricule}|${examenId}|${salle}|${place}`;
    const expectedHash = createQrHash(serialized);

    if (expectedHash !== hash) {
      res.status(401).json({ message: 'QR code non valide ou altéré' });
      return;
    }

    const candidat = await Candidat.findById(candidatId).populate({ path: 'user', select: 'nom prenom email' });
    if (!candidat) {
      res.status(404).json({ message: 'Candidat introuvable pour ce QR' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'QR code valide. Présence enregistrée.',
      candidat: {
        id: candidat._id,
        matricule: candidat.numeroMatricule,
        nom: (candidat.user as any)?.nom,
        prenom: (candidat.user as any)?.prenom,
      },
      examenId,
      salle,
      place,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
