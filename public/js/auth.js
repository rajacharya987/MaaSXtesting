// ==============================================================================
// DATAFINDER SAAS - AUTHENTICATION STATE & LOGIC
// ==============================================================================

const Auth = {
  TOKEN_KEY: 'df_token',
  USER_KEY: 'df_user',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  getUser() {
    const raw = localStorage.getItem(this.USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  isAuthenticated() {
    return !!this.getToken() && !!this.getUser();
  },

  setSession(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  getHeaders() {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  },

  async login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to sign in.');
    }
    this.setSession(data.token, data.user);
    return data;
  },

  async register(full_name, email, password, company) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name, email, password, company })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create account.');
    }
    this.setSession(data.token, data.user);
    return data;
  },

  async fetchCurrentUser() {
    if (!this.isAuthenticated()) return null;
    try {
      const res = await fetch('/api/auth/me', {
        headers: this.getHeaders()
      });
      if (!res.ok) {
        this.clearSession();
        return null;
      }
      const data = await res.json();
      localStorage.setItem(this.USER_KEY, JSON.stringify(data.user));
      return data.user;
    } catch (e) {
      return this.getUser();
    }
  },

  logout() {
    this.clearSession();
    window.location.reload();
  }
};
