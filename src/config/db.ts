import mongoose from 'mongoose';

export const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI as string);
        console.log(`[MongoDB] Connecté avec succès : ${conn.connection.host}`);
    } catch (error: any) {
        console.error(`[MongoDB] Erreur de connexion : ${error.message}`);
        process.exit(1); // Arrête le serveur en cas d'échec
    }
};