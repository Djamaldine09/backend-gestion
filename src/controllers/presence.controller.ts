import { Response } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Candidat from '../models/Candidat';
import Presence from '../models/Presence';

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

    // Enregistrer la présence
    const presence = await Presence.create({
      candidat: candidatId,
      examen: examenId,
      centre: candidat.centreAffecte?.nom || 'Inconnu',
      date: new Date(),
      heureArrivee: new Date().toLocaleTimeString('fr-FR'),
      qrCodeScanne: qrPayload,
      surveillant: req.user!.id,
      statut: 'PRESENT'
    });

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
      presenceId: presence._id
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getPresenceHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { examenId } = req.query;
    const filter: any = {};
    
    if (examenId) {
      filter.examen = examenId;
    }

    const presences = await Presence.find(filter)
      .populate('candidat')
      .populate('surveillant', 'nom prenom email')
      .populate('examen', 'titre type')
      .sort({ date: -1 });

    res.status(200).json(presences);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const exportPresenceCSV = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { examenId } = req.params;
    
    const presences = await Presence.find({ examen: examenId })
      .populate('candidat')
      .populate('surveillant', 'nom prenom')
      .sort({ date: 1 });

    // Générer CSV
    const headers = 'Date,Heure,Candidat,Matricule,Statut,Surveillant\n';
    const rows = presences.map(p => {
      const candidat = p.candidat as any;
      const surveillant = p.surveillant as any;
      return `${p.date.toISOString().split('T')[0]},${p.heureArrivee},${candidat?.numeroMatricule || 'N/A'},${p.statut},${surveillillant?.nom || 'N/A'} ${surveillillant?.prenom || ''}`;
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=presences_${examenId}.csv`);
    res.status(200).send(headers + rows);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
