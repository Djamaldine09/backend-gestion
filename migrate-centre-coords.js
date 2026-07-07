const mongoose = require('mongoose');

(async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb+srv://ProjetDb:Djamal50@cluster0.cclaumg.mongodb.net/?appName=Cluster0';
    await mongoose.connect(uri, { dbName: 'test' });
    const db = mongoose.connection.db;
    const candidats = await db.collection('candidats').find({}).toArray();

    let updated = 0;
    for (const candidat of candidats) {
      const centreAffecte = candidat.centreAffecte || {};
      const centreExamen = candidat.centreExamen ? await db.collection('centreexamens').findOne({ _id: candidat.centreExamen }) : null;
      const hasCoords = centreAffecte.coords && (centreAffecte.coords.lat !== undefined || centreAffecte.coords.lng !== undefined);
      const hasLegacy = (centreAffecte.latitude !== undefined && centreAffecte.longitude !== undefined);
      const hasCentreCoords = centreExamen && centreExamen.coords && (centreExamen.coords.lat !== undefined || centreExamen.coords.lng !== undefined);
      const hasCentreLegacy = centreExamen && centreExamen.latitude !== undefined && centreExamen.longitude !== undefined;

      if (!hasCoords && !hasLegacy && (hasCentreCoords || hasCentreLegacy)) {
        const coords = hasCentreCoords
          ? { lat: centreExamen.coords.lat, lng: centreExamen.coords.lng }
          : { lat: centreExamen.latitude, lng: centreExamen.longitude };
        await db.collection('candidats').updateOne(
          { _id: candidat._id },
          {
            $set: {
              'centreAffecte.coords': coords,
              'centreAffecte.latitude': coords.lat,
              'centreAffecte.longitude': coords.lng,
            },
          }
        );
        updated += 1;
      }
    }

    console.log(`Updated candidates with missing coords: ${updated}`);
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
