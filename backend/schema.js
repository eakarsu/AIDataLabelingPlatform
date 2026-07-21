const fs = require('node:fs');
const path = require('node:path');
const { initDatabase, pool } = require('./server');

async function createSchema() {
  await initDatabase();
  const governedMigration = fs.readFileSync(
    path.join(__dirname, 'migrations', '002_governed_workflow.sql'),
    'utf8'
  );
  await pool.query(governedMigration);
}

if (require.main === module) {
  createSchema()
    .then(() => pool.end())
    .catch(async (error) => {
      console.error(error);
      await pool.end().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = { createSchema, pool };
