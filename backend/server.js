// server.js

const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const recordsRoutes = require('./routes/records');
const eventsRoutes = require('./routes/events');

const app = express();
app.use(cors());
app.use(express.json());

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/events', eventsRoutes); // public (authenticated) events list
app.use('/api/records', recordsRoutes);

// Serve frontend build (adjust path if needed)
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));

  app.get('*', (req, res, next) => {
    const url = req.path || '';
    if (url.startsWith('/api') || url.startsWith('/uploads')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });

  console.log('✅ Serving frontend from:', frontendDist);
} else {
  app.get('/', (req, res) => {
    res.json({ message: 'Cloak room backend running (frontend build not found)' });
  });
  console.warn('⚠️ Frontend dist not found at', frontendDist);
}

// Global error handler
app.use((err, req, res, next) => {
  console.error(err?.message || err);
  if (err?.message?.includes('Only image files')) {
    return res.status(400).json({ message: err.message });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File too large. Max size is 5MB.' });
  }
  res.status(500).json({ message: 'Server error' });
});

// === HTTPS SETUP ===
const port = process.env.PORT || 4000;
const keyPath = path.join(__dirname, 'cert', 'key.pem');
const certPath = path.join(__dirname, 'cert', 'cert.pem');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  try {
    const key = fs.readFileSync(keyPath);
    const cert = fs.readFileSync(certPath);
    const options = { key, cert };

    // Start HTTPS server
    https.createServer(options, app).listen(port, '0.0.0.0', () => {
      const localIP = getLocalIP();
      console.log('🔒 HTTPS server running at:');
      console.log(`   👉 https://localhost:${port}`);
      console.log(`   👉 https://${localIP}:${port}`);
    });

  } catch (error) {
    console.error('❌ Failed to start HTTPS server, falling back to HTTP:', error);
    startHTTP(app, port);
  }
} else {
  console.warn('⚠️ SSL certificate or key not found. Starting HTTP server only.');
  startHTTP(app, port);
}

// === Helper functions ===
function startHTTP(app, port) {
  http.createServer(app).listen(port, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`🌐 HTTP server running at:`);
    console.log(`   👉 http://localhost:${port}`);
    console.log(`   👉 http://${localIP}:${port}`);
  });
}

function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}
