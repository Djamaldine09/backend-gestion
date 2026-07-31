import mongoose from 'mongoose';

export const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI manquant. Ajoutez la variable dans Render > Environment.');
        }

        const conn = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
        });

        console.log(`[MongoDB] Connecte avec succes : ${conn.connection.host}`);
    } catch (error: any) {
        console.error(`[MongoDB] Erreur de connexion : ${error.message}`);
        console.error('[MongoDB] Sur Render + Atlas, verifiez Network Access: autoriser 0.0.0.0/0 ou l IP sortante Render.');
        process.exit(1);
    }
};
