import Candidat from '../models/Candidat';
import CentreExamen from '../models/CentreExamen';

export const lancerAffectationAutomatique = async (): Promise<{ succes: number; echecs: number }> => {
    let candidatsAffectesCount = 0;
    let candidatsEchecCount = 0;

    // 1. Récupérer tous les candidats validés, payés et qui n'ont pas encore de centre assigné
    const candidatsAEnregistrer = await Candidat.find({
        statutInscription: 'VALIDE',
        'paiement.statut': 'PAYE',
        centreExamenSouhaite: { $exists: true } // On s'assure qu'ils ont un vœu ou une ville cible
    });

    // 2. Parcourir chaque candidat pour lui trouver une place
    for (const candidat of candidatsAEnregistrer) {
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
            // Pour l'exemple, on suppose que le lieu de naissance donne un indice sur la zone géographique, 
            // ou vous pouvez ajouter un champ "villeActuelle" dans votre modèle Candidat.
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
            await candidat.save();

            candidatsAffectesCount++;
        } else {
            // Aucun centre disponible dans la zone géographique avec de la place
            candidatsEchecCount++;
            console.warn(`[Affectation] Impossible d'affecter le candidat ${candidat._id} : Capacités saturées.`);
        }
    }

    return { succes: candidatsAffectesCount, echecs: candidatsEchecCount };
};