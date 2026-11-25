'use strict';
const http = require('http');
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { createLogger } = require('./redact');
const cfg = loadConfig(), logger = createLogger(), app = createApp(cfg, { logger });
http.createServer(app.handler).listen(cfg.port, cfg.host, () => {
  logger.info('Miri Iran server started', { url: `http://${cfg.host}:${cfg.port}`, mode: cfg.mode, liveFlights: app.state.liveReady });
  if (cfg.mode === 'live' && !app.state.liveReady) logger.warn('Live mode requested but NOT usable', { reasons: app.state.problems });
  if (cfg.mode !== 'live') logger.info('DEMO mode: all results are examples, nothing is booked, paid or refunded.');
});
