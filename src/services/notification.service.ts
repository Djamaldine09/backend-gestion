import mongoose from 'mongoose';
import Notification from '../models/Notification';
import { createLog } from '../config/logger';

const notifLog = createLog('NotificationService');

export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

interface NotifyOneInput {
    destinataire: mongoose.Types.ObjectId | string;
    titre: string;
    message: string;
    type?: NotificationType;
    lien?: string;
}

/**
 * Crée une notification pour un seul utilisateur.
 */
export async function notifyUser(input: NotifyOneInput) {
    return Notification.create({
        destinataire: input.destinataire,
        titre: input.titre,
        message: input.message,
        type: input.type || 'INFO',
        lien: input.lien,
    });
}

/**
 * Crée la même notification pour plusieurs utilisateurs en une seule opération.
 * Les identifiants vides/dupliqués sont automatiquement filtrés.
 */
export async function notifyUsers(
    destinataires: Array<mongoose.Types.ObjectId | string | undefined | null>,
    titre: string,
    message: string,
    type: NotificationType = 'INFO',
    lien?: string
): Promise<{ count: number }> {
    const uniqueIds = [...new Set(
        destinataires
            .filter((id): id is mongoose.Types.ObjectId | string => Boolean(id))
            .map((id) => String(id))
    )];

    if (uniqueIds.length === 0) {
        return { count: 0 };
    }

    const docs = uniqueIds.map((destinataire) => ({
        destinataire,
        titre,
        message,
        type,
        lien,
    }));

    try {
        const created = await Notification.insertMany(docs, { ordered: false });
        return { count: created.length };
    } catch (error: any) {
        // On ne bloque jamais l'action principale (ex: publication) si les notifications échouent partiellement.
        notifLog.error('Echec envoi notifications groupées', error, { titre, total: uniqueIds.length });
        return { count: error?.insertedDocs?.length || 0 };
    }
}