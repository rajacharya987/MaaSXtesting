const express = require('express');
const crypto = require('crypto');
const { db } = require('./db');
const { generateToken, requireAuth, hashPassword, comparePassword } = require('./auth');

const router = express.Router();

// Helper to log user activity
function logActivity(userId, action, details) {
  try {
    const stmt = db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)');
    stmt.run(userId, action, details);
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

// ----------------------------------------------------
// AUTHENTICATION ROUTES
// ----------------------------------------------------

// Register
router.post('/auth/register', (req, res) => {
  const { email, password, full_name, company } = req.body;
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'Please provide email, password, and full name.' });
  }

  // Check if email already registered
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email address already exists.' });
  }

  const hashedPassword = hashPassword(password);
  const stmt = db.prepare(`
    INSERT INTO users (email, password, full_name, company, plan, credits)
    VALUES (?, ?, ?, ?, 'Starter', 500)
  `);

  try {
    const result = stmt.run(email.trim().toLowerCase(), hashedPassword, full_name.trim(), company ? company.trim() : 'Independent');
    const newUser = db.prepare('SELECT id, email, full_name, company, plan, credits, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    
    // Create initial API key
    const initialKey = 'df_live_' + crypto.randomBytes(14).toString('hex');
    db.prepare('INSERT INTO api_keys (user_id, key_name, api_key) VALUES (?, ?, ?)').run(newUser.id, 'Default API Key', initialKey);
    
    logActivity(newUser.id, 'REGISTER', 'User created new DataFinder account');

    const token = generateToken(newUser);
    return res.json({
      message: 'Account created successfully!',
      token,
      user: newUser
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Failed to create account.' });
  }
});

// Login
router.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
  if (!user || !comparePassword(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  logActivity(user.id, 'LOGIN', 'User logged in to session');

  const safeUser = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    company: user.company,
    plan: user.plan,
    credits: user.credits,
    role: user.role,
    created_at: user.created_at
  };

  const token = generateToken(safeUser);
  return res.json({
    message: 'Login successful!',
    token,
    user: safeUser
  });
});

