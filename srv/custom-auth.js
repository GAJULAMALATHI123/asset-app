const cds = require('@sap/cds');
const crypto = require('crypto');

// Development-only cookie sessions. Production continues to use XSUAA from package.json.
const sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_PATH = '/login/index.html';

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return '';
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 8192) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (_) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function dashboardFor(user) {
  const roles = user.roles || [];
  if (roles.includes('Admin')) return '/adminasset/index.html';
  if (roles.includes('Manager')) return '/manager-dashboard/index.html';
  if (roles.includes('User')) return '/user-dashboard/index.html';
  return LOGIN_PATH;
}

function requiredRolesFor(path) {
  if (path === '/adminasset/index.html') return ['Admin'];
  if (path === '/manager-dashboard/index.html') return ['Manager', 'Admin'];
  if (path === '/user-dashboard/index.html' || path === '/user-dashboard/webapp/index.html') {
    return ['User'];
  }
  return null;
}

module.exports = function developmentSessionAuth(req, res, next) {
  const auth = cds.env.requires && cds.env.requires.auth || {};
  const users = auth.users || {};
  const path = req.path || '/';

  // The login page must be reachable without an existing session.
  if (path === LOGIN_PATH || path.startsWith('/login/')) return next();

  if (path === '/auth/login' && req.method === 'POST') {
    readJsonBody(req).then(({ username, password }) => {
      const id = String(username || '').trim();
      const candidate = users[id];
      if (!candidate || !Array.isArray(candidate.roles)) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      // Keep the existing local mock-user behavior (blank passwords) unless a password
      // is configured for that user or supplied through a development environment variable.
      const envName = 'ASSET_APP_' + id.replace(/[^a-z0-9]/gi, '_').toUpperCase() + '_PASSWORD';
      const expectedPassword = candidate.password !== undefined
        ? String(candidate.password)
        : String(process.env[envName] || '');
      if (String(password || '') !== expectedPassword) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      const previousToken = readCookie(req, 'asset_app_session');
      if (previousToken) sessions.delete(previousToken);

      const token = crypto.randomBytes(32).toString('hex');
      const user = { id, roles: candidate.roles, attr: candidate.attr || {} };
      sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
      res.setHeader('Set-Cookie',
        'asset_app_session=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(SESSION_TTL_MS / 1000));
      return res.status(200).json({ ok: true, dashboardUrl: dashboardFor(user), user: id });
    }).catch(err => {
      if (!res.headersSent) res.status(400).json({ error: err.message || 'Could not process login.' });
    });
    return;
  }

  if (path === '/auth/logout') {
    const token = readCookie(req, 'asset_app_session');
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'asset_app_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return res.redirect(302, LOGIN_PATH);
  }

  const token = readCookie(req, 'asset_app_session');
  const session = token && sessions.get(token);
  if (session && session.expiresAt > Date.now()) {
    req.assetAppUser = session.user;
  } else if (token) {
    sessions.delete(token);
  }

  if (path === '/' && req.method === 'GET') return res.redirect(302, LOGIN_PATH);

  const protectedDashboardRoles = requiredRolesFor(path);
  if (protectedDashboardRoles) {
    // Prevent browsers from restoring a protected dashboard from a stale HTTP cache after sign-out.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    if (!req.assetAppUser) return res.redirect(302, LOGIN_PATH);
    const allowed = protectedDashboardRoles.some(role => req.assetAppUser.roles.includes(role));
    if (!allowed) return res.redirect(302, LOGIN_PATH + '?error=role');
  }

  // CAP calls this middleware inside a request context. The same middleware is also
  // mounted globally to protect static dashboard entry pages, where no CDS context exists.
  if (cds.context) {
    if (req.assetAppUser) {
      cds.context.user = new cds.User({
        id: req.assetAppUser.id,
        roles: req.assetAppUser.roles,
        attr: req.assetAppUser.attr
      });
    } else {
      cds.context.user = cds.User.anonymous;
    }
  }
  next();
};
