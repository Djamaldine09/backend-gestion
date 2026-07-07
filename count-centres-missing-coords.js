const mongoose = require('mongoose');
require('dotenv').config();
(async ()=>{
  try{
    const uri = process.env.MONGO_URI || 'mongodb+srv://ProjetDb:Djamal50@cluster0.cclaumg.mongodb.net/?appName=Cluster0';
    await mongoose.connect(uri,{dbName:'test'});
    const db = mongoose.connection.db;
    const count = await db.collection('centreexamens').countDocuments({ $or: [ { coords: { $exists: false } }, { coords: null }, { 'coords.lat': { $exists: false } } ] });
    console.log('Centres missing coords:', count);
    await mongoose.disconnect();
  }catch(err){ console.error(err); process.exit(1); }
})();
