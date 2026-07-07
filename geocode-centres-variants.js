const mongoose = require('mongoose');
require('dotenv').config();
const fetch = globalThis.fetch || require('node-fetch');

async function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

function variants(name, centre) {
  const v = new Set();
  v.add(name);
  v.add(name.replace(/Phill+/gi, 'Phil'));
  v.add(name.replace(/Phill+/gi, 'Phili'));
  v.add(name.replace(/Phill+/gi, 'Philib'));
  v.add(name.replace(/é/gi, 'e'));
  v.add(name.replace(/Lyc[eé]e/gi, 'Lycee'));
  v.add(name.add ? name.add : name);
  // also try prefixes
  v.add('Lycee ' + name);
  v.add('Lycée ' + name);
  v.add(name + ' ' + (centre.ville || ''));
  v.add((centre.ville || '') + ' ' + name);
  return Array.from(v).filter(Boolean);
}

(async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb+srv://ProjetDb:Djamal50@cluster0.cclaumg.mongodb.net/?appName=Cluster0';
    await mongoose.connect(uri, { dbName: 'test' });
    const db = mongoose.connection.db;

    const centre = await db.collection('centreexamens').findOne({ nom: /Philli/i });
    if (!centre) {
      console.log('Centre not found');
      await mongoose.disconnect();
      return;
    }
    console.log('Testing variants for', centre.nom, centre._id);

    const vs = [
      centre.nom,
      centre.nom.replace(/Phill/gi, 'Phil'),
      centre.nom.replace(/Phill/gi, 'Phili'),
      centre.nom.replace(/Phill/gi, 'Philib'),
      centre.nom.replace(/é/gi, 'e'),
      centre.nom.replace(/é/gi, 'e').replace(/Phill/gi, 'Phil'),
      'Lycee ' + centre.nom.replace(/é/gi, 'e'),
      'Lycée ' + centre.nom.replace(/é/gi, 'e'),
      centre.nom + ' ' + (centre.ville || ''),
      (centre.ville || '') + ' ' + centre.nom
    ];

    const tried = new Set();
    for (const q of vs) {
      if (!q || tried.has(q)) continue;
      tried.add(q);
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mg&q=${encodeURIComponent(q)}`;
      console.log('Trying:', q);
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'ExamGest/1.0 (contact: dev@examgest.local)' } });
        const body = await res.json();
        if (Array.isArray(body) && body.length > 0) {
          const { lat, lon } = body[0];
          const coords = { lat: Number(lat), lng: Number(lon) };
          await db.collection('centreexamens').updateOne({ _id: centre._id }, { $set: { coords, latitude: coords.lat, longitude: coords.lng } });
          console.log(`Updated ${centre._id} -> ${coords.lat},${coords.lng}`);
          break;
        } else {
          console.log(' -> no result');
        }
      } catch (err) {
        console.error(' -> error', err.message || err);
      }
      await sleep(1100);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
