import express from 'express';
import {
  buildAuthorizationUrl,
  buildEndSessionUrl,
  exchangeAuthorizationCode,
  getOidcClientConfig,
} from './oidcClient.js';

export function createAuthRouter(authConfig) {
  const router = express.Router();

  router.get('/login', async (req, res, next) => {
    try {
      const clientConfig = await getOidcClientConfig(authConfig);
      const authorizationUrl = await buildAuthorizationUrl(
        clientConfig,
        authConfig,
        req.session
      );
      res.redirect(authorizationUrl.href);
    } catch (error) {
      next(error);
    }
  });

  router.get('/callback', async (req, res, next) => {
    try {
      const clientConfig = await getOidcClientConfig(authConfig);
      const tokenSet = await exchangeAuthorizationCode(clientConfig, req, req.session);
      const claims = tokenSet.claims?.() || {};

      req.session.oidc = {
        isAuthenticated: true,
        accessToken: tokenSet.access_token,
        idToken: tokenSet.id_token,
        tokenType: tokenSet.token_type,
        expiresAt: tokenSet.expires_in
          ? Date.now() + tokenSet.expires_in * 1000
          : null,
        user: {
          subject: claims.sub || null,
          name:
            claims.name ||
            claims.preferred_username ||
            claims.email ||
            null,
          email: claims.email || null,
        },
      };

      delete req.session.pkceCodeVerifier;
      delete req.session.oidcState;

      res.redirect('/');
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const clientConfig = await getOidcClientConfig(authConfig);
      const idTokenHint = req.session?.oidc?.idToken;
      const logoutUrl = buildEndSessionUrl(clientConfig, authConfig, idTokenHint);

      req.session.destroy((destroyError) => {
        if (destroyError) {
          return next(destroyError);
        }

        if (logoutUrl) {
          return res.redirect(logoutUrl.href);
        }

        return res.redirect('/');
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', (req, res) => {
    const oidcSession = req.session?.oidc;
    res.json({
      authenticated: Boolean(oidcSession?.isAuthenticated),
      expiresAt: oidcSession?.expiresAt || null,
      tokenType: oidcSession?.tokenType || null,
      user: oidcSession?.user || null,
    });
  });

  return router;
}
