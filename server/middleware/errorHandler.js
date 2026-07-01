const errorHandler = (err, req, res, next) => {
  console.error(`[Error] ${err.stack}`);
  const statusCode = err.statusCode || 500;
  // Don't leak internal error details (e.g. SQL/file system errors) for unexpected
  // server errors in production. Errors with an explicit statusCode are intentional
  // (e.g. validation errors) and safe to surface to the client.
  const isProduction = process.env.NODE_ENV === 'production';
  const message = (!err.statusCode && isProduction) ? 'Internal Server Error' : (err.message || 'Internal Server Error');
  res.status(statusCode).json({
    status: 'error',
    message,
  });
};

module.exports = errorHandler;