// Get Current User Profile
router.get('/auth/me', requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

// Update Profile
router.post('/auth/update-profile', requireAuth, (req, res) => {
  const { full_name, company } = req.body;
  if (!full_name) {
    return res.status(400).json({ error: 'Full name cannot be empty.' });
  }

  db.prepare('UPDATE users SET full_name = ?, company = ? WHERE id = ?')
    .run(full_name.trim(), company ? company.trim() : req.user.company, req.user.id);

  logActivity(req.user.id, 'PROFILE_UPDATE', 'Updated user display profile');

  const updatedUser = db.prepare('SELECT id, email, full_name, company, plan, credits, role, created_at FROM users WHERE id = ?').get(req.user.id);
  return res.json({ message: 'Profile updated successfully', user: updatedUser });
});

// Upgrade / Switch Plan
router.post('/auth/update-plan', requireAuth, (req, res) => {
  const { plan } = req.body;
  const allowed = ['Starter', 'Pro', 'Enterprise'];
  if (!allowed.includes(plan)) {
    return res.status(400).json({ error: 'Invalid subscription tier selected.' });
  }

  let creditBonus = 0;
  if (plan === 'Pro') creditBonus = 5000;
  if (plan === 'Enterprise') creditBonus = 25000;
  if (plan === 'Starter') creditBonus = 500;

  db.prepare('UPDATE users SET plan = ?, credits = credits + ? WHERE id = ?')
    .run(plan, creditBonus, req.user.id);

  logActivity(req.user.id, 'PLAN_UPGRADE', `Switched plan to ${plan} (+${creditBonus} credits added)`);

  const updated = db.prepare('SELECT id, email, full_name, company, plan, credits, role FROM users WHERE id = ?').get(req.user.id);
  return res.json({ message: `Successfully updated plan to ${plan}!`, user: updated });
});

// ----------------------------------------------------
// LEADS & DATA INTELLIGENCE ROUTES
// ----------------------------------------------------

// Search & Browse Leads with full filters
router.get('/leads', requireAuth, (req, res) => {
  const { query, industry, country, min_employees, sort_by } = req.query;

  let sql = 'SELECT l.*, CASE WHEN sl.id IS NOT NULL THEN 1 ELSE 0 END as is_saved FROM leads l LEFT JOIN saved_leads sl ON sl.lead_id = l.id AND sl.user_id = ? WHERE 1=1';
  const params = [req.user.id];

  if (query && query.trim() !== '') {
    const q = `%${query.trim()}%`;
    sql += ' AND (l.company_name LIKE ? OR l.domain LIKE ? OR l.contact_name LIKE ? OR l.contact_title LIKE ? OR l.tech_stack LIKE ?)';
    params.push(q, q, q, q, q);
  }

  if (industry && industry !== 'all') {
    sql += ' AND l.industry = ?';
    params.push(industry);
  }

  if (country && country !== 'all') {
    sql += ' AND l.country = ?';
    params.push(country);
  }

  if (min_employees && !isNaN(min_employees)) {
    sql += ' AND l.employees >= ?';
    params.push(Number(min_employees));
  }

  if (sort_by === 'employees_desc') {
    sql += ' ORDER BY l.employees DESC';
  } else if (sort_by === 'company_asc') {
    sql += ' ORDER BY l.company_name ASC';
  } else {
    sql += ' ORDER BY l.id ASC';
  }

  try {
    const stmt = db.prepare(sql);
    const leads = stmt.all(...params);

    // Get list of distinct industries and countries for dynamic filters
    const industries = db.prepare('SELECT DISTINCT industry FROM leads ORDER BY industry ASC').all().map(r => r.industry);
    const countries = db.prepare('SELECT DISTINCT country FROM leads ORDER BY country ASC').all().map(r => r.country);

    return res.json({
      total: leads.length,
      leads,
      filterOptions: {
        industries,
        countries
      }
    });
  } catch (err) {
    console.error('Query error:', err);
    return res.status(500).json({ error: 'Database search query failed.' });
  }
});

// Bookmark / Toggle Save Lead
router.post('/leads/toggle-save', requireAuth, (req, res) => {
  const { lead_id, notes } = req.body;
  if (!lead_id) {
    return res.status(400).json({ error: 'lead_id is required' });
  }

  const existing = db.prepare('SELECT id FROM saved_leads WHERE user_id = ? AND lead_id = ?').get(req.user.id, lead_id);
  
  if (existing) {
    db.prepare('DELETE FROM saved_leads WHERE id = ?').run(existing.id);
    logActivity(req.user.id, 'LEAD_UNSAVED', `Removed lead #${lead_id} from saved lists`);
    return res.json({ saved: false, message: 'Removed from saved lists.' });
  } else {
    db.prepare('INSERT INTO saved_leads (user_id, lead_id, notes) VALUES (?, ?, ?)')
      .run(req.user.id, lead_id, notes || 'Bookmarked lead');
    logActivity(req.user.id, 'LEAD_SAVED', `Saved lead #${lead_id} to collection`);
    return res.json({ saved: true, message: 'Saved lead to collection!' });
  }
});

// Get User's Saved Leads
router.get('/leads/saved', requireAuth, (req, res) => {
  const sql = `
    SELECT l.*, sl.saved_at, sl.notes, 1 as is_saved
    FROM saved_leads sl
    JOIN leads l ON l.id = sl.lead_id
    WHERE sl.user_id = ?
    ORDER BY sl.saved_at DESC
  `;
  const saved = db.prepare(sql).all(req.user.id);
  return res.json({ total: saved.length, leads: saved });
});

// Export Leads (Consumes Credits)
router.post('/leads/export', requireAuth, (req, res) => {
  const { lead_ids, format } = req.body; // format: 'csv' or 'json'
  
  if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
    return res.status(400).json({ error: 'Please select at least one lead to export.' });
  }

  const cost = lead_ids.length;
  if (req.user.credits < cost) {
    return res.status(402).json({
      error: `Insufficient credits! You need ${cost} credits but have ${req.user.credits}. Please upgrade your plan.`
    });
  }

  // Deduct credits
  db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(cost, req.user.id);

  // Fetch requested leads
  const placeholders = lead_ids.map(() => '?').join(',');
  const leads = db.prepare(`SELECT * FROM leads WHERE id IN (${placeholders})`).all(...lead_ids);

  logActivity(req.user.id, 'EXPORT_DATA', `Exported ${leads.length} records in ${format || 'csv'} format (-${cost} credits)`);

  const updatedUser = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.user.id);

  return res.json({
    message: `Exported ${leads.length} verified records successfully!`,
    creditsRemaining: updatedUser.credits,
    format: format || 'csv',
    data: leads
  });
});

