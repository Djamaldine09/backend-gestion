const mongoose = require('mongoose');

(async () => {
  try {
    const MONGO_URI = 'mongodb+srv://ProjetDb:Djamal50@cluster0.cclaumg.mongodb.net/?appName=Cluster0';
    await mongoose.connect(MONGO_URI, { dbName: 'test' });
    const db = mongoose.connection.db;
    const candidat = await db.collection('candidats').findOne({ 'centreAffecte': { $exists: true } });
    console.log('candidate exists:', !!candidat);
    if (candidat) {
      console.log('centreAffecte:', JSON.stringify(candidat.centreAffecte, null, 2));
    }
    const countCoords = await db.collection('candidats').countDocuments({ 'centreAffecte.coords': { $exists: true } });
    const countLegacy = await db.collection('candidats').countDocuments({ 'centreAffecte.latitude': { $exists: true } });
    console.log('count centreAffecte.coords exists:', countCoords);
    console.log('count centreAffecte.latitude exists:', countLegacy);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
