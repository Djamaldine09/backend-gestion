import { Request, Response } from 'express';
import User from '../models/User';
import Candidat from '../models/Candidat';
import Examen from '../models/Examen';
import { generateToken } from './auth.controller';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configuration de Multer pour le téléchargement de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads/documents';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers JPEG, PNG et PDF sont autorisés'));
    }
  }
});

/**
 * Inscription complète d'un candidat (User + Candidat)
 */
export const registerCandidat = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      // Informations utilisateur
      nom,
      prenom,
      email,
      motDePasse,
      telephone,
      // Informations candidat
      dateNaissance,
      lieuNaissance,
      genre,
      cin,
      examen,
      serieFiliere,
      etablissementPrecedent,
      mentionPrecedente,
      adresse,
      emailParent,
      region,
    } = req.body;

    // Vérifier si l'utilisateur existe déjà
    const userExists = await User.findOne({ email });
    if (userExists) {
      res.status(400).json({ success: false, message: 'Un utilisateur avec cet email existe déjà' });
      return;
    }

    // Vérifier si le CIN existe déjà
    if (cin) {
      const candidatExists = await Candidat.findOne({ cin });
      if (candidatExists) {
        res.status(400).json({ success: false, message: 'Un candidat avec ce CIN existe déjà' });
        return;
      }
    }

    // Création de l'utilisateur
    const user = await User.create({
      nom,
      prenom,
      email,
      motDePasse,
      telephone,
      role: 'CANDIDAT',
    });

    // Génération du numéro de matricule
    const annee = new Date().getFullYear();
    const count = await Candidat.countDocuments({ numeroMatricule: new RegExp(`^BAC${annee}`) });
    const numeroMatricule = `BAC${annee}-${String(count + 1).padStart(4, '0')}`;

    // Création du candidat
    const candidat = await Candidat.create({
      numeroMatricule,
      user: user._id,
      dateNaissance: dateNaissance ? new Date(dateNaissance) : undefined,
      lieuNaissance,
      genre,
      cin,
      examen,
      serieFiliere,
      etablissementPrecedent,
      mentionPrecedente,
      adresse,
      telephone,
      emailParent,
      region,
      statutInscription: 'BROUILLON',
      paiement: {
        statut: 'NON_PAYE',
      },
      piecesJustificatives: {
        photoIdentite: { status: 'manquant' },
        acteNaissance: { status: 'manquant' },
        diplomePrecedent: { status: 'manquant' },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Inscription réussie',
      data: {
        user: {
          _id: user._id,
          nom: user.nom,
          prenom: user.prenom,
          email: user.email,
          telephone: user.telephone,
          role: user.role,
        },
        candidat: {
          _id: candidat._id,
          numeroMatricule: candidat.numeroMatricule,
          statutInscription: candidat.statutInscription,
        },
        token: generateToken(user._id.toString(), user.role),
      },
    });
  } catch (error: any) {
    console.error('Erreur lors de l\'inscription du candidat:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur lors de l\'inscription' });
  }
};

/**
 * Mise à jour du profil candidat
 */
export const updateCandidatProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    console.log('🔍 updateCandidatProfile START');
    console.log('  userId:', userId);
    console.log('  req.body:', req.body);
    
    if (!userId) {
      console.log('❌ Pas de userId');
      res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
      return;
    }

    const {
      dateNaissance,
      lieuNaissance,
      genre,
      cin,
      examen,
      serieFiliere,
      etablissementPrecedent,
      mentionPrecedente,
      adresse,
      emailParent,
      region,
    } = req.body;

    // Trouver le candidat
    let candidat = await Candidat.findOne({ user: userId });
    console.log('  candidat existant:', candidat ? 'YES' : 'NO');
    
    if (!candidat) {
      console.log('Creating new candidat...');
      // Créer le candidat s'il n'existe pas avec des valeurs par défaut pour les champs obligatoires
      const annee = new Date().getFullYear();
      const count = await Candidat.countDocuments({ numeroMatricule: new RegExp(`^BAC${annee}`) });
      const numeroMatricule = `BAC${annee}-${String(count + 1).padStart(4, '0')}`;

      candidat = await Candidat.create({
        numeroMatricule,
        user: userId,
        dateNaissance: dateNaissance ? new Date(dateNaissance) : new Date('2000-01-01'),
        lieuNaissance: lieuNaissance || 'Non spécifié',
        genre: genre || 'M',
        examen: examen || 'Non spécifié',
        serieFiliere: serieFiliere || 'Générale',
        adresse,
        region,
        statutInscription: 'BROUILLON',
        paiement: { statut: 'NON_PAYE' },
        piecesJustificatives: {
          photoIdentite: { status: 'manquant' },
          acteNaissance: { status: 'manquant' },
          diplomePrecedent: { status: 'manquant' },
          photoSupp: { status: 'manquant' },
        },
      });
      console.log('  ✅ Candidat created:', candidat._id);
    }

    // Mise à jour des champs
    if (dateNaissance) candidat.dateNaissance = new Date(dateNaissance);
    if (lieuNaissance) candidat.lieuNaissance = lieuNaissance;
    if (genre) candidat.genre = genre;
    if (cin) candidat.cin = cin;
    if (examen) {
      // Si examen est un ID, récupérer le titre de l'examen
      if (examen.match(/^[0-9a-fA-F]{24}$/)) {
        const examenDoc = await Examen.findById(examen);
        candidat.examen = examenDoc?.titre || examen;
      } else {
        candidat.examen = examen;
      }
    }
    if (serieFiliere) candidat.serieFiliere = serieFiliere;
    if (etablissementPrecedent) candidat.etablissementPrecedent = etablissementPrecedent;
    if (mentionPrecedente) candidat.mentionPrecedente = mentionPrecedente;
    if (adresse) candidat.adresse = adresse;
    if (region) candidat.region = region;
    if (emailParent) candidat.emailParent = emailParent;

    console.log('  💾 Saving candidat...');
    await candidat.save();
    console.log('  ✅ Candidat saved');

    res.status(200).json({
      success: true,
      message: 'Profil mis à jour',
      data: candidat,
    });
  } catch (error: any) {
    console.error('❌ Erreur lors de la mise à jour du profil:', error);
    console.error('  Stack:', error.stack);
    res.status(500).json({ success: false, message: error.message || 'Erreur lors de la mise à jour' });
  }
};

