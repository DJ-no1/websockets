const requiredEnvKeys = [
  'OIDC_ISSUER_URL',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_REDIRECT_URI',
  'SESSION_SECRET',
];

export function assertAuthEnv() {
  const missing = requiredEnvKeys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required auth env vars: ${missing.join(', ')}`
    );
  }
}

export function getAuthConfig() {
  return {
    issuerUrl: process.env.OIDC_ISSUER_URL,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
    redirectUri: process.env.OIDC_REDIRECT_URI,
    postLogoutRedirectUri:
      process.env.OIDC_POST_LOGOUT_REDIRECT_URI || process.env.OIDC_REDIRECT_URI,
    scope: process.env.OIDC_SCOPE || 'openid profile email',
    sessionSecret: process.env.SESSION_SECRET,
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}
