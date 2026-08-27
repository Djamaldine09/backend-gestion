import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendPasswordResetEmail = async (email: string, resetToken: string): Promise<boolean> => {
  if (!process.env.RESEND_API_KEY) {
    console.error('[email.service] RESEND_API_KEY manquante dans les variables d\'environnement.');
    return false;
  }

  const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

  try {
    const { error } = await resend.emails.send({
      // "onboarding@resend.dev" permet de tester immédiatement sans configurer de domaine
      from: 'Exam Mada <onboarding@resend.dev>',
      to: email,
      subject: 'Réinitialisation de votre mot de passe - Exam Mada',
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
              <h1 style="color: white; margin: 0; font-size: 24px;">Exam Mada</h1>
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
              <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">© 2026 Exam Mada. Tous droits réservés.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Erreur d\'envoi Resend:', error);
      return false;
    }

    console.log('Email de réinitialisation envoyé avec succès via Resend à:', email);
    return true;
  } catch (err) {
    console.error('Erreur lors de l\'envoi de l\'email:', err);
    return false;
  }
};
