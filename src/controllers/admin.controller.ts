import { Response } from 'express';
import User from '../models/User';
import Candidat from '../models/Candidat';
import CentreExamen from '../models/CentreExamen';
import Resultat from '../models/Resultat';
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
      security: {
        adminCount: usersByRole.find((item: any) => item._id === 'ADMIN')?.count || 0,
        jwtConfigured: Boolean(process.env.JWT_SECRET),
        corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001').split(',').map((origin) => origin.trim()),
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
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
    res.status(200).json(centres);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createCentre = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { nom, code, ville, region, capaciteMaximale, examensAcceptes } = req.body;
    const centre = await CentreExamen.create({
      nom,
      code,
      ville,
      region,
      capaciteMaximale: toNumber(capaciteMaximale),
      examensAcceptes: Array.isArray(examensAcceptes) ? examensAcceptes : String(examensAcceptes || '').split(',').map((item) => item.trim()).filter(Boolean),
    });
    res.status(201).json(centre);
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

    const centre = await CentreExamen.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!centre) {
      res.status(404).json({ message: 'Centre introuvable.' });
      return;
    }

    res.status(200).json(centre);
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
