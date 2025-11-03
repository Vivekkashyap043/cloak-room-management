// server.js (drop-in replacement)

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const recordsRoutes = require('./routes/records');

const app = express();
app.use(cors());
app.use(express.json());

// ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// ensure logs directory exists for audit logging
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

// serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// API routes (keep these before the SPA fallback)
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/records', recordsRoutes);

// If frontend build exists, serve it. Otherwise keep a simple JSON root for health check.
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist'); // adjust if your layout differs

if (fs.existsSync(frontendDist)) {
  // Serve static frontend assets (index.html, assets/*)
  app.use(express.static(frontendDist));

  // SPA fallback: serve index.html for any unknown route that is NOT /api or /uploads
  app.get('*', (req, res, next) => {
    const url = req.path || '';
    if (url.startsWith('/api') || url.startsWith('/uploads')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });

  console.log('Serving frontend from', frontendDist);
} else {
  // helpful root when frontend build is missing
  app.get('/', (req, res) => {
    res.json({ message: 'Cloak room backend running (frontend build not found)' });
  });
  console.warn('Warning: frontend dist not found at', frontendDist);
}

// error handler for multer and other errors
app.use((err, req, res, next) => {
  console.error(err && err.message ? err.message : err);
  if (err && err.message && err.message.includes('Only image files')) {
    return res.status(400).json({ message: err.message });
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    // Note: server limit is currently 5MB. Client-side compression reduces images before upload when possible.
    return res.status(400).json({ message: 'File too large. Max size is 5MB.' });
  }
  res.status(500).json({ message: 'Server error' });
});

const port = process.env.PORT || 4000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});
