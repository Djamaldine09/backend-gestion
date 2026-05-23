import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { register, login, loginWithPhone } from '../controllers/auth.controller';

const router = express.Router();

// Route Google adaptée à l'access_token envoyé par Next.js
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body; // Reçoit l'access_token du front

    if (!token) {
      return res.status(400).json({ success: false, message: 'Token manquant' });
    }

    // 1. On récupère les infos de l'utilisateur directement auprès de l'API Google UserInfo
    const googleResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!googleResponse.ok) {
      return res.status(401).json({ success: false, message: 'Token Google invalide ou expiré' });
    }

    const payload = await googleResponse.json();

    if (!payload || !payload.email) {
      return res.status(401).json({ success: false, message: 'Profil Google incomplet ou invalide' });
    }

    // 2. Recherche ou création de l'utilisateur dans ta base MongoDB
    let user = await User.findOne({ email: payload.email });

    if (!user) {
      // Google fournit séparément family_name (Nom) et given_name (Prénom)

      const randomPassword = Math.random().toString(36).slice(-10) + 'Gg1!';
      user = new User({
        email: payload.email,
        nom: payload.family_name || payload.name, 
        prenom: payload.given_name || '', 
        role: 'CANDIDAT', // Rôle par défaut
        motDePasse: randomPassword,
        methodeConnexion: 'Google',
      });
      await user.save();
    }

    // 3. Génération de ton propre JWT pour sécuriser la session sur ExamGest MG
    if (!process.env.JWT_SECRET) {
      console.error("Erreur critique : JWT_SECRET n'est pas défini dans l'environnement");
      return res.status(500).json({ success: false, message: 'Erreur de configuration serveur' });
    }

    const tonJwt = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Renvoie le token au format attendu par ton frontend (data.jwt ou data.token)
    res.status(200).json({ success: true, jwt: tonJwt, token: tonJwt, user });

  } catch (error) {
    // Toujours logger l'erreur précise côté serveur pour faciliter ton débogage
    console.error('Erreur lors de l\'authentification Google:', error);
    res.status(500).json({ success: false, message: 'Erreur interne du serveur' });
  }
});

router.post('/phone', loginWithPhone);

// Routes existantes
router.post('/register', register);
router.post('/login', login);

export default router;