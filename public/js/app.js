// ==============================================================================
// DATAFINDER SAAS - CORE APPLICATION ORCHESTRATION & ROUTING
// ==============================================================================

const App = {
  activeView: 'overview',

  async init() {
    this.setupGlobalEvents();
    this.initRoiCalculator();
    this.initLandingPreview();

    // Check if user is authenticated
    if (Auth.isAuthenticated()) {
      const user = await Auth.fetchCurrentUser();
      if (user) {
        this.showAppLayout(user);
        await Dashboard.init();
      } else {
        this.showLandingLayout();
      }
    } else {
      this.showLandingLayout();
    }
  },

  // Switch between Landing View and SaaS App View
  showLandingLayout() {
    document.getElementById('landing-view').style.display = 'block';
    document.getElementById('app-view-container').style.display = 'none';
  },

  showAppLayout(user) {
    document.getElementById('landing-view').style.display = 'none';
    document.getElementById('app-view-container').style.display = 'flex';
    this.updateUserUI(user);
  },

  updateUserUI(user) {
    if (!user) return;
    const nameEl = document.getElementById('sidebar-user-name');
    const avatarEl = document.getElementById('sidebar-user-avatar');
    const planEl = document.getElementById('sidebar-user-plan');
    const companyEl = document.getElementById('workspace-name');

    if (nameEl) nameEl.textContent = user.full_name;
    if (avatarEl) avatarEl.textContent = user.full_name.charAt(0).toUpperCase();
    if (planEl) planEl.textContent = user.plan + ' Tier';
    if (companyEl) companyEl.textContent = user.company || 'Data Intelligence Lab';

    // Update settings form
    const settingsName = document.getElementById('settings-name');
    const settingsEmail = document.getElementById('settings-email');
    const settingsCompany = document.getElementById('settings-company');
    if (settingsName) settingsName.value = user.full_name;
    if (settingsEmail) settingsEmail.value = user.email;
    if (settingsCompany) settingsCompany.value = user.company || '';

    // Update active tier button state
    document.querySelectorAll('.btn-plan-select').forEach(btn => {
      const plan = btn.getAttribute('data-plan');
      if (plan === user.plan) {
        btn.textContent = 'Current Plan';
        btn.disabled = true;
        btn.className = 'btn btn-secondary btn-sm';
      } else {
        btn.textContent = 'Switch to ' + plan;
        btn.disabled = false;
        btn.className = 'btn btn-primary btn-sm';
      }
    });
  },

  // View navigation inside Dashboard
  switchView(viewName) {
    this.activeView = viewName;

    // Update sidebar menu items
    document.querySelectorAll('.menu-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-view') === viewName) {
        item.classList.add('active');
      }
    });

    // Update views
    document.querySelectorAll('.app-view').forEach(view => {
      view.classList.remove('active');
    });

    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.classList.add('active');
    }

    // Refresh view specific data
    if (viewName === 'saved') {
      Dashboard.loadSavedLeads();
    } else if (viewName === 'apikeys') {
      Dashboard.loadApiKeys();
    } else if (viewName === 'overview') {
      Dashboard.loadStats();
    } else if (viewName === 'leads') {
      Dashboard.loadLeads();
    }

    // Update Header title
    const titles = {
      overview: { title: 'Intelligence Overview', desc: 'Real-time metrics, active data enrichment, and usage stats.' },
      leads: { title: 'Precision Lead Finder', desc: 'Explore 40,000+ verified B2B decision makers and tech stacks.' },
      saved: { title: 'Saved Collections', desc: 'Manage your bookmarked accounts, custom notes, and targeted lists.' },
      apikeys: { title: 'Developer API & Webhooks', desc: 'Connect DataFinder directly to your CRM, scripts, and production pipelines.' },
      billing: { title: 'Subscription & Quotas', desc: 'Manage your tier limits, credit allocations, and invoices.' },
      settings: { title: 'Workspace Settings', desc: 'Configure company profile, security preferences, and audit logs.' }
    };

    const header = titles[viewName];
    if (header) {
      const h2 = document.querySelector('.header-title-box h2');
      const p = document.querySelector('.header-title-box p');
      if (h2) h2.textContent = header.title;
      if (p) p.textContent = header.desc;
    }
  },

  // Interactive ROI Calculator on landing page
  initRoiCalculator() {
    const slider = document.getElementById('calc-leads-slider');
    const countDisplay = document.getElementById('calc-leads-val');
    const hoursSavedDisplay = document.getElementById('calc-hours-val');
    const dollarsSavedDisplay = document.getElementById('calc-dollars-val');

    if (!slider) return;

    const updateCalc = () => {
      const leads = parseInt(slider.value, 10);
      if (countDisplay) countDisplay.textContent = leads.toLocaleString();

      // SDR spends roughly 18 minutes manually researching each company/contact = 0.3 hrs
      const hours = Math.round(leads * 0.3);
      if (hoursSavedDisplay) hoursSavedDisplay.textContent = `${hours} hrs/mo`;

      // Valued at $45/hr average SDR & researcher cost
      const dollars = Math.round(hours * 45);
      if (dollarsSavedDisplay) dollarsSavedDisplay.textContent = `$${dollars.toLocaleString()}`;
    };

    slider.addEventListener('input', updateCalc);
    updateCalc();
  },

  // Mini live preview on landing page
  initLandingPreview() {
    const previewInput = document.getElementById('landing-preview-search');
    const previewResults = document.getElementById('landing-preview-rows');
    if (!previewInput || !previewResults) return;

    const samplePreview = [
      { name: 'Stripe, Inc.', domain: 'stripe.com', ind: 'FinTech', role: 'VP Engineering', verified: true },
      { name: 'Datadog Labs', domain: 'datadoghq.com', ind: 'Cloud & DevOps', role: 'Chief Security Officer', verified: true },
      { name: 'Figma Systems', domain: 'figma.com', ind: 'Design Tech', role: 'Head of Product', verified: true }
    ];

    const render = (items) => {
      previewResults.innerHTML = items.map(i => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid var(--border); margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="company-logo-avatar" style="width: 32px; height: 32px; font-size: 0.85rem;">${i.name.charAt(0)}</div>
            <div>
              <div style="font-weight: 600; font-size: 0.9rem;">${i.name}</div>
              <div style="font-size: 0.78rem; color: var(--text-dim);">${i.domain} • ${i.ind}</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.82rem; font-weight: 600;">${i.role}</div>
            <span class="tag tag-verified" style="font-size: 0.7rem; padding: 1px 6px;">Verified Contact</span>
          </div>
        </div>
      `).join('');
    };

    render(samplePreview);

    previewInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = samplePreview.filter(s => s.name.toLowerCase().includes(q) || s.ind.toLowerCase().includes(q) || s.role.toLowerCase().includes(q));
      render(filtered.length ? filtered : samplePreview);
    });
  },

  // Modal Management
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  // Global Click and Form Events
  setupGlobalEvents() {
    // Tab switching in Auth modal
    const tabLogin = document.getElementById('tab-btn-login');
    const tabSignup = document.getElementById('tab-btn-signup');
    const formLogin = document.getElementById('form-login');
    const formSignup = document.getElementById('form-signup');

    if (tabLogin && tabSignup && formLogin && formSignup) {
      tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('btn-primary');
        tabLogin.classList.remove('btn-outline');
        tabSignup.classList.add('btn-outline');
        tabSignup.classList.remove('btn-primary');
        formLogin.style.display = 'block';
        formSignup.style.display = 'none';
      });

      tabSignup.addEventListener('click', () => {
        tabSignup.classList.add('btn-primary');
        tabSignup.classList.remove('btn-outline');
        tabLogin.classList.add('btn-outline');
        tabLogin.classList.remove('btn-primary');
        formSignup.style.display = 'block';
        formLogin.style.display = 'none';
      });
    }

    // Login Form Submit
    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const btn = formLogin.querySelector('button[type="submit"]');

        btn.disabled = true;
        btn.textContent = 'Verifying...';

        try {
          const res = await Auth.login(email, password);
          this.showToast('Welcome back, ' + res.user.full_name + '!', 'success');
          this.closeModal('auth-modal');
          this.showAppLayout(res.user);
          await Dashboard.init();
        } catch (err) {
          this.showToast(err.message, 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Sign In to DataFinder';
        }
      });
    }

    // Signup Form Submit
    if (formSignup) {
      formSignup.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const company = document.getElementById('signup-company').value;
        const btn = formSignup.querySelector('button[type="submit"]');

        btn.disabled = true;
        btn.textContent = 'Creating account...';

        try {
          const res = await Auth.register(fullName, email, password, company);
          this.showToast('Account created successfully!', 'success');
          this.closeModal('auth-modal');
          this.showAppLayout(res.user);
          await Dashboard.init();
        } catch (err) {
          this.showToast(err.message, 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Create Free Account';
        }
      });
    }

    // 1-Click Instant Demo Login
    const demoLoginBtns = document.querySelectorAll('.btn-instant-demo');
    demoLoginBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Launching Demo Sandbox...';
        try {
          const res = await Auth.login('demo@datafinder.io', 'demo123');
          this.showToast('Logged in as Sarah Jenkins (Pro Demo)!', 'success');
          this.closeModal('auth-modal');
          this.showAppLayout(res.user);
          await Dashboard.init();
        } catch (err) {
          this.showToast(err.message, 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = '⚡ One-Click Instant Demo';
        }
      });
    });

    // Logout
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        Auth.logout();
      });
    }

    // Profile Settings Form
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const full_name = document.getElementById('settings-name').value;
        const company = document.getElementById('settings-company').value;

        try {
          const res = await fetch('/api/auth/update-profile', {
            method: 'POST',
            headers: Auth.getHeaders(),
            body: JSON.stringify({ full_name, company })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          this.showToast('Profile updated!', 'success');
          localStorage.setItem(Auth.USER_KEY, JSON.stringify(data.user));
          this.updateUserUI(data.user);
        } catch (err) {
          this.showToast(err.message, 'error');
        }
      });
    }

    // Close modal when clicking on overlay background
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });
  }
};

// Auto start application on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
