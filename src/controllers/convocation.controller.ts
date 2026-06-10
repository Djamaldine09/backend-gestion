import { Response } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Candidat from '../models/Candidat';

const QR_SECRET = process.env.QR_SECRET || 'examgest-secret';

function createQrHash(payload: string): string {
    return crypto.createHmac('sha256', QR_SECRET).update(payload).digest('hex');
}

export const generateConvocationQR = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const candidat = await Candidat.findOne({ user: req.user!.id }).populate('user');
        if (!candidat) {
            res.status(404).json({ message: 'Candidat introuvable' });
            return;
        }

        if (!candidat.convocation) {
            res.status(404).json({ message: 'Convocation non générée pour ce candidat' });
            return;
        }

        const payloadBase = {
            v: 1,
            candidatId: String(candidat._id),
            matricule: candidat.numeroMatricule || 'UNKNOWN',
            examenId: candidat.convocation.examenId,
            salle: candidat.convocation.salle,
            place: candidat.convocation.numeroPlace,
        };

        const serialized = `${payloadBase.candidatId}|${payloadBase.matricule}|${payloadBase.examenId}|${payloadBase.salle}|${payloadBase.place}`;
        const hash = createQrHash(serialized);

        const qrPayload = JSON.stringify({ ...payloadBase, hash });

        res.status(200).json({
            qrPayload,
            candidatId: candidat._id,
            matricule: candidat.numeroMatricule,
            examenId: candidat.convocation.examenId
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const verifyConvocation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { qrCode } = req.body;
        if (!qrCode) {
            res.status(400).json({ message: 'QR code manquant' });
            return;
        }

        let parsed;
        try {
            parsed = JSON.parse(qrCode);
        } catch {
            res.status(400).json({ message: 'QR code invalide' });
            return;
        }

        const { candidatId, matricule, examenId, salle, place, hash } = parsed;
        if (!candidatId || !matricule || !examenId || !salle || !place || !hash) {
            res.status(400).json({ message: 'QR code incomplet' });
            return;
        }

        const serialized = `${candidatId}|${matricule}|${examenId}|${salle}|${place}`;
        const expectedHash = createQrHash(serialized);

        if (expectedHash !== hash) {
            res.status(401).json({ message: 'QR code non valide ou altéré' });
            return;
        }

        const candidat = await Candidat.findById(candidatId).populate('user');
        if (!candidat) {
            res.status(404).json({ message: 'Candidat introuvable' });
            return;
        }

        if (!candidat.convocation) {
            res.status(404).json({ message: 'Convocation non générée pour ce candidat' });
            return;
        }

        res.status(200).json({
            valid: true,
            message: 'Convocation valide',
            candidat: {
                id: candidat._id,
                nom: (candidat.user as any)?.nom,
                prenom: (candidat.user as any)?.prenom,
                matricule: candidat.numeroMatricule
            },
            convocation: candidat.convocation
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
