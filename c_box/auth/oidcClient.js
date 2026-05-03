import * as oidc from 'openid-client';

let cachedClientConfig = null;

export async function getOidcClientConfig(authConfig) {
  if (cachedClientConfig) {
    return cachedClientConfig;
  }

  const issuerUrl = new URL(authConfig.issuerUrl);
  const allowHttp =
    issuerUrl.protocol === 'http:' ||
    process.env.OIDC_ALLOW_INSECURE_HTTP === 'true';

  cachedClientConfig = await oidc.discovery(
    issuerUrl,
    authConfig.clientId,
    authConfig.clientSecret,
    undefined,
    allowHttp ? { execute: [oidc.allowInsecureRequests] } : undefined
  );

  return cachedClientConfig;
}

export async function buildAuthorizationUrl(clientConfig, authConfig, session) {
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();

  session.pkceCodeVerifier = codeVerifier;
  session.oidcState = state;

  return oidc.buildAuthorizationUrl(clientConfig, {
    redirect_uri: authConfig.redirectUri,
    scope: authConfig.scope,
    code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    state,
  });
}

export async function exchangeAuthorizationCode(clientConfig, req, session) {
  const currentUrl = new URL(`${req.protocol}://${req.get('host')}${req.originalUrl}`);

  return oidc.authorizationCodeGrant(clientConfig, currentUrl, {
    pkceCodeVerifier: session.pkceCodeVerifier,
    expectedState: session.oidcState,
  });
}

export function buildEndSessionUrl(clientConfig, authConfig, sessionIdTokenHint) {
  const endSessionEndpoint = clientConfig.serverMetadata().end_session_endpoint;
  if (!endSessionEndpoint) {
    return null;
  }

  const logoutUrl = new URL(endSessionEndpoint);
  logoutUrl.searchParams.set('post_logout_redirect_uri', authConfig.postLogoutRedirectUri);
  if (sessionIdTokenHint) {
    logoutUrl.searchParams.set('id_token_hint', sessionIdTokenHint);
  }

  return logoutUrl;
}
