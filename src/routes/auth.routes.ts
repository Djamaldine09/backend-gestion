// Utilise les imports ES6 partout pour rester cohérent
import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import User from '../models/User'; // Vérifie bien l'extension .js
import { register, login } from '../controllers/auth.controller';

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Route Google
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({ success: false, message: 'Payload Google invalide' });
    }

    let user = await User.findOne({ email: payload.email });

    if (!user) {
      user = new User({
        email: payload.email,
        nom: payload.name,
        role: 'Candidat',
        methodeConnexion: 'Google',
      });
      await user.save();
    }

    const tonJwt = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );

    res.status(200).json({ success: true, jwt: tonJwt, user });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token Google invalide' });
  }
});

// Routes existantes
router.post('/register', register);
router.post('/login', login);

export default router;