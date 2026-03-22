const { MongoClient } = require('mongodb');

async function test() {
    console.log("Testing connection to find replica set name...");
    const uri = "mongodb://mon_admin:6q4Qz.n-nFe.Xz4@cluster0-shard-00-00.e0ovj8t.mongodb.net:27017/?ssl=true&authSource=admin";
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const res = await client.db('admin').command({ isMaster: 1 });
        console.log("Found replica set name:", res.setName);
        process.exit(0);
    } catch(e) {
        console.error("Error:", e.message);
        process.exit(1);
    }
}
test();
