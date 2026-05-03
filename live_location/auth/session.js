import session from 'express-session';

export function buildSessionMiddleware(authConfig) {
  return session({
    name: 'cbox.sid',
    secret: authConfig.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: authConfig.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    },
  });
}
