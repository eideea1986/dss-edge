const db = require('./src/Database');

async function check() {
    console.log("Checking DB...");
    try {
        const rows = await new Promise((resolve, reject) => {
            db.db.all("SELECT * FROM segments ORDER BY id DESC LIMIT 5", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        console.log("Segments:", JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    }
}

check();
