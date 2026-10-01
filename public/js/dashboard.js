// ==============================================================================
// DATAFINDER SAAS - DASHBOARD LOGIC & API INTEGRATIONS
// ==============================================================================

const Dashboard = {
  currentLeads: [],
  selectedLeadIds: new Set(),
  filterOptions: {
    industries: [],
    countries: []
  },

  async init() {
    await this.loadStats();
    await this.loadLeads();
    await this.loadApiKeys();
    this.setupEventListeners();
  },

  // 1. Overview & Stats
  async loadStats() {
    try {
      const res = await fetch('/api/stats', { headers: Auth.getHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      
      const { metrics, industryDistribution, recentActivity } = data;
      
      // Update Stat Cards
      const totalEl = document.getElementById('stat-total-leads');
      if (totalEl) totalEl.textContent = Number(metrics.totalLeadsAvailable).toLocaleString();
      
      const savedEl = document.getElementById('stat-saved-leads');
      if (savedEl) savedEl.textContent = metrics.userSavedCount;

      const credEl = document.getElementById('stat-credits');
      if (credEl) credEl.textContent = Number(metrics.userCredits).toLocaleString();

      const topCredPill = document.getElementById('header-credits-val');
      if (topCredPill) topCredPill.textContent = Number(metrics.userCredits).toLocaleString();

      // Render Industry Progress Bars
      const distContainer = document.getElementById('industry-distribution-list');
      if (distContainer && industryDistribution) {
        distContainer.innerHTML = industryDistribution.map(item => {
          const pct = Math.min(100, Math.round((item.count / metrics.totalLeadsAvailable) * 100 * 2));
          return `
            <div>
              <div class="progress-item-label">
                <span>${item.industry}</span>
                <span class="text-dim">${item.count} companies</span>
              </div>
              <div class="progress-bar-track">
                <div class="progress-bar-fill" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        }).join('');
      }

      // Render Recent Activity Logs
      const activityContainer = document.getElementById('recent-activity-list');
      if (activityContainer && recentActivity) {
        if (recentActivity.length === 0) {
          activityContainer.innerHTML = '<p class="text-dim" style="font-size: 0.85rem;">No recent activities yet.</p>';
        } else {
          activityContainer.innerHTML = recentActivity.map(act => `
            <div class="activity-item">
              <div class="activity-dot"></div>
              <div class="activity-text">
                <strong>${act.action.replace(/_/g, ' ')}</strong>
                <span>${act.details || ''} • <time>${new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></span>
              </div>
            </div>
          `).join('');
        }
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  },

  // 2. Leads Search & Filtering
  async loadLeads() {
    const query = document.getElementById('lead-search-input')?.value || '';
    const industry = document.getElementById('lead-industry-filter')?.value || 'all';
    const country = document.getElementById('lead-country-filter')?.value || 'all';
    const minEmployees = document.getElementById('lead-employee-filter')?.value || '0';
    const sortBy = document.getElementById('lead-sort-filter')?.value || 'id_asc';

    const params = new URLSearchParams({
      query,
      industry,
      country,
      min_employees: minEmployees,
      sort_by: sortBy
    });

    const tableBody = document.getElementById('leads-table-body');
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px;">
            <div style="display: inline-block; animation: spin 1s linear infinite; font-size: 1.5rem;">⚡</div>
            <p style="margin-top: 8px; color: var(--text-muted);">Querying intelligence database...</p>
          </td>
        </tr>
      `;
    }

    try {
      const res = await fetch(`/api/leads?${params.toString()}`, { headers: Auth.getHeaders() });
      if (!res.ok) throw new Error('Failed to query leads');
      const data = await res.json();
      
      this.currentLeads = data.leads;
      this.renderFilterOptions(data.filterOptions);
      this.renderLeadsTable(data.leads);

      const countBadge = document.getElementById('leads-found-count');
      if (countBadge) countBadge.textContent = `${data.leads.length} leads found`;
    } catch (err) {
      console.error('Error fetching leads:', err);
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--error); padding: 30px;">Error loading data.</td></tr>`;
      }
    }
  },

  renderFilterOptions(options) {
    if (!options) return;
    const indSelect = document.getElementById('lead-industry-filter');
    const cntSelect = document.getElementById('lead-country-filter');

    if (indSelect && indSelect.options.length <= 1) {
      options.industries.forEach(ind => {
        const opt = document.createElement('option');
        opt.value = ind;
        opt.textContent = ind;
        indSelect.appendChild(opt);
      });
    }

    if (cntSelect && cntSelect.options.length <= 1) {
      options.countries.forEach(cnt => {
        const opt = document.createElement('option');
        opt.value = cnt;
        opt.textContent = cnt;
        cntSelect.appendChild(opt);
      });
    }
  },

  renderLeadsTable(leads) {
    const tableBody = document.getElementById('leads-table-body');
    if (!tableBody) return;

    if (!leads || leads.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <div class="empty-state-icon">🔍</div>
              <h3>No matching leads found</h3>
              <p>Try adjusting your search query, location filter, or industry criteria.</p>
              <button class="btn btn-secondary btn-sm" onclick="Dashboard.resetFilters()">Clear Filters</button>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = leads.map(lead => {
      const isSelected = this.selectedLeadIds.has(lead.id);
      const techList = lead.tech_stack ? lead.tech_stack.split(',').map(t => `<span class="tech-pill">${t.trim()}</span>`).join('') : '';

      return `
        <tr data-lead-id="${lead.id}">
          <td style="width: 40px; text-align: center;">
            <input type="checkbox" class="lead-checkbox" value="${lead.id}" ${isSelected ? 'checked' : ''} onchange="Dashboard.toggleSelectLead(${lead.id})">
          </td>
          <td>
            <div class="company-cell">
              <div class="company-logo-avatar">${lead.company_name.charAt(0)}</div>
              <div>
                <div class="company-name" style="cursor: pointer;" onclick="Dashboard.openLeadModal(${lead.id})">
                  ${lead.company_name}
                  <span class="tag tag-stage" style="margin-left: 6px;">${lead.funding_stage || 'Growth'}</span>
                </div>
                <div class="company-domain">
                  <a href="https://${lead.domain}" target="_blank" rel="noopener" style="color: var(--accent);">${lead.domain} ↗</a>
                </div>
              </div>
            </div>
          </td>
          <td>
            <div style="font-weight: 500;">${lead.industry}</div>
            <div style="font-size: 0.78rem; color: var(--text-dim);">📍 ${lead.city}, ${lead.country}</div>
          </td>
          <td>
            <div style="font-weight: 600;">${lead.employees} employees</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">${lead.revenue_range || '$5M+'}</div>
          </td>
          <td>
            <div style="font-weight: 600;">${lead.contact_name}</div>
            <div style="font-size: 0.78rem; color: var(--text-dim); margin-bottom: 4px;">${lead.contact_title}</div>
            <span class="tag tag-verified">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
              ${lead.contact_email}
            </span>
          </td>
          <td>
            <div class="tech-pill-list">
              ${techList}
            </div>
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn-star ${lead.is_saved ? 'saved' : ''}" title="${lead.is_saved ? 'Remove bookmark' : 'Bookmark lead'}" onclick="Dashboard.toggleSaveLead(${lead.id})">
              ${lead.is_saved ? '★' : '☆'}
            </button>
            <button class="btn btn-secondary btn-sm" style="margin-left: 6px;" onclick="Dashboard.openLeadModal(${lead.id})">
              Details
            </button>
          </td>
        </tr>
      `;
    }).join('');

    this.updateExportBtnState();
  },

  // 3. Selection & Bulk Export
  toggleSelectLead(id) {
    if (this.selectedLeadIds.has(id)) {
      this.selectedLeadIds.delete(id);
    } else {
      this.selectedLeadIds.add(id);
    }
    this.updateExportBtnState();
  },

  toggleSelectAll(checked) {
    if (checked) {
      this.currentLeads.forEach(l => this.selectedLeadIds.add(l.id));
    } else {
      this.selectedLeadIds.clear();
    }
    document.querySelectorAll('.lead-checkbox').forEach(cb => cb.checked = checked);
    this.updateExportBtnState();
  },

  updateExportBtnState() {
    const btn = document.getElementById('btn-export-selected');
    const countEl = document.getElementById('selected-export-count');
    if (btn && countEl) {
      countEl.textContent = this.selectedLeadIds.size;
      btn.disabled = this.selectedLeadIds.size === 0;
      btn.style.opacity = this.selectedLeadIds.size > 0 ? '1' : '0.5';
    }
  },

  // 4. Save/Bookmark Lead
  async toggleSaveLead(leadId) {
    try {
      const res = await fetch('/api/leads/toggle-save', {
        method: 'POST',
        headers: Auth.getHeaders(),
        body: JSON.stringify({ lead_id: leadId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      App.showToast(data.message, 'success');
      await this.loadLeads();
      await this.loadStats();
      if (document.getElementById('view-saved').classList.contains('active')) {
        await this.loadSavedLeads();
      }
    } catch (err) {
      App.showToast(err.message || 'Action failed', 'error');
    }
  },

  // 5. Saved Leads View
  async loadSavedLeads() {
    const container = document.getElementById('saved-leads-list');
    if (!container) return;

    try {
      const res = await fetch('/api/leads/saved', { headers: Auth.getHeaders() });
      const data = await res.json();
      
      if (!data.leads || data.leads.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">⭐</div>
            <h3>No Bookmarked Leads</h3>
            <p>Star companies from the Lead Finder to build your custom prospect lists.</p>
            <button class="btn btn-primary btn-sm" onclick="App.switchView('leads')">Browse Leads</button>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div><strong>${data.leads.length} Bookmarked Profiles</strong></div>
          <button class="btn btn-secondary btn-sm" onclick="Dashboard.exportDataset('csv', ${JSON.stringify(data.leads.map(l => l.id))})">
            📥 Download Saved List (CSV)
          </button>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">
          ${data.leads.map(lead => `
            <div class="feature-card" style="padding: 20px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <div class="company-logo-avatar">${lead.company_name.charAt(0)}</div>
                  <div>
                    <h4 style="font-size: 1.05rem;">${lead.company_name}</h4>
                    <span style="font-size: 0.78rem; color: var(--accent);">${lead.domain}</span>
                  </div>
                </div>
                <button class="btn-star saved" onclick="Dashboard.toggleSaveLead(${lead.id})">★</button>
              </div>
              <div style="font-size: 0.84rem; color: var(--text-muted); margin-bottom: 10px;">
                👤 <strong>${lead.contact_name}</strong> • ${lead.contact_title}
              </div>
              <div style="font-size: 0.82rem; color: var(--text-dim); margin-bottom: 12px;">
                ✉️ ${lead.contact_email}
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; border-top: 1px solid var(--border); padding-top: 10px;">
                <span class="tag tag-stage">${lead.industry}</span>
                <button class="btn btn-outline btn-sm" onclick="Dashboard.openLeadModal(${lead.id})">Inspect Dossier</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      console.error(err);
    }
  },

  // 6. Lead Detail Dossier Modal
  openLeadModal(leadId) {
    const lead = this.currentLeads.find(l => l.id === leadId);
    if (!lead) return;

    const modal = document.getElementById('lead-dossier-modal');
    const content = document.getElementById('lead-dossier-content');
    if (!modal || !content) return;

    content.innerHTML = `
      <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
        <div class="company-logo-avatar" style="width: 52px; height: 52px; font-size: 1.4rem;">${lead.company_name.charAt(0)}</div>
        <div>
          <h2 style="font-size: 1.45rem;">${lead.company_name}</h2>
          <p style="color: var(--accent); font-size: 0.9rem;">
            <a href="https://${lead.domain}" target="_blank" rel="noopener">https://${lead.domain} ↗</a>
          </p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
        <div style="background: rgba(255,255,255,0.03); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border);">
          <span style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Industry & Stage</span>
          <div style="font-weight: 600; margin-top: 4px;">${lead.industry}</div>
          <div style="font-size: 0.8rem; color: var(--primary-light);">${lead.funding_stage || 'Growth Stage'}</div>
        </div>
        <div style="background: rgba(255,255,255,0.03); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border);">
          <span style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Headquarters</span>
          <div style="font-weight: 600; margin-top: 4px;">${lead.city}, ${lead.country}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">${lead.employees} employees • ${lead.revenue_range}</div>
        </div>
      </div>

      <h4 style="font-size: 0.95rem; margin-bottom: 12px; color: var(--text-muted);">Verified Decision Maker Contact</h4>
      <div style="background: rgba(16, 185, 129, 0.06); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: var(--radius-md); padding: 16px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700; font-size: 1.05rem;">${lead.contact_name}</div>
            <div style="font-size: 0.84rem; color: var(--text-muted);">${lead.contact_title}</div>
          </div>
          <span class="tag tag-verified">Verified 100%</span>
        </div>
        <div style="margin-top: 12px; font-size: 0.88rem; display: flex; flex-direction: column; gap: 6px;">
          <div>✉️ <strong>Direct Email:</strong> <a href="mailto:${lead.contact_email}" style="color: var(--primary-light);">${lead.contact_email}</a></div>
          <div>📞 <strong>Phone:</strong> <span>${lead.contact_phone || 'Unlisted'}</span></div>
        </div>
      </div>

      <h4 style="font-size: 0.95rem; margin-bottom: 10px; color: var(--text-muted);">Identified Tech Stack</h4>
      <div class="tech-pill-list" style="max-width: 100%; margin-bottom: 24px;">
        ${(lead.tech_stack || '').split(',').map(t => `<span class="tech-pill" style="font-size: 0.82rem; padding: 4px 10px;">${t.trim()}</span>`).join('')}
      </div>

      <div style="display: flex; gap: 12px; justify-content: flex-end; border-top: 1px solid var(--border); padding-top: 18px;">
        <button class="btn btn-secondary btn-sm" onclick="App.closeModal('lead-dossier-modal')">Close</button>
        <button class="btn btn-primary btn-sm" onclick="Dashboard.exportDataset('csv', [${lead.id}])">Export Record</button>
      </div>
    `;

    App.openModal('lead-dossier-modal');
  },

  // 7. Export Functionality (Generates Real CSV / JSON Download)
  async exportDataset(format = 'csv', ids = null) {
    const leadIds = ids || Array.from(this.selectedLeadIds);
    if (!leadIds || leadIds.length === 0) {
      App.showToast('Please select at least one record to export', 'error');
      return;
    }

    try {
      const res = await fetch('/api/leads/export', {
        method: 'POST',
        headers: Auth.getHeaders(),
        body: JSON.stringify({ lead_ids: leadIds, format })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Export failed');
      }

      App.showToast(data.message, 'success');
      await this.loadStats();

      // Trigger automatic file download
      if (format === 'json') {
        const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data.data, null, 2));
        const dl = document.createElement('a');
        dl.setAttribute("href", jsonStr);
        dl.setAttribute("download", `datafinder_export_${Date.now()}.json`);
        document.body.appendChild(dl);
        dl.click();
        dl.remove();
      } else {
        // Build CSV string
        const headers = ['Company', 'Domain', 'Industry', 'Employees', 'Revenue', 'Country', 'City', 'Contact Name', 'Contact Title', 'Contact Email', 'Phone', 'Tech Stack'];
        const csvRows = [headers.join(',')];

        for (const item of data.data) {
          const row = [
            `"${item.company_name.replace(/"/g, '""')}"`,
            `"${item.domain}"`,
            `"${item.industry}"`,
            item.employees,
            `"${item.revenue_range}"`,
            `"${item.country}"`,
            `"${item.city}"`,
            `"${item.contact_name}"`,
            `"${item.contact_title}"`,
            `"${item.contact_email}"`,
            `"${item.contact_phone || ''}"`,
            `"${(item.tech_stack || '').replace(/"/g, '""')}"`
          ];
          csvRows.push(row.join(','));
        }

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `datafinder_leads_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  // 8. Developer API Keys
  async loadApiKeys() {
    const listContainer = document.getElementById('api-keys-table-body');
    if (!listContainer) return;

    try {
      const res = await fetch('/api/apikeys', { headers: Auth.getHeaders() });
      const data = await res.json();

      if (!data.keys || data.keys.length === 0) {
        listContainer.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 20px;">No API keys created yet.</td></tr>';
        return;
      }

      listContainer.innerHTML = data.keys.map(k => `
        <tr>
          <td><strong>${k.key_name}</strong></td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <code style="background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 4px; font-family: monospace;">${k.api_key.substring(0, 12)}••••••••••••</code>
              <button class="btn btn-outline btn-sm" style="padding: 2px 8px; font-size: 0.72rem;" onclick="Dashboard.copyToClipboard('${k.api_key}')">Copy</button>
            </div>
          </td>
          <td>${k.requests_count} / ${k.rate_limit} req/hr</td>
          <td><span class="tag tag-verified">Active</span></td>
          <td style="text-align: right;">
            <button class="btn btn-outline btn-sm" style="color: var(--error);" onclick="Dashboard.revokeApiKey(${k.id})">Revoke</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  },

  async createApiKey() {
    const nameInput = document.getElementById('new-key-name-input');
    const name = nameInput ? nameInput.value.trim() : '';

    try {
      const res = await fetch('/api/apikeys', {
        method: 'POST',
        headers: Auth.getHeaders(),
        body: JSON.stringify({ key_name: name || 'API Token' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      App.showToast('New API key generated!', 'success');
      if (nameInput) nameInput.value = '';
      App.closeModal('new-key-modal');
      await this.loadApiKeys();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  async revokeApiKey(keyId) {
    if (!confirm('Are you sure you want to revoke this API key? Any applications using it will be denied access.')) return;

    try {
      const res = await fetch(`/api/apikeys/${keyId}`, {
        method: 'DELETE',
        headers: Auth.getHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      App.showToast(data.message, 'success');
      await this.loadApiKeys();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      App.showToast('API Key copied to clipboard!', 'success');
    }).catch(() => {
      App.showToast('Could not copy automatically', 'error');
    });
  },

  // 9. Plan Upgrade
  async switchPlan(newPlan) {
    try {
      const res = await fetch('/api/auth/update-plan', {
        method: 'POST',
        headers: Auth.getHeaders(),
        body: JSON.stringify({ plan: newPlan })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      App.showToast(data.message, 'success');
      await Auth.fetchCurrentUser();
      App.updateUserUI(data.user);
      await this.loadStats();
    } catch (err) {
      App.showToast(err.message, 'error');
    }
  },

  resetFilters() {
    const searchInput = document.getElementById('lead-search-input');
    const indSelect = document.getElementById('lead-industry-filter');
    const cntSelect = document.getElementById('lead-country-filter');
    const empSelect = document.getElementById('lead-employee-filter');

    if (searchInput) searchInput.value = '';
    if (indSelect) indSelect.value = 'all';
    if (cntSelect) cntSelect.value = 'all';
    if (empSelect) empSelect.value = '0';

    this.loadLeads();
  },

  setupEventListeners() {
    let debounceTimer;
    const searchInput = document.getElementById('lead-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => this.loadLeads(), 300);
      });
    }

    const indSelect = document.getElementById('lead-industry-filter');
    if (indSelect) indSelect.addEventListener('change', () => this.loadLeads());

    const cntSelect = document.getElementById('lead-country-filter');
    if (cntSelect) cntSelect.addEventListener('change', () => this.loadLeads());

    const empSelect = document.getElementById('lead-employee-filter');
    if (empSelect) empSelect.addEventListener('change', () => this.loadLeads());

    const sortSelect = document.getElementById('lead-sort-filter');
    if (sortSelect) sortSelect.addEventListener('change', () => this.loadLeads());
  }
};
