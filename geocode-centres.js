const mongoose = require('mongoose');
require('dotenv').config();
const fetch = globalThis.fetch || require('node-fetch');

async function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

(async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb+srv://ProjetDb:Djamal50@cluster0.cclaumg.mongodb.net/?appName=Cluster0';
    await mongoose.connect(uri, { dbName: 'test' });
    const db = mongoose.connection.db;

    const query = {
      $or: [
        { coords: { $exists: false } },
        { coords: null },
        { 'coords.lat': { $exists: false } },
        { latitude: { $exists: false } },
        { longitude: { $exists: false } }
      ]
    };

    const centres = await db.collection('centreexamens').find(query).toArray();
    console.log(`Found ${centres.length} centres missing coords`);

    let updated = 0;
    for (const centre of centres) {
      const q = [centre.nom, centre.adresse, centre.ville, 'Madagascar'].filter(Boolean).join(', ');
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mg&q=${encodeURIComponent(q)}`;

      console.log('Geocoding:', q);
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'ExamGest/1.0 (contact: dev@examgest.local)' } });
        const body = await res.json();
        if (Array.isArray(body) && body.length > 0) {
          const { lat, lon } = body[0];
          const coords = { lat: Number(lat), lng: Number(lon) };
          await db.collection('centreexamens').updateOne({ _id: centre._id }, { $set: { coords, latitude: coords.lat, longitude: coords.lng } });
          console.log(` -> updated ${centre._id} -> ${coords.lat},${coords.lng}`);
          updated++;
        } else {
          console.log(' -> no result');
        }
      } catch (err) {
        console.error(' -> geocode error', err.message || err);
      }

      // be polite
      await sleep(1100);
    }

    console.log(`Updated centres: ${updated}`);
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
