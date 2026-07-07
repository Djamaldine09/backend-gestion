import Candidat from '../models/Candidat';
import CentreExamen from '../models/CentreExamen';
import { buildCentreAffectePayload } from '../utils/centreAffecte';

export const lancerAffectationAutomatique = async (): Promise<{ succes: number; echecs: number }> => {
    let candidatsAffectesCount = 0;
    let candidatsEchecCount = 0;

    // 1. Récupérer tous les candidats validés, payés et qui n'ont pas encore de centre assigné
    const candidatsAEnregistrer = await Candidat.find({
        statutInscription: 'VALIDE',
        'paiement.statut': 'PAYE',
        centreExamenSouhaite: { $exists: true } // On s'assure qu'ils ont un vœu ou une ville cible
    });

    // 2. Traiter les candidats en parallèle par lots pour éviter de bloquer l'event loop
    const BATCH_SIZE = 50;
    for (let i = 0; i < candidatsAEnregistrer.length; i += BATCH_SIZE) {
        const batch = candidatsAEnregistrer.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.allSettled(
            batch.map(async (candidat) => {
                let centreTrouve = null;

                // Étape A : Essayer de trouver le centre spécifiquement souhaité par le candidat
                if (candidat.centreExamenSouhaite) {
                    centreTrouve = await CentreExamen.findOne({
                        nom: candidat.centreExamenSouhaite,
                        examensAcceptes: candidat.examen,
                        $expr: { $lt: [{ $size: "$candidatsAffectes" }, "$capaciteMaximale"] } // Place disponible
                    });
                }

                // Étape B : Si le centre souhaité est complet, chercher un autre centre dans la même ville
                if (!centreTrouve) {
                    centreTrouve = await CentreExamen.findOne({
                        ville: candidat.lieuNaissance, 
                        examensAcceptes: candidat.examen,
                        $expr: { $lt: [{ $size: "$candidatsAffectes" }, "$capaciteMaximale"] }
                    });
                }

                // Étape C : Si une place est disponible, on effectue l'affectation (Double mise à jour sécurisée)
                if (centreTrouve) {
                    // Ajouter le candidat au centre
                    centreTrouve.candidatsAffectes.push(candidat._id as any);
                    await centreTrouve.save();

                    // Enregistrer le centre final sur le dossier du candidat
                    candidat.centreExamenSouhaite = centreTrouve.nom; // On fige le centre d'examen validé
                    candidat.centreExamen = centreTrouve._id as any;
                    const centreCoords = centreTrouve.coords && (centreTrouve.coords.lat !== undefined || centreTrouve.coords.lng !== undefined)
                        ? { lat: Number(centreTrouve.coords.lat), lng: Number(centreTrouve.coords.lng) }
                        : (centreTrouve.latitude !== undefined || centreTrouve.longitude !== undefined)
                            ? { lat: Number(centreTrouve.latitude), lng: Number(centreTrouve.longitude) }
                            : undefined;

                    candidat.centreAffecte = buildCentreAffectePayload(centreTrouve, {
                        salle: 'AUTO',
                        numeroPlace: 'AUTO',
                        telephone: centreTrouve.telephone,
                        email: centreTrouve.email,
                        coords: centreCoords,
                    });
                    await candidat.save();

                    return { success: true };
                } else {
                    console.warn(`[Affectation] Impossible d'affecter le candidat ${candidat._id} : Capacités saturées.`);
                    return { success: false };
                }
            })
        );

        // Compter les succès et échecs du lot
        results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value.success) {
                candidatsAffectesCount++;
            } else {
                candidatsEchecCount++;
            }
        });
    }

    return { succes: candidatsAffectesCount, echecs: candidatsEchecCount };
};