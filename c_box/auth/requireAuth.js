export function requireAuth(req, res, next) {
  const authenticated = Boolean(req.session?.oidc?.isAuthenticated);
  if (!authenticated) {
    return res.status(401).json({
      message: 'Authentication required',
      loginUrl: '/auth/login',
    });
  }

  return next();
}

export function requireSocketAuth(socket, next) {
  const authenticated = Boolean(socket.request?.session?.oidc?.isAuthenticated);
  if (!authenticated) {
    return next(new Error('Authentication required for websocket connection'));
  }

  return next();
}
