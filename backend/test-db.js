require('dotenv').config();
const mysql = require('mysql2/promise');

async function check() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME
  });
  const [rows] = await conn.execute('SHOW COLUMNS FROM frame_models');
  console.log(rows);
  await conn.end();
}
check();
