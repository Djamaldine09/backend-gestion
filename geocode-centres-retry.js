const mongoose = require('mongoose');
require('dotenv').config();
const fetch = globalThis.fetch || require('node-fetch');

async function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

const queriesForCentre = (centre) => {
  const parts = [centre.nom, centre.adresse, centre.ville, centre.region, centre.code].filter(Boolean);
  const qlist = [];

  // common combos
  qlist.push(parts.join(', '));
  qlist.push([centre.nom, centre.ville, 'Madagascar'].filter(Boolean).join(', '));
  qlist.push([centre.nom, centre.region, 'Madagascar'].filter(Boolean).join(', '));
  qlist.push([centre.nom, 'Madagascar'].filter(Boolean).join(', '));
  qlist.push([centre.nom, centre.code, centre.ville].filter(Boolean).join(' '));
  qlist.push([centre.nom, centre.ville].filter(Boolean).join(' '));
  qlist.push([centre.ville, centre.nom].filter(Boolean).join(' '));
  qlist.push(centre.nom);
  qlist.push(centre.code);
  // remove duplicates
  return Array.from(new Set(qlist));
};

(async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb+srv://ProjetDb:Djamal50@cluster0.cclaumg.mongodb.net/?appName=Cluster0';
    await mongoose.connect(uri, { dbName: 'test' });
    const db = mongoose.connection.db;

    const centres = await db.collection('centreexamens').find({ $or: [ { coords: { $exists: false } }, { coords: null }, { 'coords.lat': { $exists: false } } ] }).toArray();
    console.log(`Retrying geocode for ${centres.length} centres`);

    let updated = 0;
    for (const centre of centres) {
      console.log('\n---');
      console.log('Centre:', centre.nom, centre._id.toString());
      const qs = queriesForCentre(centre);
      let found = false;
      for (const q of qs) {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mg&q=${encodeURIComponent(q)}`;
        console.log(' Trying:', q);
        try {
          const res = await fetch(url, { headers: { 'User-Agent': 'ExamGest/1.0 (contact: dev@examgest.local)' } });
          const body = await res.json();
          if (Array.isArray(body) && body.length > 0) {
            const { lat, lon } = body[0];
            const coords = { lat: Number(lat), lng: Number(lon) };
            await db.collection('centreexamens').updateOne({ _id: centre._id }, { $set: { coords, latitude: coords.lat, longitude: coords.lng } });
            console.log(` -> updated ${centre._id} -> ${coords.lat},${coords.lng}`);
            updated++;
            found = true;
            break;
          } else {
            console.log('  -> no result');
          }
        } catch (err) {
          console.error('  -> error', err.message || err);
        }
        await sleep(1100);
      }
      if (!found) console.log('No geocode result for centre:', centre._id.toString());
    }

    console.log(`\nUpdated centres: ${updated}`);
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