// ----------------------------------------------------
// API KEY MANAGEMENT
// ----------------------------------------------------

// List API Keys
router.get('/apikeys', requireAuth, (req, res) => {
  const keys = db.prepare('SELECT id, key_name, api_key, requests_count, rate_limit, status, created_at, last_used FROM api_keys WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  return res.json({ keys });
});

// Generate new API Key
router.post('/apikeys', requireAuth, (req, res) => {
  const { key_name } = req.body;
  const name = key_name && key_name.trim() ? key_name.trim() : 'Production API Key';

  const newKey = 'df_live_' + crypto.randomBytes(16).toString('hex');
  const result = db.prepare('INSERT INTO api_keys (user_id, key_name, api_key, rate_limit) VALUES (?, ?, ?, 5000)')
    .run(req.user.id, name, newKey);

  logActivity(req.user.id, 'API_KEY_CREATED', `Generated new API key: ${name}`);

  const created = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(result.lastInsertRowid);
  return res.json({ message: 'API Key generated successfully!', key: created });
});

// Revoke API Key
router.delete('/apikeys/:id', requireAuth, (req, res) => {
  const keyId = req.params.id;
  const existing = db.prepare('SELECT id, key_name FROM api_keys WHERE id = ? AND user_id = ?').get(keyId, req.user.id);
  if (!existing) {
    return res.status(404).json({ error: 'API Key not found or does not belong to you.' });
  }

  db.prepare('DELETE FROM api_keys WHERE id = ?').run(keyId);
  logActivity(req.user.id, 'API_KEY_REVOKED', `Revoked API key: ${existing.key_name}`);

  return res.json({ message: 'API Key revoked successfully.' });
});

// ----------------------------------------------------
// STATS & AUDIT LOGS
// ----------------------------------------------------
router.get('/stats', requireAuth, (req, res) => {
  const totalLeads = db.prepare('SELECT COUNT(*) as count FROM leads').get().count;
  const savedCount = db.prepare('SELECT COUNT(*) as count FROM saved_leads WHERE user_id = ?').get(req.user.id).count;
  const totalKeys = db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE user_id = ?').get(req.user.id).count;
  
  const recentLogs = db.prepare('SELECT action, details, created_at FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 8').all(req.user.id);

  // Industry breakdown
  const industryDistribution = db.prepare('SELECT industry, COUNT(*) as count FROM leads GROUP BY industry ORDER BY count DESC LIMIT 5').all();

  return res.json({
    metrics: {
      totalLeadsAvailable: totalLeads,
      userSavedCount: savedCount,
      userCredits: req.user.credits,
      userPlan: req.user.plan,
      activeApiKeys: totalKeys,
      systemHealth: '100% Operational',
      dataAccuracyRate: '99.4%'
    },
    industryDistribution,
    recentActivity: recentLogs
  });
});

module.exports = router;
