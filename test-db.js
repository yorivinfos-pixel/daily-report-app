const mongoose = require('mongoose');
require('dotenv').config();

async function checkDb() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    console.log('Uri:', mongoUri.substring(0, 30) + '...');
    
    await mongoose.connect(mongoUri);
    console.log('Connecté à MongoDB');
    
    const db = mongoose.connection.db;
    const users = await db.collection('users').find({}).toArray();
    
    console.log('Utilisateurs trouvés:', users.length);
    if (users.length > 0) {
      console.log('Liste des usernames:', users.map(u => u.username).join(', '));
      // Vérifier si un compte spécifique a des soucis
      console.log('Exemple de compte (1er):', {
        username: users[0].username,
        role: users[0].role,
        is_active: users[0].is_active,
        has_password: !!users[0].password_hash
      });
    } else {
      console.log('Aucun utilisateur dans la base de données !');
    }
  } catch (err) {
    console.error('Erreur:', err.message);
  } finally {
    mongoose.disconnect();
    process.exit(0);
  }
}

checkDb();
