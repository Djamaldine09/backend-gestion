import 'dotenv/config';
import mongoose from 'mongoose';
import Candidat from '../src/models/Candidat';
import CentreExamen from '../src/models/CentreExamen';
import { ensureCandidateCentreAffecte } from '../src/utils/centreAffecte';
import { connectDB } from '../src/config/db';

declare const process: any;

async function run() {
  try {
    await connectDB();
    console.log('Connected to DB');

    const candidats = await Candidat.find().lean();
    console.log(`Found ${candidats.length} candidats`);

    let updated = 0;
    for (const c of candidats) {
      try {
        // Reload full candidat doc to ensure mongoose doc methods are available in ensureCandidateCentreAffecte
        const candidatDoc = await Candidat.findById(c._id);
        if (!candidatDoc) continue;

        const before = JSON.stringify(candidatDoc.centreAffecte || {});
        const rebuilt = await ensureCandidateCentreAffecte(candidatDoc, undefined);
        if (rebuilt) {
          updated++;
          console.log(`Updated candidate ${candidatDoc._id} centreAffecte: ${before} -> ${JSON.stringify(rebuilt)}`);
        }
      } catch (err) {
        console.error('Error rebuilding for candidate', c._id, err);
      }
    }

    console.log(`Done. Updated ${updated} candidates.`);
    if (typeof process !== 'undefined' && typeof process.exit === 'function') {
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal error', err);
    if (typeof process !== 'undefined' && typeof process.exit === 'function') {
      process.exit(1);
    }
  }
}

run();
