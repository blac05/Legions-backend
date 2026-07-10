// middleware/authMiddleware.js
export function requireAuth(req, res, next) {
  // Example authentication check (modify as needed)
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Here you would verify the token, e.g., JWT verification
  // For simplicity, assume token is valid
  next();
}