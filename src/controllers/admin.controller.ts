import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import User from '../models/User';
import Candidat from '../models/Candidat';
import CentreExamen from '../models/CentreExamen';
import Resultat from '../models/Resultat';
import AuditLog from '../models/AuditLog';
import Affectation from '../models/Affectation';
import Examen from '../models/Examen' 
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

const USER_SAFE_FIELDS = 'nom prenom email role telephone createdAt updatedAt';

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const getNationalDashboard = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const [
      totalUsers,
      usersByRole,
      totalCandidats,
      candidatsByStatus,
      candidatsPayes,
      totalCentres,
      centres,
      totalResultats,
      resultatsPublies,
    ] = await Promise.all([
      User.countDocuments(),
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      Candidat.countDocuments(),
      Candidat.aggregate([{ $group: { _id: '$statutInscription', count: { $sum: 1 } } }]),
      Candidat.countDocuments({ 'paiement.statut': 'PAYE' }),
      CentreExamen.countDocuments(),
      CentreExamen.find().select('capaciteMaximale candidatsAffectes region examensAcceptes').lean(),
      Resultat.countDocuments(),
      Resultat.countDocuments({ estPublie: true }),
    ]);

    const capacity = centres.reduce((sum, centre: any) => sum + toNumber(centre.capaciteMaximale), 0);
    const occupied = centres.reduce((sum, centre: any) => sum + (centre.candidatsAffectes?.length || 0), 0);
    const regions = new Set(centres.map((centre: any) => centre.region).filter(Boolean));
    const examens = new Set(centres.flatMap((centre: any) => centre.examensAcceptes || []));

    // Calculate regional distribution
    const repartitionRegionale = Array.from(regions).map(region => {
      const regionCentres = centres.filter((c: any) => c.region === region);
      return {
        region,
        centres: regionCentres.length,
        capacity: regionCentres.reduce((sum: number, c: any) => sum + toNumber(c.capaciteMaximale), 0)
      };
    });

    res.status(200).json({
      users: {
        total: totalUsers,
        byRole: usersByRole.reduce((acc: Record<string, number>, item: any) => {
          acc[item._id || 'INCONNU'] = item.count;
          return acc;
        }, {}),
      },
      candidats: {
        total: totalCandidats,
        payes: candidatsPayes,
        byStatus: candidatsByStatus.reduce((acc: Record<string, number>, item: any) => {
          acc[item._id || 'INCONNU'] = item.count;
          return acc;
        }, {}),
      },
      examens: {
        totalTypes: examens.size,
        resultats: totalResultats,
        resultatsPublies,
      },
      centres: {
        total: totalCentres,
        regions: regions.size,
        capacity,
        occupied,
        occupancyRate: capacity ? Math.round((occupied / capacity) * 100) : 0,
      },
      repartitionRegionale,
      security: {
        adminCount: usersByRole.find((item: any) => item._id === 'ADMIN')?.count || 0,
        jwtConfigured: Boolean(process.env.JWT_SECRET),
        corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001').split(',').map((origin) => origin.trim()),
      },
    });
  } catch (error: any) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: error.message, error: error.toString() });
  }
};

