#!/usr/bin/env node
'use strict';

if (process.env.NODE_ENV === 'production' || process.env.CONFIRM_DEMO_SEED !== 'yes') {
  throw new Error('Demo seed requires CONFIRM_DEMO_SEED=yes outside production');
}

process.env.ALLOW_DEMO_SEED_ENDPOINT = 'true';

const jwt = require('jsonwebtoken');
const { app, pool } = require('../server');

const server = app.listen(0, '127.0.0.1', async () => {
  try {
    const address = server.address();
    const token = jwt.sign(
      { id: 0, email: 'seed-operator@example.invalid', name: 'Seed Operator', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' },
    );
    const response = await fetch(`http://127.0.0.1:${address.port}/api/seed`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Seed endpoint returned ${response.status}: ${body}`);
    console.log('Demo data seeded through the authenticated local endpoint.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    server.close();
    await pool.end();
  }
});
