const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./server/db');
const routes = require('./server/routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize SQLite Database and initial Seed Data
console.log('📦 Initializing DataFinder SQLite Database...');
initDatabase();
console.log('✅ SQLite Database ready with seed data.');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', routes);

// Fallback to index.html for SPA client-side routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`
  ======================================================
  🚀 DATAFINDER SAAS PLATFORM IS LIVE!
  ======================================================
  📍 Local URL:     http://localhost:${PORT}
  🗄️  Database:      SQLite (datafinder.db)
  
  🔑 Demo Credentials:
     Email:         demo@datafinder.io
     Password:      demo123
     Plan:          Pro (4,850 credits)
     
     Email:         admin@datafinder.io
     Password:      admin123
     Plan:          Enterprise
  ======================================================
  `);
});