/**
 * Soumettre l'inscription pour validation
 */
export const submitInscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    const candidat = await Candidat.findOne({ user: userId });
    if (!candidat) {
      res.status(404).json({ success: false, message: 'Candidat non trouvé' });
      return;
    }

    console.log('Statut actuel du candidat:', candidat.statutInscription);

    // Vérifier que tous les champs requis sont remplis
    if (!candidat.dateNaissance || !candidat.lieuNaissance || !candidat.genre || !candidat.cin || !candidat.region) {
      res.status(400).json({ success: false, message: 'Veuillez remplir tous les champs obligatoires, y compris la région' });
      return;
    }

    // Mettre à jour le statut
    candidat.statutInscription = 'EN_ATTENTE_VALIDATION';
    await candidat.save();

    console.log('Statut après soumission:', candidat.statutInscription);

    res.status(200).json({
      success: true,
      message: 'Inscription soumise pour validation',
      data: candidat,
    });
  } catch (error: any) {
    console.error('Erreur lors de la soumission:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur lors de la soumission' });
  }
};

/**
 * Télécharger les pièces justificatives du candidat
 */
export const uploadDocuments = async (req: any, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      res.status(401).json({ success: false, message: 'Utilisateur non authentifié' });
      return;
    }

    const candidat = await Candidat.findOne({ user: userId });
    if (!candidat) {
      res.status(404).json({ success: false, message: 'Candidat non trouvé' });
      return;
    }

    // Mettre à jour les pièces justificatives avec les chemins des fichiers
    if (req.files) {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      if (files.photoIdentite && files.photoIdentite[0]) {
        candidat.piecesJustificatives.photoIdentite = {
          status: 'valide',
          chemin: files.photoIdentite[0].path
        };
      }
      
      if (files.acteNaissance && files.acteNaissance[0]) {
        candidat.piecesJustificatives.acteNaissance = {
          status: 'valide',
          chemin: files.acteNaissance[0].path
        };
      }
      
      if (files.diplomePrecedent && files.diplomePrecedent[0]) {
        candidat.piecesJustificatives.diplomePrecedent = {
          status: 'valide',
          chemin: files.diplomePrecedent[0].path
        };
      }
      
      if (files.photoSupp && files.photoSupp[0]) {
        candidat.piecesJustificatives.photoSupp = {
          status: 'valide',
          chemin: files.photoSupp[0].path
        };
      }
    }

    await candidat.save();

    res.status(200).json({
      success: true,
      message: 'Documents téléchargés avec succès',
      data: candidat.piecesJustificatives,
    });
  } catch (error: any) {
    console.error('Erreur lors du téléchargement des documents:', error);
    res.status(500).json({ success: false, message: error.message || 'Erreur lors du téléchargement' });
  }
};

// Exporter le middleware d'upload pour l'utiliser dans les routes
export const uploadMiddleware = upload.fields([
  { name: 'photoIdentite', maxCount: 1 },
  { name: 'acteNaissance', maxCount: 1 },
  { name: 'diplomePrecedent', maxCount: 1 },
  { name: 'photoSupp', maxCount: 1 }
]);
