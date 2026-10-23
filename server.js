const cds = require('@sap/cds');
const express = require('express');
const path = require('path');

// Development login/session middleware is enabled only when the active CAP auth
// configuration explicitly selects it. Production continues to use XSUAA.
cds.on('bootstrap', app => {
  const auth = cds.env.requires && cds.env.requires.auth;
  if (!auth || !auth.impl || path.resolve(auth.impl) !== path.join(__dirname, 'srv', 'custom-auth.js')) return;

  app.use(require('./srv/custom-auth'));
  app.use('/login', express.static(path.join(__dirname, 'app', 'login', 'webapp'), {
    index: 'index.html',
    fallthrough: true,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
    }
  }));
});
