import express from 'express';
import {
  buildAuthorizationUrl,
  buildEndSessionUrl,
  exchangeAuthorizationCode,
  fetchUserProfile,
  getOidcClientConfig,
} from './oidcClient.js';

const imageFieldNames = new Set([
  'profilepictureurl',
  'profile_picture_url',
  'profilepicture',
  'profile_picture',
  'picture',
  'avatarurl',
  'avatar_url',
  'imageurl',
  'image_url',
  'photo',
  'photourl',
  'photo_url',
]);

function findProfileImageUrl(...sources) {
  const seen = new Set();

  function visit(value) {
    if (!value || seen.has(value)) {
      return null;
    }

    if (typeof value === 'string') {
      return /^https?:\/\//i.test(value) ? value : null;
    }

    if (typeof value !== 'object') {
      return null;
    }

    seen.add(value);

    for (const [key, nestedValue] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (imageFieldNames.has(normalizedKey)) {
        const imageUrl = visit(nestedValue);
        if (imageUrl) {
          return imageUrl;
        }
      }
    }

    for (const nestedValue of Object.values(value)) {
      const imageUrl = visit(nestedValue);
      if (imageUrl) {
        return imageUrl;
      }
    }

    return null;
  }

  for (const source of sources) {
    const imageUrl = visit(source);
    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}

function buildSessionUser(claims, profile = {}) {
  const picture = findProfileImageUrl(profile, claims);

  return {
    subject: profile.sub || claims.sub || null,
    name:
      profile.name ||
      claims.name ||
      profile.preferred_username ||
      claims.preferred_username ||
      profile.email ||
      claims.email ||
      null,
    email: profile.email || claims.email || null,
    picture,
    profilePictureUrl: picture,
  };
}

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
      let profile = {};

      try {
        profile = await fetchUserProfile(
          clientConfig,
          tokenSet.access_token,
          claims.sub
        );
      } catch (error) {
        console.warn('Unable to fetch OIDC user profile', error);
      }

      req.session.oidc = {
        isAuthenticated: true,
        accessToken: tokenSet.access_token,
        idToken: tokenSet.id_token,
        tokenType: tokenSet.token_type,
        expiresAt: tokenSet.expires_in
          ? Date.now() + tokenSet.expires_in * 1000
          : null,
        user: buildSessionUser(claims, profile),
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

  router.get('/me', async (req, res) => {
    const oidcSession = req.session?.oidc;
    if (oidcSession?.isAuthenticated && !oidcSession.user?.picture) {
      try {
        const clientConfig = await getOidcClientConfig(authConfig);
        const profile = await fetchUserProfile(
          clientConfig,
          oidcSession.accessToken,
          oidcSession.user?.subject
        );
        const refreshedUser = buildSessionUser(oidcSession.user || {}, profile);
        oidcSession.user = {
          ...oidcSession.user,
          ...refreshedUser,
        };
      } catch (error) {
        console.warn('Unable to refresh OIDC user profile', error);
      }
    }

    res.json({
      authenticated: Boolean(oidcSession?.isAuthenticated),
      expiresAt: oidcSession?.expiresAt || null,
      tokenType: oidcSession?.tokenType || null,
      user: oidcSession?.user || null,
    });
  });

  return router;
}
