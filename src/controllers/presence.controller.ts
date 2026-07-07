import { Response } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Candidat from '../models/Candidat';
import CentreExamen from '../models/CentreExamen';
import Presence from '../models/Presence';

const QR_SECRET = process.env.QR_SECRET || 'examgest-secret';

function createQrHash(payload: string): string {
  return crypto.createHmac('sha256', QR_SECRET).update(payload).digest('hex');
}

export const scanPresence = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const qrPayload = req.body.qrPayload || req.body.qrCode;
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

    let centreId = candidat.centreExamen as any;
    if (!centreId && candidat.centreAffecte?.nom) {
      const centre = await CentreExamen.findOne({
        nom: candidat.centreAffecte.nom,
        ville: candidat.centreAffecte.ville,
      });
      centreId = centre?._id;
    }
    if (!centreId && candidat.convocation?.centre?.nom) {
      const centre = await CentreExamen.findOne({
        nom: candidat.convocation.centre.nom,
        ville: candidat.convocation.centre.ville,
      });
      centreId = centre?._id;
    }

    if (!centreId) {
      res.status(500).json({ message: 'Centre d’examen introuvable pour ce candidat.' });
      return;
    }

    // Enregistrer la présence
    const presence = await Presence.create({
      candidat: candidatId,
      examen: examenId,
      centre: centreId,
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
    const rawExamenId = req.query.examenId;
    const examenId = typeof rawExamenId === 'string'
      ? rawExamenId.trim()
      : Array.isArray(rawExamenId) && typeof rawExamenId[0] === 'string'
        ? rawExamenId[0].trim()
        : undefined;
    const filter: any = {};
    
    if (examenId) {
      filter.examen = examenId;
    }

    const presences = await Presence.find(filter)
      .populate({
        path: 'candidat',
        populate: { path: 'user', select: 'nom prenom numeroMatricule' }
      })
      .populate('surveillant', 'nom prenom email')
      .populate('examen', 'titre type')
      .populate('centre', 'nom')
      .sort({ date: -1 });

    if (examenId) {
      const scannedCandidateIds = new Set(presences.map((p) => (p.candidat as any)?._id?.toString()).filter(Boolean));
      const absentCandidates = await Candidat.find({
        ['convocation.examenId']: examenId,
        _id: { $nin: Array.from(scannedCandidateIds) }
      } as any).populate('user', 'nom prenom numeroMatricule');

      const absentRows = absentCandidates.map((candidat) => ({
        _id: candidat._id,
        candidat: {
          user: {
            nom: (candidat as any)?.user?.nom || (candidat as any)?.nom || 'N/A',
            prenom: (candidat as any)?.user?.prenom || (candidat as any)?.prenom || 'N/A',
            numeroMatricule: (candidat as any)?.user?.numeroMatricule || (candidat as any)?.numeroMatricule || 'N/A'
          }
        },
        centre: {
          nom: candidat.convocation?.centre?.nom || '—'
        },
        date: candidat.convocation?.dateEpreuve ? new Date(candidat.convocation.dateEpreuve).toISOString() : undefined,
        heureArrivee: 'ABSENT',
        statut: 'ABSENT'
      } as any));

      res.status(200).json([...presences, ...absentRows]);
      return;
    }

    res.status(200).json(presences);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const exportPresenceCSV = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { examenId } = req.params;

    const presences = await Presence.find({ examen: examenId })
      .populate({ path: 'candidat', populate: { path: 'user', select: 'nom prenom numeroMatricule' } })
      .populate('surveillant', 'nom prenom')
      .sort({ date: 1 });

    const scannedCandidateIds = new Set(presences.map((p) => (p.candidat as any)?._id?.toString()).filter(Boolean));
    const absentCandidates = await Candidat.find({
      'convocation.examenId': examenId,
      _id: { $nin: Array.from(scannedCandidateIds) }
    }).populate('user', 'nom prenom numeroMatricule');

    const quoteCsvValue = (value: string | number | null | undefined) => {
      const text = value != null ? String(value) : '';
      if (/[,\n"]/u.test(text)) {
        return `"${text.replace(/"/gu, '""')}"`;
      }
      return text;
    };

    const rows = presences.map((p) => {
      const candidat = p.candidat as any;
      const surveillant = p.surveillant as any;
      const candidatNom = candidat?.user?.nom || candidat?.nom || 'N/A';
      const candidatPrenom = candidat?.user?.prenom || candidat?.prenom || 'N/A';
      const matricule = candidat?.user?.numeroMatricule || candidat?.numeroMatricule || 'N/A';
      const surveillantNom = surveillant ? `${surveillant.nom || ''} ${surveillant.prenom || ''}`.trim() : 'N/A';
      return [
        quoteCsvValue(p.date ? new Date(p.date).toISOString().split('T')[0] : 'N/A'),
        quoteCsvValue(p.heureArrivee || 'N/A'),
        quoteCsvValue(`${candidatPrenom} ${candidatNom}`.trim() || 'N/A'),
        quoteCsvValue(matricule),
        quoteCsvValue(p.statut || 'N/A'),
        quoteCsvValue(surveillantNom || 'N/A')
      ].join(',');
    });

    const absentRows = absentCandidates.map((candidat) => {
      const candidatNom = (candidat as any)?.user?.nom || (candidat as any)?.nom || 'N/A';
      const candidatPrenom = (candidat as any)?.user?.prenom || (candidat as any)?.prenom || 'N/A';
      const matricule = (candidat as any)?.user?.numeroMatricule || (candidat as any)?.numeroMatricule || 'N/A';
      return [
        quoteCsvValue('N/A'),
        quoteCsvValue('N/A'),
        quoteCsvValue(`${candidatPrenom} ${candidatNom}`.trim() || 'N/A'),
        quoteCsvValue(matricule),
        quoteCsvValue('ABSENT'),
        quoteCsvValue('N/A')
      ].join(',');
    });

    const csvContent = ['Date,Heure,Candidat,Matricule,Statut,Surveillant', ...rows, ...absentRows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=presences_${examenId}.csv`);
    res.status(200).send(csvContent);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
