const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

let db = null;
let isNativeSqlite = false;

// 1. Try loading native node:sqlite (available in Node.js >= 22.5.0)
try {
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(__dirname, '..', 'datafinder.db');
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  isNativeSqlite = true;
  console.log('✅ Connected to native Node SQLite engine.');
} catch (err) {
  console.log('ℹ️  node:sqlite not present (Node < 22). Initializing Universal Pure-JS Engine...');
}

// 2. Universal Embedded Fallback Database (Works on Node 16/18/20/22 with zero native build deps)
if (!db) {
  const jsonDbPath = path.join(__dirname, '..', 'datafinder_store.json');

  const defaultState = {
    users: [],
    leads: [],
    saved_leads: [],
    api_keys: [],
    activity_logs: [],
    _sequences: { users: 0, leads: 0, saved_leads: 0, api_keys: 0, activity_logs: 0 }
  };

  let store = defaultState;
  if (fs.existsSync(jsonDbPath)) {
    try {
      store = JSON.parse(fs.readFileSync(jsonDbPath, 'utf8'));
    } catch (e) {
      store = defaultState;
    }
  }

  function persist() {
    try {
      fs.writeFileSync(jsonDbPath, JSON.stringify(store, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to persist store:', e);
    }
  }

  db = {
    exec(sql) {
      // DDL or PRAGMAs are no-ops in memory/json store
      return this;
    },

    prepare(rawSql) {
      const sql = rawSql.trim();

      return {
        run(...params) {
          // --- INSERT INTO users ---
          if (/INSERT\s+INTO\s+users/i.test(sql)) {
            const [email, password, full_name, company, plan, credits, role] = params;
            store._sequences.users = (store._sequences.users || 0) + 1;
            const id = store._sequences.users;
            const newUser = {
              id,
              email,
              password,
              full_name,
              company: company || 'Independent',
              plan: plan || 'Starter',
              credits: credits !== undefined ? credits : 500,
              role: role || 'user',
              created_at: new Date().toISOString()
            };
            store.users.push(newUser);
            persist();
            return { lastInsertRowid: id, changes: 1 };
          }

          // --- INSERT INTO leads ---
          if (/INSERT\s+INTO\s+leads/i.test(sql)) {
            store._sequences.leads = (store._sequences.leads || 0) + 1;
            const id = store._sequences.leads;
            const [
              company_name, domain, industry, employees, revenue_range,
              country, city, contact_name, contact_title, contact_email,
              contact_phone, tech_stack, funding_stage, verified
            ] = params;

            const newLead = {
              id, company_name, domain, industry,
              employees: Number(employees), revenue_range,
              country, city, contact_name, contact_title, contact_email,
              contact_phone, tech_stack, funding_stage,
              verified: verified !== undefined ? verified : 1,
              created_at: new Date().toISOString()
            };
            store.leads.push(newLead);
            persist();
            return { lastInsertRowid: id, changes: 1 };
          }

          // --- INSERT INTO saved_leads ---
          if (/INSERT\s+INTO\s+saved_leads/i.test(sql)) {
            store._sequences.saved_leads = (store._sequences.saved_leads || 0) + 1;
            const id = store._sequences.saved_leads;
            const [user_id, lead_id, notes] = params;
            store.saved_leads.push({
              id,
              user_id: Number(user_id),
              lead_id: Number(lead_id),
              notes: notes || '',
              saved_at: new Date().toISOString()
            });
            persist();
            return { lastInsertRowid: id, changes: 1 };
          }

          // --- INSERT INTO api_keys ---
          if (/INSERT\s+INTO\s+api_keys/i.test(sql)) {
            store._sequences.api_keys = (store._sequences.api_keys || 0) + 1;
            const id = store._sequences.api_keys;
            const [user_id, key_name, api_key, requests_count, rate_limit] = params;
            const keyObj = {
              id,
              user_id: Number(user_id),
              key_name,
              api_key,
              requests_count: requests_count || 0,
              rate_limit: rate_limit || 5000,
              status: 'active',
              created_at: new Date().toISOString(),
              last_used: null
            };
            store.api_keys.push(keyObj);
            persist();
            return { lastInsertRowid: id, changes: 1 };
          }

          // --- INSERT INTO activity_logs ---
          if (/INSERT\s+INTO\s+activity_logs/i.test(sql)) {
            store._sequences.activity_logs = (store._sequences.activity_logs || 0) + 1;
            const id = store._sequences.activity_logs;
            const [user_id, action, details] = params;
            store.activity_logs.push({
              id,
              user_id: user_id ? Number(user_id) : null,
              action,
              details,
              ip_address: '127.0.0.1',
              created_at: new Date().toISOString()
            });
            persist();
            return { lastInsertRowid: id, changes: 1 };
          }

          // --- UPDATE users SET full_name = ?, company = ? WHERE id = ? ---
          if (/UPDATE\s+users\s+SET\s+full_name\s*=\s*\?,\s*company\s*=\s*\?\s+WHERE\s+id\s*=\s*\?/i.test(sql)) {
            const [full_name, company, id] = params;
            const u = store.users.find(x => x.id === Number(id));
            if (u) {
              u.full_name = full_name;
              u.company = company;
              persist();
              return { changes: 1 };
            }
            return { changes: 0 };
          }

          // --- UPDATE users SET plan = ?, credits = credits + ? WHERE id = ? ---
          if (/UPDATE\s+users\s+SET\s+plan\s*=\s*\?,\s*credits\s*=\s*credits\s*\+\s*\?\s+WHERE\s+id\s*=\s*\?/i.test(sql)) {
            const [plan, bonus, id] = params;
            const u = store.users.find(x => x.id === Number(id));
            if (u) {
              u.plan = plan;
              u.credits = (u.credits || 0) + Number(bonus);
              persist();
              return { changes: 1 };
            }
            return { changes: 0 };
          }

          // --- UPDATE users SET credits = credits - ? WHERE id = ? ---
          if (/UPDATE\s+users\s+SET\s+credits\s*=\s*credits\s*-\s*\?\s+WHERE\s+id\s*=\s*\?/i.test(sql)) {
            const [cost, id] = params;
            const u = store.users.find(x => x.id === Number(id));
            if (u) {
              u.credits = Math.max(0, (u.credits || 0) - Number(cost));
              persist();
              return { changes: 1 };
            }
            return { changes: 0 };
          }

          // --- DELETE FROM saved_leads WHERE id = ? ---
          if (/DELETE\s+FROM\s+saved_leads\s+WHERE\s+id\s*=\s*\?/i.test(sql)) {
            const [id] = params;
            const before = store.saved_leads.length;
            store.saved_leads = store.saved_leads.filter(x => x.id !== Number(id));
            persist();
            return { changes: before - store.saved_leads.length };
          }

          // --- DELETE FROM api_keys WHERE id = ? ---
          if (/DELETE\s+FROM\s+api_keys\s+WHERE\s+id\s*=\s*\?/i.test(sql)) {
            const [id] = params;
            const before = store.api_keys.length;
            store.api_keys = store.api_keys.filter(x => x.id !== Number(id));
            persist();
            return { changes: before - store.api_keys.length };
          }

          return { changes: 0 };
        },

        get(...params) {
          // --- COUNT queries ---
          if (/SELECT\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+users/i.test(sql)) {
            return { count: store.users.length };
          }
          if (/SELECT\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+leads/i.test(sql)) {
            return { count: store.leads.length };
          }
          if (/SELECT\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+saved_leads\s+WHERE\s+user_id\s*=\s*\?/i.test(sql)) {
            const uid = Number(params[0]);
            return { count: store.saved_leads.filter(x => x.user_id === uid).length };
          }
          if (/SELECT\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+api_keys\s+WHERE\s+user_id\s*=\s*\?/i.test(sql)) {
            const uid = Number(params[0]);
            return { count: store.api_keys.filter(x => x.user_id === uid).length };
          }

          // --- SELECT user by email ---
          if (/FROM\s+users\s+WHERE\s+LOWER\(email\)\s*=\s*LOWER\(\?\)/i.test(sql)) {
            const email = String(params[0]).toLowerCase();
            return store.users.find(u => u.email.toLowerCase() === email);
          }

          // --- SELECT user by ID ---
          if (/FROM\s+users\s+WHERE\s+id\s*=\s*\?/i.test(sql)) {
            const id = Number(params[0]);
            return store.users.find(u => u.id === id);
          }

          // --- SELECT credits FROM users WHERE id = ? ---
          if (/SELECT\s+credits\s+FROM\s+users\s+WHERE\s+id\s*=\s*\?/i.test(sql)) {
            const id = Number(params[0]);
            const u = store.users.find(x => x.id === id);
            return u ? { credits: u.credits } : undefined;
          }

          // --- SELECT saved_leads by user_id and lead_id ---
          if (/FROM\s+saved_leads\s+WHERE\s+user_id\s*=\s*\?\s+AND\s+lead_id\s*=\s*\?/i.test(sql)) {
            const [uid, lid] = params;
            return store.saved_leads.find(x => x.user_id === Number(uid) && x.lead_id === Number(lid));
          }

          // --- SELECT api_key by id ---
          if (/FROM\s+api_keys\s+WHERE\s+id\s*=\s*\?/i.test(sql)) {
            const id = Number(params[0]);
            return store.api_keys.find(x => x.id === id);
          }

          return undefined;
        },

        all(...params) {
          // --- SELECT DISTINCT industry FROM leads ---
          if (/SELECT\s+DISTINCT\s+industry\s+FROM\s+leads/i.test(sql)) {
            const set = [...new Set(store.leads.map(l => l.industry))].sort();
            return set.map(industry => ({ industry }));
          }

          // --- SELECT DISTINCT country FROM leads ---
          if (/SELECT\s+DISTINCT\s+country\s+FROM\s+leads/i.test(sql)) {
            const set = [...new Set(store.leads.map(l => l.country))].sort();
            return set.map(country => ({ country }));
          }

          // --- Industry breakdown aggregation ---
          if (/SELECT\s+industry,\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+leads/i.test(sql)) {
            const map = {};
            for (const l of store.leads) {
              map[l.industry] = (map[l.industry] || 0) + 1;
            }
            return Object.entries(map)
              .map(([industry, count]) => ({ industry, count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 5);
          }

          // --- SELECT api_keys WHERE user_id = ? ---
          if (/FROM\s+api_keys\s+WHERE\s+user_id\s*=\s*\?/i.test(sql)) {
            const uid = Number(params[0]);
            return store.api_keys.filter(k => k.user_id === uid).reverse();
          }

          // --- SELECT activity_logs WHERE user_id = ? ---
          if (/FROM\s+activity_logs\s+WHERE\s+user_id\s*=\s*\?/i.test(sql)) {
            const uid = Number(params[0]);
            return store.activity_logs.filter(a => a.user_id === uid).slice(-8).reverse();
          }

          // --- SELECT saved_leads joined with leads ---
          if (/FROM\s+saved_leads/i.test(sql) && /JOIN\s+leads/i.test(sql)) {
            const uid = Number(params[0]);
            const userSaves = store.saved_leads.filter(s => s.user_id === uid);
            const results = [];
            for (const s of userSaves) {
              const lead = store.leads.find(l => l.id === s.lead_id);
              if (lead) {
                results.push({
                  ...lead,
                  saved_at: s.saved_at,
                  notes: s.notes,
                  is_saved: 1
                });
              }
            }
            return results.reverse();
          }

          // --- SELECT * FROM leads WHERE id IN (...) ---
          if (/SELECT\s+\*\s+FROM\s+leads\s+WHERE\s+id\s+IN/i.test(sql)) {
            const ids = params.map(Number);
            return store.leads.filter(l => ids.includes(l.id));
          }

          // --- Lead Finder Query Engine (Complex WHERE filters) ---
          if (/FROM\s+leads\s+l/i.test(sql)) {
            const userId = Number(params[0]);
            const userSavedSet = new Set(store.saved_leads.filter(s => s.user_id === userId).map(s => s.lead_id));
            let results = store.leads.map(l => ({
              ...l,
              is_saved: userSavedSet.has(l.id) ? 1 : 0
            }));

            // Check if query parameter exists
            if (sql.includes('l.company_name LIKE ?')) {
              // The search string was pushed 5 times for (company, domain, contact, title, tech)
              const q = String(params[1]).replace(/%/g, '').toLowerCase();
              results = results.filter(l =>
                (l.company_name && l.company_name.toLowerCase().includes(q)) ||
                (l.domain && l.domain.toLowerCase().includes(q)) ||
                (l.contact_name && l.contact_name.toLowerCase().includes(q)) ||
                (l.contact_title && l.contact_title.toLowerCase().includes(q)) ||
                (l.tech_stack && l.tech_stack.toLowerCase().includes(q))
              );
            }

            // Industry filter
            const indMatch = sql.match(/l\.industry\s*=\s*\?/);
            if (indMatch) {
              // Find index of industry param
              const indVal = params.find(p => typeof p === 'string' && store.leads.some(l => l.industry === p));
              if (indVal) {
                results = results.filter(l => l.industry === indVal);
              }
            }

            // Country filter
            const cntMatch = sql.match(/l\.country\s*=\s*\?/);
            if (cntMatch) {
              const cntVal = params.find(p => typeof p === 'string' && store.leads.some(l => l.country === p));
              if (cntVal) {
                results = results.filter(l => l.country === cntVal);
              }
            }

            // Employee filter
            const empMatch = sql.match(/l\.employees\s*>=\s*\?/);
            if (empMatch) {
              const empVal = params.find(p => typeof p === 'number');
              if (empVal) {
                results = results.filter(l => l.employees >= empVal);
              }
            }

            // Sort
            if (sql.includes('ORDER BY l.employees DESC')) {
              results.sort((a, b) => b.employees - a.employees);
            } else if (sql.includes('ORDER BY l.company_name ASC')) {
              results.sort((a, b) => a.company_name.localeCompare(b.company_name));
            } else {
              results.sort((a, b) => a.id - b.id);
            }

            return results;
          }

          return [];
        }
      };
    }
  };
}

function initDatabase() {
  if (isNativeSqlite) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        company TEXT,
        plan TEXT DEFAULT 'Starter',
        credits INTEGER DEFAULT 500,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT NOT NULL,
        domain TEXT NOT NULL,
        industry TEXT NOT NULL,
        employees INTEGER DEFAULT 50,
        revenue_range TEXT,
        country TEXT NOT NULL,
        city TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        contact_title TEXT NOT NULL,
        contact_email TEXT NOT NULL,
        contact_phone TEXT,
        tech_stack TEXT,
        funding_stage TEXT,
        verified INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS saved_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        lead_id INTEGER NOT NULL,
        saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE,
        UNIQUE(user_id, lead_id)
      );
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        key_name TEXT NOT NULL,
        api_key TEXT UNIQUE NOT NULL,
        requests_count INTEGER DEFAULT 0,
        rate_limit INTEGER DEFAULT 1000,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used DATETIME,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT DEFAULT '127.0.0.1',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
  }

  seedData();
}

function seedData() {
  const userCheck = db.prepare('SELECT COUNT(*) as count FROM users').get();
  const userCount = userCheck ? userCheck.count : 0;

  if (userCount === 0) {
    const salt = bcrypt.genSaltSync(10);
    const demoPassword = bcrypt.hashSync('demo123', salt);
    const adminPassword = bcrypt.hashSync('admin123', salt);

    const insertUser = db.prepare(`
      INSERT INTO users (email, password, full_name, company, plan, credits, role)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run('demo@datafinder.io', demoPassword, 'Sarah Jenkins', 'Apex Cloud Labs', 'Pro', 4850, 'user');
    insertUser.run('admin@datafinder.io', adminPassword, 'Alex Vance', 'DataFinder HQ', 'Enterprise', 99999, 'admin');

    const insertApiKey = db.prepare(`
      INSERT INTO api_keys (user_id, key_name, api_key, requests_count, rate_limit)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertApiKey.run(1, 'Production Webhooks', 'df_live_948f2a1b73e46c8d0e5271a3bc89', 342, 5000);
    insertApiKey.run(1, 'Staging Scraper API', 'df_test_302d9c4f1a8e6b7c5d01248ef3a7', 48, 1000);

    const insertLog = db.prepare(`
      INSERT INTO activity_logs (user_id, action, details)
      VALUES (?, ?, ?)
    `);
    insertLog.run(1, 'USER_REGISTER', 'User account registered with Pro Tier');
    insertLog.run(1, 'API_KEY_CREATED', 'Created key Production Webhooks');
  }

  const leadsCheck = db.prepare('SELECT COUNT(*) as count FROM leads').get();
  const leadsCount = leadsCheck ? leadsCheck.count : 0;

  if (leadsCount === 0) {
    const seedLeads = [
      {
        company_name: 'NexusAI Solutions',
        domain: 'nexusai.tech',
        industry: 'Artificial Intelligence',
        employees: 140,
        revenue_range: '$10M - $25M',
        country: 'United States',
        city: 'San Francisco',
        contact_name: 'Elena Rostova',
        contact_title: 'Chief Technology Officer',
        contact_email: 'elena@nexusai.tech',
        contact_phone: '+1 (415) 892-3401',
        tech_stack: 'Python, PyTorch, React, AWS, Docker',
        funding_stage: 'Series B',
        verified: 1
      },
      {
        company_name: 'CyberShield Systems',
        domain: 'cybershield.security',
        industry: 'Cybersecurity',
        employees: 320,
        revenue_range: '$25M - $50M',
        country: 'United Kingdom',
        city: 'London',
        contact_name: 'Marcus Holloway',
        contact_title: 'VP of Engineering',
        contact_email: 'm.holloway@cybershield.security',
        contact_phone: '+44 20 7946 0912',
        tech_stack: 'Go, Rust, Kubernetes, Terraform, Datadog',
        funding_stage: 'Series C',
        verified: 1
      },
      {
        company_name: 'HyperPay FinTech',
        domain: 'hyperpay.io',
        industry: 'Financial Technology',
        employees: 85,
        revenue_range: '$5M - $10M',
        country: 'Singapore',
        city: 'Singapore',
        contact_name: 'Li Wei Chen',
        contact_title: 'Head of Growth & Data',
        contact_email: 'wei.chen@hyperpay.io',
        contact_phone: '+65 6789 0123',
        tech_stack: 'Node.js, PostgreSQL, Kafka, Stripe API',
        funding_stage: 'Series A',
        verified: 1
      },
      {
        company_name: 'BioPulse Analytics',
        domain: 'biopulse.health',
        industry: 'Healthcare & Biotech',
        employees: 210,
        revenue_range: '$15M - $30M',
        country: 'Germany',
        city: 'Munich',
        contact_name: 'Dr. Julia Weber',
        contact_title: 'Chief Medical Officer',
        contact_email: 'j.weber@biopulse.health',
        contact_phone: '+49 89 2442 7701',
        tech_stack: 'Python, Snowflake, Vue.js, HIPAA Cloud',
        funding_stage: 'Series B',
        verified: 1
      },
      {
        company_name: 'AeroCloud Logistics',
        domain: 'aerocloud.supply',
        industry: 'Logistics & Supply Chain',
        employees: 560,
        revenue_range: '$50M - $100M',
        country: 'United States',
        city: 'Chicago',
        contact_name: 'David Sterling',
        contact_title: 'VP of Global Logistics',
        contact_email: 'sterling.d@aerocloud.supply',
        contact_phone: '+1 (312) 555-0199',
        tech_stack: 'Java, Spring Boot, React, Azure, Kafka',
        funding_stage: 'Public (IPO)',
        verified: 1
      },
      {
        company_name: 'PulseFlow SaaS',
        domain: 'pulseflow.app',
        industry: 'SaaS & Productivity',
        employees: 45,
        revenue_range: '$2M - $5M',
        country: 'Canada',
        city: 'Toronto',
        contact_name: 'Sophie Martin',
        contact_title: 'Founder & CEO',
        contact_email: 'sophie@pulseflow.app',
        contact_phone: '+1 (416) 555-0143',
        tech_stack: 'Next.js, TypeScript, Supabase, Tailwind, Redis',
        funding_stage: 'Seed',
        verified: 1
      },
      {
        company_name: 'KiteCommerce Global',
        domain: 'kitecommerce.net',
        industry: 'E-commerce',
        employees: 180,
        revenue_range: '$20M - $40M',
        country: 'Australia',
        city: 'Sydney',
        contact_name: 'Liam Gallagher',
        contact_title: 'Director of Digital Commerce',
        contact_email: 'liam@kitecommerce.net',
        contact_phone: '+61 2 9876 5432',
        tech_stack: 'Shopify Plus, Node.js, GraphQL, Algolia, GCP',
        funding_stage: 'Series B',
        verified: 1
      },
      {
        company_name: 'QuantumScale Infrastructure',
        domain: 'quantumscale.cloud',
        industry: 'Cloud Infrastructure',
        employees: 410,
        revenue_range: '$40M - $80M',
        country: 'United States',
        city: 'Seattle',
        contact_name: 'Ananya Sharma',
        contact_title: 'Head of Infrastructure',
        contact_email: 'asharma@quantumscale.cloud',
        contact_phone: '+1 (206) 555-0182',
        tech_stack: 'Kubernetes, Golang, Envoy, Prometheus, AWS',
        funding_stage: 'Series C',
        verified: 1
      },
      {
        company_name: 'GreenGrid Energy',
        domain: 'greengrid.energy',
        industry: 'CleanTech & Energy',
        employees: 95,
        revenue_range: '$8M - $15M',
        country: 'Netherlands',
        city: 'Amsterdam',
        contact_name: 'Lars van der Beek',
        contact_title: 'Chief Operating Officer',
        contact_email: 'lars@greengrid.energy',
        contact_phone: '+31 20 794 8831',
        tech_stack: 'Python, TimescaleDB, Angular, IoT Core',
        funding_stage: 'Series A',
        verified: 1
      },
      {
        company_name: 'OrbitMedia Studio',
        domain: 'orbitmedia.agency',
        industry: 'Digital Media & AdTech',
        employees: 60,
        revenue_range: '$4M - $8M',
        country: 'United Kingdom',
        city: 'Manchester',
        contact_name: 'Chloe Bennett',
        contact_title: 'Head of Growth Marketing',
        contact_email: 'c.bennett@orbitmedia.agency',
        contact_phone: '+44 161 496 0233',
        tech_stack: 'Next.js, BigQuery, Google Ads API, Meta API',
        funding_stage: 'Bootstrapped',
        verified: 1
      },
      {
        company_name: 'TalentPeak HR',
        domain: 'talentpeak.io',
        industry: 'Human Resources Tech',
        employees: 125,
        revenue_range: '$10M - $18M',
        country: 'United States',
        city: 'Austin',
        contact_name: 'Mateo Hernandez',
        contact_title: 'Chief Product Officer',
        contact_email: 'mateo@talentpeak.io',
        contact_phone: '+1 (512) 555-0167',
        tech_stack: 'Ruby on Rails, React, PostgreSQL, ElasticSearch',
        funding_stage: 'Series A',
        verified: 1
      },
      {
        company_name: 'OmniStream Data',
        domain: 'omnistream.dev',
        industry: 'Big Data & Streaming',
        employees: 275,
        revenue_range: '$30M - $60M',
        country: 'Sweden',
        city: 'Stockholm',
        contact_name: 'Freja Lindqvist',
        contact_title: 'Director of Data Architecture',
        contact_email: 'freja@omnistream.dev',
        contact_phone: '+46 8 123 4567',
        tech_stack: 'Apache Kafka, Apache Flink, Scala, ClickHouse',
        funding_stage: 'Series B',
        verified: 1
      }
    ];

    const insertLead = db.prepare(`
      INSERT INTO leads (
        company_name, domain, industry, employees, revenue_range,
        country, city, contact_name, contact_title, contact_email,
        contact_phone, tech_stack, funding_stage, verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const lead of seedLeads) {
      insertLead.run(
        lead.company_name, lead.domain, lead.industry, lead.employees, lead.revenue_range,
        lead.country, lead.city, lead.contact_name, lead.contact_title, lead.contact_email,
        lead.contact_phone, lead.tech_stack, lead.funding_stage, lead.verified
      );
    }

    const saveLead = db.prepare(`
      INSERT INTO saved_leads (user_id, lead_id, notes) VALUES (?, ?, ?)
    `);
    saveLead.run(1, 1, 'Top priority outreach lead for AI integration');
    saveLead.run(1, 2, 'Follow up regarding security compliance audit');
  }
}

module.exports = {
  db,
  initDatabase
};
