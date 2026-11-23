'use strict';

const express = require('express');
const path = require('node:path');

const ROOT = __dirname;
const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.disable('x-powered-by');

const staticOptions = {
  dotfiles: 'ignore',
  etag: false,
  lastModified: false,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  },
};

function sendIndex(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(ROOT, 'index.html'));
}

app.get('/', sendIndex);
app.get('/index.html', sendIndex);
app.get('/favicon.ico', (_req, res) => {
  res.status(204).end();
});

app.use('/css', express.static(path.join(ROOT, 'css'), staticOptions));
app.use('/js', express.static(path.join(ROOT, 'js'), staticOptions));
app.use('/data', express.static(path.join(ROOT, 'data'), staticOptions));
app.use('/licenses', express.static(path.join(ROOT, 'licenses'), staticOptions));

app.use((_req, res) => {
  res.status(404).type('text/plain; charset=utf-8').send('Not Found');
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Dreaming Abyss server running at http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
