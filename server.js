const cds = require('@sap/cds');
const express = require('express');
const path = require('path');

// Enable the custom cookie login only when the active CAP auth configuration
// explicitly selects it. Production continues to use XSUAA.
cds.on('bootstrap', app => {
  const auth = cds.env.requires && cds.env.requires.auth;
  if (!auth || !auth.impl || path.resolve(auth.impl) !== path.join(__dirname, 'srv', 'custom-auth.js')) return;

  // Authentication must run before static dashboard files so role checks apply.
  app.use(require('./srv/custom-auth'));

  const staticNoCache = {
    index: 'index.html',
    fallthrough: true,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
    }
  };

  app.use('/login', express.static(path.join(__dirname, 'app', 'login', 'webapp'), staticNoCache));
  app.use('/adminasset', express.static(path.join(__dirname, 'app', 'adminasset', 'webapp'), staticNoCache));
  app.use('/manager-dashboard', express.static(path.join(__dirname, 'app', 'manager-dashboard', 'webapp'), staticNoCache));
  app.use('/user-dashboard', express.static(path.join(__dirname, 'app', 'user-dashboard', 'webapp'), staticNoCache));
});
