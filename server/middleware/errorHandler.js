const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  // Always log the full stack for debugging
  console.error(`[Error] ${req.method} ${req.originalUrl} — ${err.stack || err.message}`);

  // Intentional errors (with an explicit statusCode) are safe to surface verbatim.
  // Unexpected 500s (DB errors, filesystem errors, etc.) are sanitized to avoid
  // leaking internal paths or SQL details — even in development mode.
  const message = err.statusCode ? (err.message || 'Error') : 'Internal Server Error';

  res.status(statusCode).json({
    status: 'error',
    message,
  });
};

module.exports = errorHandler;
