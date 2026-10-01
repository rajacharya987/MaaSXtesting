const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', 'datafinder.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for better concurrency and performance
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function initDatabase() {
  // 1. Users table
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
  `);

  // 2. Leads table (B2B SaaS intelligence dataset)
  db.exec(`
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
  `);

  // 3. Saved / Bookmarked leads
  db.exec(`
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
  `);

  // 4. API Keys
  db.exec(`
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
  `);

  // 5. Activity Audit Logs
  db.exec(`
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

  seedData();
}

function seedData() {
  // Check if users exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
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

    // Create an initial API key for demo user
    const insertApiKey = db.prepare(`
      INSERT INTO api_keys (user_id, key_name, api_key, requests_count, rate_limit)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertApiKey.run(1, 'Production Webhooks', 'df_live_948f2a1b73e46c8d0e5271a3bc89', 342, 5000);
    insertApiKey.run(1, 'Staging Scraper API', 'df_test_302d9c4f1a8e6b7c5d01248ef3a7', 48, 1000);

    // Initial activity log
    const insertLog = db.prepare(`
      INSERT INTO activity_logs (user_id, action, details)
      VALUES (?, ?, ?)
    `);
    insertLog.run(1, 'USER_REGISTER', 'User account registered with Pro Tier');
    insertLog.run(1, 'API_KEY_CREATED', 'Created key Production Webhooks');
  }

  // Check if leads exist
  const leadsCount = db.prepare('SELECT COUNT(*) as count FROM leads').get().count;
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

    // Bookmark first two leads for the demo user
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
