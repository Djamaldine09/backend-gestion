import nodemailer from 'nodemailer';
import dns from 'dns';

const dnsResolve4 = dns.promises.resolve4;

// Si les identifiants SMTP ne sont pas configurés, on le signale clairement au démarrage
// au lieu de laisser les requêtes échouer silencieusement (ou traîner jusqu'au timeout).
const smtpConfigured = Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
if (!smtpConfigured) {
  console.error(
    '[email.service] SMTP_USER / SMTP_PASSWORD manquants : l\'envoi d\'email (mot de passe oublié, etc.) ne fonctionnera pas tant que ces variables ne sont pas définies.'
  );
}

const smtpHostname = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = parseInt(process.env.SMTP_PORT || '587');
const smtpSecure = process.env.SMTP_PORT === '465';

// Cache de l'IPv4 résolue pour éviter une résolution DNS à chaque email.
let cachedIPv4: { address: string; expiresAt: number } | null = null;
const IPV4_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Résout le hostname SMTP en IPv4 explicitement.
 *
 * Pourquoi : Nodemailer résout lui-même le hostname en A/AAAA et essaie les
 * adresses IPv4 puis IPv6, MAIS il ne propose aucune option pour forcer IPv4
 * uniquement — sur des hébergeurs comme Render (plan gratuit), les connexions
 * sortantes vers Gmail peuvent échouer avec ENETUNREACH (pas de route), que ce
 * soit en IPv4 ou IPv6 selon les cas. En résolvant nous-mêmes et en donnant
 * directement l'adresse IP à Nodemailer comme "host", on élimine toute
 * ambiguïté de résolution et on force une connexion IPv4 directe.
 */
async function resolveSmtpIPv4(): Promise<string | null> {
  if (cachedIPv4 && cachedIPv4.expiresAt > Date.now()) {
    return cachedIPv4.address;
  }
  try {
    const addresses = await dnsResolve4(smtpHostname);
    if (addresses.length > 0) {
      cachedIPv4 = { address: addresses[0], expiresAt: Date.now() + IPV4_CACHE_TTL_MS };
      return addresses[0];
    }
  } catch (error) {
    console.error(`[email.service] Impossible de résoudre ${smtpHostname} en IPv4 :`, error);
  }
  return null;
}

async function buildTransporter() {
  const ipv4 = await resolveSmtpIPv4();

  return nodemailer.createTransport({
    // Si la résolution IPv4 échoue, on retombe sur le hostname (comportement par défaut).
    host: ipv4 || smtpHostname,
    port: smtpPort,
    secure: smtpSecure, // true pour 465, false pour les autres ports (STARTTLS)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    // Nécessaire quand "host" est une IP littérale : le certificat TLS de Gmail
    // est émis pour "smtp.gmail.com", pas pour l'IP, donc on doit préciser le
    // nom de serveur attendu (SNI + vérification du certificat).
    tls: { servername: smtpHostname },
    name: smtpHostname,
    // Timeouts courts : sans ça, une config SMTP invalide/absente peut faire "pendre"
    // la requête HTTP jusqu'à ce qu'axios timeout côté frontend (erreur générique confuse).
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
}

export const sendPasswordResetEmail = async (email: string, resetToken: string): Promise<boolean> => {
  if (!smtpConfigured) {
    console.error('[email.service] Envoi annulé : SMTP_USER / SMTP_PASSWORD non configurés sur le serveur.');
    return false;
  }

  const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
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
            <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">© 2024 ExamGest. Tous droits réservés.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const transporter = await buildTransporter();
    await transporter.sendMail(mailOptions);
    console.log('Email de réinitialisation envoyé à:', email);
    return true;
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);
    return false;
  }
};
