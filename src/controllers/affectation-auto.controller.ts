import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import Candidat from '../models/Candidat';
import CentreExamen from '../models/CentreExamen';
import Affectation from '../models/Affectation';
import Examen from '../models/Examen';
import jwt from 'jsonwebtoken';
import { buildCentreAffectePayload } from '../utils/centreAffecte';

/**
 * FONCTION PRINCIPALE: Affectation automatique des candidats
 * 
 * Algorithme:
 * 1. Récupère toutes les régions avec candidats validés
 * 2. POUR CHAQUE région:
 *    - Récupère candidats VALIDE + PAYE
 *    - Récupère centres d'examen de la région
 *    - POUR CHAQUE candidat:
 *      * Affecte au centre avec capacité disponible
 *      * Génère numéro de table (T-001, T-002...)
 *      * Génère QR code unique (JWT)
 *      * Sauvegarde en BD
 *      * Si centre plein → centre suivant
 */
export const affecterCandidatsNationaux = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { examenId, examenType } = req.body;

    // Validation
    if (!examenId && !examenType) {
      res.status(400).json({ message: 'examenId ou examenType est requis' });
      return;
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log('🚀 LANCEMENT AFFECTATION AUTOMATIQUE');
    console.log('═══════════════════════════════════════════════');
    console.log(`📝 Examen ID: ${examenId}`);
    console.log(`� Examen Type: ${examenType}`);
    console.log(`�� Lancé par: ${req.user?.id}`);

    // 1. Récupérer toutes les régions
    // Utiliser examenType (string) pour matcher avec candidat.examen
    const query: any = {};
    
    let examTypeToMatch = examenType;
    if (examenId && !examenType) {
      // Look up exam type from Examen model
      const exam = await Examen.findById(examenId);
      if (exam) {
        examTypeToMatch = exam.type;
        console.log(`📝 Type d'examen récupéré: ${exam.type}`);
      } else {
        res.status(404).json({ message: 'Examen non trouvé' });
        return;
      }
    }
    
    // Use regex for partial matching of exam type
    if (examTypeToMatch) {
      // Try partial match - candidates with exam type containing the retrieved type
      query.examen = { $regex: examTypeToMatch, $options: 'i' };
    }
    
    // Use correct field name for status
    query.statutInscription = 'VALIDE';
    query['paiement.statut'] = 'PAYE';
    
    // Remove centreAffecte check to allow re-affectation of already affected candidates
    // query.centreAffecte = { $exists: false };
    
    // Debug: Check if candidates have region field
    const sampleCandidate = await Candidat.findOne(query);
    if (sampleCandidate) {
      console.log('📝 Exemple de candidat correspondant:', JSON.stringify(sampleCandidate, null, 2));
      console.log('📍 Region du candidat:', sampleCandidate.region || 'NON DÉFINI');
      console.log('📍 Region dans centreAffecte:', sampleCandidate.centreAffecte?.region || 'NON DÉFINI');
    }
    
    // Use region field from Candidat model
    const candidates = await Candidat.find(query);
    const regionsSet = new Set<string>();
    const candidatesWithoutRegion: any[] = [];
    
    // Populate region field for candidates that have centreAffecte.region but no region
    for (const c of candidates) {
      if (!c.region && c.centreAffecte?.region) {
        c.region = c.centreAffecte.region;
        await c.save();
        console.log(`✅ Region populated for ${c.numeroMatricule}: ${c.region}`);
      }
    }
    
    candidates.forEach(c => {
      if (c.region) {
        regionsSet.add(c.region);
      } else if (c.centreAffecte?.region) {
        // Fallback to centreAffecte.region if region field is not set
        regionsSet.add(c.centreAffecte.region);
      } else {
        candidatesWithoutRegion.push(c);
      }
    });
    const regions = Array.from(regionsSet);
    
    // Debug: Show all candidates and their regions
    console.log('📝 Liste des candidats correspondants:');
    candidates.forEach((c, index) => {
      const region = c.region || c.centreAffecte?.region || 'NON DÉFINI';
      console.log(`  ${index + 1}. ${c.numeroMatricule} - Region: ${region} - Examen: ${c.examen}`);
    });
    
    console.log(`\n⚠️  Candidats sans région: ${candidatesWithoutRegion.length}`);
    if (candidatesWithoutRegion.length > 0) {
      console.log('Ces candidats seront affectés aux centres disponibles sans restriction de région');
    }

    console.log(`\n🌍 Régions trouvées: ${regions.length}\n`);
    
    // If no regions found but there are candidates, process them without region filtering
    if (regions.length === 0 && candidates.length > 0) {
      console.log('⚠️  Aucune région trouvée mais des candidats existent. Traitement sans filtrage par région.');
      regions.push('ALL_REGIONS'); // Special marker for no-region processing
    }
    
    // Debug: Check what candidates exist
    const allCandidates = await Candidat.find({ examen: query.examen });
    console.log(`👥 Total candidats avec examen "${query.examen}": ${allCandidates.length}`);
    
    // Debug: Check all candidates regardless of exam
    const totalAllCandidates = await Candidat.countDocuments();
    console.log(`👥 Total candidats dans la base: ${totalAllCandidates}`);
    
    // Debug: Check what exam values exist
    const distinctExams = await Candidat.distinct('examen');
    console.log(`📝 Types d'examens dans la base: ${distinctExams.join(', ')}`);
    
    // Debug: Check candidate statuses
    const distinctStatuses = await Candidat.distinct('statut');
    console.log(`📝 Statuts des candidats: ${distinctStatuses.join(', ')}`);
    
    const validCandidates = await Candidat.find({ examen: query.examen, statut: 'VALIDE' });
    console.log(`👥 Candidats VALIDE avec examen "${query.examen}": ${validCandidates.length}`);
    
    const paidCandidates = await Candidat.find({ examen: query.examen, statut: 'VALIDE', 'paiement.statut': 'PAYE' });
    console.log(`👥 Candidats VALIDE + PAYE avec examen "${query.examen}": ${paidCandidates.length}`);
    
    if (paidCandidates.length > 0) {
      console.log('📝 Exemple de candidat:', JSON.stringify(paidCandidates[0], null, 2));
    } else if (allCandidates.length > 0) {
      console.log('📝 Exemple de candidat (any):', JSON.stringify(allCandidates[0], null, 2));
    }

    // Initialiser résultats
    const resultats = {
      totalCandidatsAffectes: 0,
      totalCentresUtilises: new Set<string>(),
      regionsTraitees: 0,
      detailsParRegion: [] as any[],
      erreurs: [] as string[]
    };

    // 2. POUR CHAQUE région
    for (const region of regions) {
      console.log(`\n📍 RÉGION: ${region}`);
      console.log('─'.repeat(50));

      // 2a. Récupérer candidats VALIDE + PAYE de la région
      let candidatQuery: any;
      let candidats;
      
      if (region === 'ALL_REGIONS') {
        // Process all candidates without region filtering
        candidatQuery = { ...query };
        candidats = candidates; // Use already fetched candidates
        console.log('📋 Traitement sans filtrage par région');
      } else {
        // Filter by region
        candidatQuery = {
          ...query,
          $or: [
            { region: region },
            { 'centreAffecte.region': region }
          ]
        };
        candidats = await Candidat.find(candidatQuery).sort({ createdAt: 1 });
        
        // Add candidates without region to the first region
        if (region === regions[0] && candidatesWithoutRegion.length > 0) {
          candidats = [...candidats, ...candidatesWithoutRegion];
        }
      }

      console.log(`👥 Candidats à affecter: ${candidats.length}`);

      if (candidats.length === 0) {
        console.log('⏭️  Aucun candidat non affecté dans cette région');
        continue;
      }

      // 2b. Récupérer centres d'examen de la région
      // Utiliser examensAcceptes comme tableau de strings
      const centreQuery: any = {};
      
      if (region !== 'ALL_REGIONS') {
        centreQuery.region = region;
      }
      
      if (examTypeToMatch) {
        centreQuery.examensAcceptes = { $regex: examTypeToMatch, $options: 'i' };
      }
      
      const centres = await CentreExamen.find(centreQuery).sort({ capaciteMaximale: -1 });

      console.log(`🏢 Centres disponibles: ${centres.length}`);
      
      // Debug: Check all centers in the region (or all centers if ALL_REGIONS)
      const allCentresInRegion = region === 'ALL_REGIONS' 
        ? await CentreExamen.find({ examensAcceptes: { $regex: examTypeToMatch, $options: 'i' } })
        : await CentreExamen.find({ region: region });
      console.log(`🏢 Total centres ${region === 'ALL_REGIONS' ? 'disponibles' : 'dans la région ' + region}: ${allCentresInRegion.length}`);
      if (allCentresInRegion.length > 0) {
        console.log('📝 Exemple de centre:', JSON.stringify(allCentresInRegion[0], null, 2));
      }

      if (centres.length === 0) {
        const erreur = `${region}: Aucun centre d'examen disponible`;
        resultats.erreurs.push(erreur);
        console.log(`❌ ${erreur}`);
        continue;
      }

      // Afficher capacité totale
      const capaciteTotale = centres.reduce((sum, c) => sum + c.capaciteMaximale, 0);
      console.log(`💼 Capacité totale: ${capaciteTotale}`);

      // 2c. Initialiser les variables
      let indexCentre = 0;
      let compteurTable = 1;
      let centresUtilises = new Set<string>();
      let detailsRegion = {
        region,
        candidatsAffectes: 0,
        candidatsNonAffectes: 0,
        centresUtilises: 0,
        details: [] as any[]
      };

      // 2d. POUR CHAQUE candidat
      for (let i = 0; i < candidats.length; i++) {
        const candidat = candidats[i];

        // Vérifier si centre actuel est plein
        if (
          centres[indexCentre].candidatsAffectes.length >=
          centres[indexCentre].capaciteMaximale
        ) {
          console.log(
            `   ℹ️  Centre ${centres[indexCentre].nom} plein ` +
            `(${centres[indexCentre].candidatsAffectes.length}/${centres[indexCentre].capaciteMaximale})`
          );
          
          // Passer au centre suivant
          indexCentre++;
          compteurTable = 1;

          // Vérifier s'il y a un autre centre
          if (indexCentre >= centres.length) {
            const nonAffectes = candidats.length - resultats.totalCandidatsAffectes - detailsRegion.candidatsAffectes;
            const erreur = (
              `${region}: Capacité insuffisante. ` +
              `${nonAffectes} candidats restants, capacité restante: 0`
            );
            resultats.erreurs.push(erreur);
            console.log(`❌ ${erreur}`);
            detailsRegion.candidatsNonAffectes = nonAffectes;
            break;
          }
        }

        // Générer numéro de table
        const numeroTable = `T-${String(compteurTable).padStart(3, '0')}`;

        // Générer QR code (JWT unique)
        const qrCode = jwt.sign(
          {
            candidatId: candidat._id.toString(),
            numeroTable: numeroTable,
            centre: centres[indexCentre]._id.toString(),
            region: region,
            timestamp: Date.now()
          },
          process.env.JWT_SECRET as string,
          { expiresIn: '30d' }
        );

        // Mettre à jour candidat (utiliser centreAffecte au lieu de centre)
        candidat.centreExamen = centres[indexCentre]._id as any;
        // Ensure we propagate any coords (or legacy latitude/longitude) from the chosen centre
        const centreDoc = centres[indexCentre];
        const centreCoords = centreDoc.coords && (centreDoc.coords.lat !== undefined || centreDoc.coords.lng !== undefined)
          ? { lat: Number(centreDoc.coords.lat), lng: Number(centreDoc.coords.lng) }
          : (centreDoc.latitude !== undefined || centreDoc.longitude !== undefined)
            ? { lat: Number(centreDoc.latitude), lng: Number(centreDoc.longitude) }
            : undefined;

        candidat.centreAffecte = buildCentreAffectePayload(centreDoc, {
          salle: 'AUTO',
          numeroPlace: numeroTable,
          telephone: centreDoc.telephone,
          email: centreDoc.email,
          coords: centreCoords,
        });
        candidat.numeroTable = numeroTable;
        candidat.qrCode = qrCode;
        await candidat.save();

        // Mettre à jour centre
        if (!centres[indexCentre].candidatsAffectes.includes(candidat._id)) {
          centres[indexCentre].candidatsAffectes.push(candidat._id);
          await centres[indexCentre].save();
        }

        // Créer document Affectation (utiliser examenType)
        const affectationData: any = {
          candidat: candidat._id,
          centre: centres[indexCentre]._id,
          salle: 'AUTO',
          numeroPlace: numeroTable,
          statut: 'CONFIRMEE'
        };
        
        if (examenType) {
          affectationData.examenType = examenType;
        } else if (examenId) {
          affectationData.examen = examenId;
        }
        
        await Affectation.create(affectationData);

        // Stats
        centresUtilises.add(centres[indexCentre]._id.toString());
        resultats.totalCandidatsAffectes++;
        detailsRegion.candidatsAffectes++;
        compteurTable++;

        // Afficher progression
        if ((i + 1) % 50 === 0) {
          console.log(`   ✓ ${i + 1}/${candidats.length} candidats affectés...`);
        }
      }

      detailsRegion.centresUtilises = centresUtilises.size;
      resultats.detailsParRegion.push(detailsRegion);
      
      // Only count as a region if it's not ALL_REGIONS
      if (region !== 'ALL_REGIONS') {
        resultats.regionsTraitees++;
      }

      console.log(`✅ ${detailsRegion.candidatsAffectes} affectés, ${detailsRegion.centresUtilises} centres utilisés`);
    }

    // Consolider les centres
    for (const detail of resultats.detailsParRegion) {
      for (const centre of detail.details) {
        resultats.totalCentresUtilises.add(centre);
      }
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log('📊 RÉSULTATS FINAUX');
    console.log('═══════════════════════════════════════════════');
    console.log(`✅ Candidats affectés: ${resultats.totalCandidatsAffectes}`);
    console.log(`🏢 Centres utilisés: ${resultats.totalCentresUtilises.size}`);
    console.log(`🌍 Régions traitées: ${resultats.regionsTraitees}`);
    console.log(`❌ Erreurs: ${resultats.erreurs.length}`);

    if (resultats.erreurs.length > 0) {
      console.log('\n⚠️  ERREURS:');
      resultats.erreurs.forEach(err => console.log(`   - ${err}`));
    }

    console.log('\n═══════════════════════════════════════════════\n');

    res.status(200).json({
      succes: true,
      message: 'Affectation automatique terminée',
      resultats: {
        totalCandidatsAffectes: resultats.totalCandidatsAffectes,
        totalCentresUtilises: resultats.totalCentresUtilises.size,
        regionsTraitees: resultats.regionsTraitees,
        detailsParRegion: resultats.detailsParRegion,
        erreurs: resultats.erreurs
      },
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('❌ ERREUR AFFECTATION:', error);
    res.status(500).json({
      succes: false,
      message: error.message
    });
  }
};

/**
 * Obtenir les statistiques d'affectation pour un examen
 */
export const getAffectationStats = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { examenId } = req.params;

    // Candidats validés et payés
    const totalCandidats = await Candidat.countDocuments({
      examen: examenId,
      statut: 'VALIDE',
      'paiement.statut': 'PAYE'
    });

    // Candidats affectés
    const affectes = await Candidat.countDocuments({
      examen: examenId,
      statut: 'VALIDE',
      'paiement.statut': 'PAYE',
      centre: { $ne: null }
    });

    // Candidats non affectés
    const nonAffectes = totalCandidats - affectes;

    // Centres utilisés
    const centresUtilises = (await Candidat.distinct('centre', {
      examen: examenId,
      centre: { $ne: null }
    })).length;

    // Régions traitées
    const regionsAffectees = await Candidat.distinct('region', {
      examen: examenId,
      centre: { $ne: null }
    });

    const stats = {
      totalCandidats,
      affectes,
      nonAffectes,
      tauxAffectation: totalCandidats > 0 ? ((affectes / totalCandidats) * 100).toFixed(1) : 0,
      centresUtilises,
      regionsAffectees
    };

    res.status(200).json(stats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};