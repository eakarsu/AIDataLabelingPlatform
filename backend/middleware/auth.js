/**
 * Shared JWT auth middleware. Mirrors authMiddleware in server.js so route
 * files that `require('../middleware/auth')` boot cleanly.
 *
 * Usage:
 *   const auth = require('../middleware/auth');
 *   router.use(auth);              // protect all routes on the router
 *   router.get('/x', auth, h);     // or per-handler
 */
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    if (!JWT_SECRET || JWT_SECRET.length < 32) {
      return res.status(503).json({ error: 'Authentication is not configured' });
    }
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = auth;
