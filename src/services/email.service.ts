import nodemailer from 'nodemailer';
import dns from 'dns';

// 1. FORCER NODE.JS À UTILISER IPv4 PAR DÉFAUT
// Cela empêche l'erreur ENETUNREACH sur Render qui ne supporte pas l'IPv6 sortant.
dns.setDefaultResultOrder('ipv4first');

const smtpConfigured = Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
if (!smtpConfigured) {
  console.error(
    '[email.service] SMTP_USER / SMTP_PASSWORD manquants : l\'envoi d\'email ne fonctionnera pas tant que ces variables ne sont pas définies.'
  );
}

// Configuration pour le port 465 (SSL direct) recommandé sur Render
const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
const isSecure = smtpPort === 465; 

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: isSecure,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD, // Doit être le Mot de passe d'application Google !
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 15000,
});

export const sendPasswordResetEmail = async (email: string, resetToken: string): Promise<boolean> => {
  if (!smtpConfigured) {
    console.error('[email.service] Envoi annulé : SMTP_USER / SMTP_PASSWORD non configurés sur le serveur.');
    return false;
  }

  const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: process.env.FROM_EMAIL || `"ExamGest" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Réinitialisation de votre mot de passe - ExamGest',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Réinitialisation de mot de passe</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #0C6478 0%, #BDEE98 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">ExamGest</h1>
          </div>
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px;">
            <h2 style="color: #0C6478; margin-top: 0;">Réinitialisation de votre mot de passe</h2>
            <p>Bonjour,</p>
            <p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le lien ci-dessous pour définir un nouveau mot de passe :</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background: #0C6478; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Réinitialiser mon mot de passe</a>
            </div>
            <p style="font-size: 14px; color: #666;">Ce lien expire dans 1 heure.</p>
            <p style="font-size: 14px; color: #666;">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
            <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">© 2026 ExamGest. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email de réinitialisation envoyé à:', email);
    return true;
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);
    return false;
  }
};
