require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

sql`SELECT 1 as connected`
  .then((r) => {
    console.log('DB connected:', r);
    process.exit(0);
  })
  .catch((e) => {
    console.error('DB error:', e.message);
    process.exit(1);
  });
