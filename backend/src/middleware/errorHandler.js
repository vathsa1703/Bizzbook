function errorHandler(err, req, res, next) {
  console.error(`[GlobalErrorHandler] Uncaught exception on ${req.method} ${req.url}:`);
  console.error(err.stack);

  // Return standardized JSON response
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'An unexpected error occurred.',
    code: err.code || 'INTERNAL_SERVER_ERROR'
  });
}

module.exports = errorHandler;
