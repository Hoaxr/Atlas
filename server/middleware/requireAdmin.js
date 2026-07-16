/**
 * requireAdmin — reusable middleware that rejects non-admin requests with 403.
 * Import this instead of defining the same inline check in every route file.
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ status: 'error', message: 'Forbidden: Admins only' });
  }
  next();
};

module.exports = requireAdmin;