export const listUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { role, q } = req.query;
    const filter: Record<string, any> = {};

    if (role) filter.role = role;
    if (q) {
      const regex = new RegExp(String(q), 'i');
      filter.$or = [{ nom: regex }, { prenom: regex }, { email: regex }, { telephone: regex }];
    }

    const users = await User.find(filter).select(USER_SAFE_FIELDS).sort({ createdAt: -1 }).limit(200);
    res.status(200).json(users);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { nom, prenom, email, motDePasse, role, telephone } = req.body;
    if (!nom || !prenom || !email || !motDePasse || !role) {
      res.status(400).json({ message: 'Nom, prenom, email, mot de passe et role sont requis.' });
      return;
    }

    const exists = await User.findOne({ email });
    if (exists) {
      res.status(409).json({ message: 'Un utilisateur avec cet email existe deja.' });
      return;
    }

    const created = await User.create({ nom, prenom, email, motDePasse, role, telephone });
    const user = await User.findById(created._id).select(USER_SAFE_FIELDS);
    res.status(201).json(user);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const allowed = ['nom', 'prenom', 'email', 'role', 'telephone'];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));

    if (String(req.user?.id) === id && updates.role && updates.role !== 'ADMIN') {
      res.status(400).json({ message: 'Vous ne pouvez pas retirer votre propre role administrateur.' });
      return;
    }

    const user = await User.findByIdAndUpdate(id, updates, { new: true, runValidators: true }).select(USER_SAFE_FIELDS);
    if (!user) {
      res.status(404).json({ message: 'Utilisateur introuvable.' });
      return;
    }

    res.status(200).json(user);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (String(req.user?.id) === id) {
      res.status(400).json({ message: 'Vous ne pouvez pas supprimer votre propre compte.' });
      return;
    }

    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ message: 'Utilisateur introuvable.' });
      return;
    }

    await Candidat.deleteOne({ user: id });
    res.status(200).json({ message: 'Utilisateur supprime.' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const listCentres = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const centres = await CentreExamen.find().sort({ region: 1, ville: 1, nom: 1 });
    res.status(200).json({ success: true, data: centres });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createCentre = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { nom, code, ville, region, capaciteMaximale, examensAcceptes, adresse, coords } = req.body;
    const centre = await CentreExamen.create({
      nom,
      code,
      ville,
      region,
      adresse,
      capaciteMaximale: toNumber(capaciteMaximale),
      examensAcceptes: Array.isArray(examensAcceptes) ? examensAcceptes : String(examensAcceptes || '').split(',').map((item) => item.trim()).filter(Boolean),
      coords: coords && (coords.lat !== undefined || coords.lng !== undefined)
        ? { lat: Number(coords.lat), lng: Number(coords.lng) }
        : undefined,
    });
    res.status(201).json({ success: true, data: centre });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCentre = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const updates = { ...req.body };
    if (updates.capaciteMaximale !== undefined) updates.capaciteMaximale = toNumber(updates.capaciteMaximale);
    if (typeof updates.examensAcceptes === 'string') {
      updates.examensAcceptes = updates.examensAcceptes.split(',').map((item: string) => item.trim()).filter(Boolean);
    }

    if (updates.coords && (updates.coords.lat !== undefined || updates.coords.lng !== undefined)) {
      updates.coords = { lat: Number(updates.coords.lat), lng: Number(updates.coords.lng) };
    } else if ('coords' in updates) {
      updates.coords = undefined;
    }

    const centre = await CentreExamen.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!centre) {
      res.status(404).json({ message: 'Centre introuvable.' });
      return;
    }

    res.status(200).json({ success: true, data: centre });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteCentre = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const centre = await CentreExamen.findById(req.params.id);
    if (!centre) {
      res.status(404).json({ message: 'Centre introuvable.' });
      return;
    }
    if (centre.candidatsAffectes.length > 0) {
      res.status(409).json({ message: 'Impossible de supprimer un centre avec des candidats affectes.' });
      return;
    }

    await centre.deleteOne();
    res.status(200).json({ message: 'Centre supprime.' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

type MulterAdminRequest = AuthenticatedRequest & { file?: Express.Multer.File };

export const uploadCentrePhoto = async (req: MulterAdminRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'Aucune image fournie' });
      return;
    }

    const centre = await CentreExamen.findById(req.params.id);
    if (!centre) {
      res.status(404).json({ success: false, message: 'Centre introuvable.' });
      return;
    }

    if (centre.photo) {
      const oldPath = path.join(__dirname, '../..', centre.photo);
      fs.unlink(oldPath, () => {});
    }

    centre.photo = `/uploads/centres/${req.file.filename}`;
    await centre.save();

    res.status(200).json({ success: true, data: centre });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteCentrePhoto = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const centre = await CentreExamen.findById(req.params.id);
    if (!centre) {
      res.status(404).json({ success: false, message: 'Centre introuvable.' });
      return;
    }

    if (centre.photo) {
      const oldPath = path.join(__dirname, '../..', centre.photo);
      fs.unlink(oldPath, () => {});
    }
    centre.photo = undefined;
    await centre.save();

    res.status(200).json({ success: true, data: centre });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getNationalReport = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const [candidatsByRegion, centresByRegion, resultatsByStatus] = await Promise.all([
      Candidat.aggregate([
        { $group: { _id: '$centreAffecte.region', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      CentreExamen.aggregate([
        { $group: { _id: '$region', centres: { $sum: 1 }, capacity: { $sum: '$capaciteMaximale' } } },
        { $sort: { _id: 1 } },
      ]),
      Resultat.aggregate([{ $group: { _id: '$statutFinal', count: { $sum: 1 } } }]),
    ]);

    res.status(200).json({
      generatedAt: new Date().toISOString(),
      candidatsByRegion,
      centresByRegion,
      resultatsByStatus,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getDetailedStats = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const [totalUsers, activeUsers, totalCandidats, validatedCandidats, totalExamens, activeExamens] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
      Candidat.countDocuments(),
      Candidat.countDocuments({ statutInscription: 'VALIDE' }),
      Examen.countDocuments(),
      Examen.countDocuments({ statut: 'EN_COURS' }),
    ]);

    res.status(200).json({
      users: { total: totalUsers, activeLast30Days: activeUsers },
      candidats: { total: totalCandidats, validated: validatedCandidats },
      examens: { total: totalExamens, active: activeExamens },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getReportByRegion = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { region } = req.params;
    
    const [candidats, centres] = await Promise.all([
      Candidat.countDocuments({ 'centreAffecte.region': region }),
      CentreExamen.countDocuments({ region }),
    ]);

    res.status(200).json({
      region,
      candidats,
      centres,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getAuditLogs = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { action, ressource, limit = 50 } = req.query;
    const filter: any = {};
    
    if (action) filter.action = action;
    if (ressource) filter.ressource = ressource;

    const logs = await AuditLog.find(filter)
      .populate('utilisateur', 'nom prenom email')
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.status(200).json(logs);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const affectCandidatsToCentres = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { candidatIds, centreId, salle, numeroPlace } = req.body;
    
    const centre = await CentreExamen.findById(centreId);
    if (!centre) {
      res.status(404).json({ message: 'Centre introuvable' });
      return;
    }

    const affectations = await Promise.all(
      candidatIds.map(async (candidatId: string) => {
        const candidat = await Candidat.findById(candidatId);
        if (!candidat) return null;

        // Update candidat centre
        candidat.centreExamen = centre._id as any;
        candidat.centreAffecte = {
          nom: centre.nom,
          ville: centre.ville,
          region: centre.region,
          adresse: centre.adresse || centre.code || '',
          salle,
          numeroPlace,
          coords: centre.coords || (centre.latitude !== undefined || centre.longitude !== undefined
            ? { lat: centre.latitude, lng: centre.longitude }
            : undefined),
          telephone: centre.telephone,
          email: centre.email,
        };
        await candidat.save();

        // Create affectation record
        return Affectation.create({
          candidat: candidatId,
          centre: centreId,
          examen: candidat.examen,
          salle,
          numeroPlace,
        });
      })
    );

    // Update centre candidats
    centre.candidatsAffectes = [...centre.candidatsAffectes, ...candidatIds];
    await centre.save();

    res.status(201).json({
      message: 'Affectations créées avec succès',
      count: affectations.filter(a => a !== null).length,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getAffectations = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { centreId, examenId } = req.query;
    const filter: any = {};
    
    if (centreId) filter.centre = centreId;
    if (examenId) filter.examen = examenId;

    const affectations = await Affectation.find(filter)
      .populate('candidat')
      .populate('centre')
      .populate('examen')
      .sort({ dateAffectation: -1 });

    res.status(200).json(affectations);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const exportReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { format } = req.query;
    const [candidatsByRegion, centresByRegion, resultatsByStatus] = await Promise.all([
      Candidat.aggregate([{ $group: { _id: '$region', count: { $sum: 1 } } }]),
      CentreExamen.aggregate([
        { $group: { _id: '$region', centres: { $sum: 1 }, capacity: { $sum: '$capaciteMaximale' } } }
      ]),
      Resultat.aggregate([{ $group: { _id: '$statut', count: { $sum: 1 } } }]),
    ]);

    const report = {
      generatedAt: new Date().toISOString(),
      candidatsByRegion,
      centresByRegion,
      resultatsByStatus,
    };

    if (format === 'csv') {
      const csv = [
        'Type,Région,Count',
        ...candidatsByRegion.map((r: any) => `Candidats,${r._id || 'N/A'},${r.count}`),
        ...centresByRegion.map((r: any) => `Centres,${r._id || 'N/A'},${r.centres}`),
        ...resultatsByStatus.map((r: any) => `Résultats,${r._id || 'N/A'},${r.count}`),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=rapport-national.csv');
      res.send(csv);
    } else if (format === 'pdf' || format === 'excel') {
      // For now, return JSON for pdf/excel (would need PDF/Excel generation libraries)
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=rapport-national.${format === 'excel' ? 'xlsx' : 'pdf'}`);
      res.json(report);
    } else {
      res.status(400).json({ message: 'Format non supporté' });
    }
  } catch (error: any) {
    console.error('Export error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const listCandidats = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const candidats = await Candidat.find()
      .populate('user', USER_SAFE_FIELDS)
      .select('-piecesJustificatives -planning -convocation')
      .sort({ createdAt: -1 });
    
    res.status(200).json(candidats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const resetCandidatStatus = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Réinitialiser les candidats avec statut REJETE à BROUILLON si aucun processus de rejet n'existe
    const result = await Candidat.updateMany(
      { statutInscription: 'REJETE' },
      { statutInscription: 'BROUILLON' }
    );
    
    res.status(200).json({ 
      message: 'Statuts réinitialisés avec succès', 
      count: result.modifiedCount 
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const validateCandidat = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { candidatId } = req.params;
    const { statut } = req.body; // 'VALIDE' ou 'REJETE'

    if (!['VALIDE', 'REJETE'].includes(statut)) {
      res.status(400).json({ message: 'Statut invalide. Doit être VALIDE ou REJETE' });
      return;
    }

    const candidat = await Candidat.findById(candidatId);
    if (!candidat) {
      res.status(404).json({ message: 'Candidat non trouvé' });
      return;
    }

    candidat.statutInscription = statut;
    await candidat.save();

    res.status(200).json({ 
      message: `Dossier ${statut === 'VALIDE' ? 'validé' : 'rejeté'} avec succès`, 
      candidat 
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};