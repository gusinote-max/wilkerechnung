import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  tax_rate: number;
}

export interface InvoiceData {
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  vendor_name: string;
  vendor_address: string;
  vendor_vat_id: string;
  vendor_iban: string;
  vendor_bic: string;
  buyer_name: string;
  buyer_address: string;
  buyer_vat_id: string;
  net_amount: number;
  vat_amount: number;
  vat_rate: number;
  gross_amount: number;
  currency: string;
  line_items: LineItem[];
  payment_terms: string;
  notes: string;
  // NEW: Accounting fields
  account_number?: string;
  account_name?: string;
  cost_center?: string;
  cost_center_name?: string;
  booking_text?: string;
}

export interface Invoice {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'archived';
  data: InvoiceData;
  image_base64?: string;
  created_at: string;
  updated_at: string;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  archived_at?: string;
  gobd_hash?: string;
  search_text?: string;
  duplicate_warning?: boolean;
  duplicate_ids?: string[];
}

export interface Stats {
  counts: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    archived: number;
    pending_reminders: number;
  };
  amounts: {
    net: number;
    vat: number;
    gross: number;
  };
}

export interface AISettings {
  provider: string;
  api_key: string;
  model: string;
}

export interface Settings {
  id: string;
  ai_settings: AISettings;
  company_name: string;
  company_address: string;
  company_vat_id: string;
  company_iban: string;
  company_bic: string;
  default_kontenrahmen: string;
  updated_at: string;
}

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  invoice_id: string;
  action: string;
  actor: string;
  timestamp: string;
  details: Record<string, any>;
}

// NEW: User types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'accountant' | 'viewer';
  active: boolean;
  created_at: string;
  last_login?: string;
}

export interface UserCreate {
  email: string;
  password: string;
  name: string;
  role?: 'admin' | 'manager' | 'accountant' | 'viewer';
}

// NEW: Account types (Kontenrahmen)
export interface Account {
  id: string;
  number: string;
  name: string;
  category: string;
  kontenrahmen: string;
  active: boolean;
}

// NEW: Cost Center types
export interface CostCenter {
  id: string;
  number: string;
  name: string;
  description: string;
  active: boolean;
  created_at: string;
}

// NEW: Reminder types
export interface Reminder {
  id: string;
  invoice_id: string;
  reminder_type: 'approval_pending' | 'payment_due' | 'custom';
  message: string;
  due_date: string;
  sent: boolean;
  sent_at?: string;
  created_at: string;
}

export interface ReminderCreate {
  invoice_id: string;
  reminder_type: 'approval_pending' | 'payment_due' | 'custom';
  message: string;
  due_date: string;
}

export const apiService = {
  // Health
  async healthCheck() {
    const response = await api.get('/health');
    return response.data;
  },

  // Auth
  async login(email: string, password: string) {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  async register(user: UserCreate) {
    const response = await api.post('/auth/register', user);
    return response.data;
  },

  async getCurrentUser(): Promise<User> {
    const response = await api.get('/auth/me');
    return response.data;
  },

  // Users
  async getUsers(): Promise<User[]> {
    const response = await api.get('/users');
    return response.data;
  },

  async updateUser(id: string, update: Partial<User>): Promise<User> {
    const response = await api.put(`/users/${id}`, update);
    return response.data;
  },

  async deleteUser(id: string): Promise<void> {
    await api.delete(`/users/${id}`);
  },

  // Accounts (Kontenrahmen)
  async getAccounts(kontenrahmen: string = 'SKR03'): Promise<Account[]> {
    const response = await api.get('/accounts', { params: { kontenrahmen } });
    return response.data;
  },

  // Cost Centers
  async getCostCenters(includeInactive = false): Promise<CostCenter[]> {
    const response = await api.get('/cost-centers', { params: { include_inactive: includeInactive } });
    return response.data;
  },

  async createCostCenter(center: Partial<CostCenter>): Promise<CostCenter> {
    const response = await api.post('/cost-centers', center);
    return response.data;
  },

  async updateCostCenter(id: string, update: Partial<CostCenter>): Promise<CostCenter> {
    const response = await api.put(`/cost-centers/${id}`, update);
    return response.data;
  },

  async deleteCostCenter(id: string): Promise<void> {
    await api.delete(`/cost-centers/${id}`);
  },

  // Invoices
  async createInvoice(imageBase64: string): Promise<Invoice> {
    const response = await api.post('/invoices', { image_base64: imageBase64 });
    return response.data;
  },

  async getInvoices(status?: string): Promise<Invoice[]> {
    const params = status ? { status } : {};
    const response = await api.get('/invoices', { params });
    return response.data;
  },

  async getInvoice(id: string): Promise<Invoice> {
    const response = await api.get(`/invoices/${id}`);
    return response.data;
  },

  async updateInvoice(id: string, data: InvoiceData): Promise<Invoice> {
    const response = await api.put(`/invoices/${id}`, { data });
    return response.data;
  },

  async deleteInvoice(id: string): Promise<void> {
    await api.delete(`/invoices/${id}`);
  },

  async searchInvoices(query: string): Promise<Invoice[]> {
    const response = await api.get('/invoices/search', { params: { q: query } });
    return response.data;
  },

  // Approval Workflow
  async approveInvoice(id: string, approvedBy: string, comment?: string): Promise<Invoice> {
    const response = await api.post(`/invoices/${id}/approve`, {
      approved_by: approvedBy,
      comment,
    });
    return response.data;
  },

  async rejectInvoice(id: string, rejectedBy: string, reason: string): Promise<Invoice> {
    const response = await api.post(`/invoices/${id}/reject`, {
      rejected_by: rejectedBy,
      reason,
    });
    return response.data;
  },

  // Archive
  async archiveInvoice(id: string): Promise<Invoice> {
    const response = await api.post(`/invoices/${id}/archive`);
    return response.data;
  },

  async getArchivedInvoices(): Promise<Invoice[]> {
    const response = await api.get('/archive');
    return response.data;
  },

  async searchArchive(query: string): Promise<Invoice[]> {
    const response = await api.get('/archive/search', { params: { q: query } });
    return response.data;
  },

  // Reminders
  async getReminders(pendingOnly: boolean = true): Promise<Reminder[]> {
    const response = await api.get('/reminders', { params: { pending_only: pendingOnly } });
    return response.data;
  },

  async createReminder(reminder: ReminderCreate): Promise<Reminder> {
    const response = await api.post('/reminders', reminder);
    return response.data;
  },

  async sendReminder(id: string): Promise<void> {
    await api.post(`/reminders/${id}/send`);
  },

  async deleteReminder(id: string): Promise<void> {
    await api.delete(`/reminders/${id}`);
  },

  // Export
  async exportDatevAscii(): Promise<string> {
    const response = await api.get('/export/datev-ascii', {
      responseType: 'text',
    });
    return response.data;
  },

  async exportDatevXml(): Promise<string> {
    const response = await api.get('/export/datev-xml', {
      responseType: 'text',
    });
    return response.data;
  },

  async exportSepa(invoiceIds: string[]): Promise<string> {
    const response = await api.get('/export/sepa', {
      params: { invoice_ids: invoiceIds.join(',') },
      responseType: 'text',
    });
    return response.data;
  },

  async exportZugferd(id: string): Promise<string> {
    const response = await api.get(`/export/zugferd/${id}`, {
      responseType: 'text',
    });
    return response.data;
  },

  async exportXrechnung(id: string): Promise<string> {
    const response = await api.get(`/export/xrechnung/${id}`, {
      responseType: 'text',
    });
    return response.data;
  },

  // Statistics
  async getStats(): Promise<Stats> {
    const response = await api.get('/stats');
    return response.data;
  },

  // Settings
  async getSettings(): Promise<Settings> {
    const response = await api.get('/settings');
    return response.data;
  },

  async updateSettings(settings: Settings): Promise<Settings> {
    const response = await api.put('/settings', settings);
    return response.data;
  },

  // Webhooks
  async getWebhooks(): Promise<WebhookConfig[]> {
    const response = await api.get('/webhooks');
    return response.data;
  },

  async createWebhook(webhook: WebhookConfig): Promise<WebhookConfig> {
    const response = await api.post('/webhooks', webhook);
    return response.data;
  },

  async deleteWebhook(id: string): Promise<void> {
    await api.delete(`/webhooks/${id}`);
  },

  async testWebhook(id: string): Promise<void> {
    await api.post(`/webhooks/test/${id}`);
  },

  // Audit
  async getAuditLog(invoiceId: string): Promise<AuditLog[]> {
    const response = await api.get(`/audit/${invoiceId}`);
    return response.data;
  },

  // AI Models
  async getAIModels(): Promise<AIModel[]> {
    const response = await api.get('/ai-models');
    return response.data;
  },

  // DATEV Integration
  async getDatevConfig(): Promise<any> {
    const response = await api.get('/settings/datev');
    return response.data;
  },

  async updateDatevConfig(config: any): Promise<any> {
    const response = await api.put('/settings/datev', config);
    return response.data;
  },

  async testDatevConnection(): Promise<any> {
    const response = await api.post('/datev/test-connection');
    return response.data;
  },

  async uploadToDatev(invoiceId: string): Promise<any> {
    const response = await api.post(`/datev/upload/${invoiceId}`);
    return response.data;
  },

  async getDatevStatus(invoiceId: string): Promise<any> {
    const response = await api.get(`/datev/status/${invoiceId}`);
    return response.data;
  },

  // Banking / Payments
  async getBankingConfig(): Promise<any> {
    const response = await api.get('/settings/banking');
    return response.data;
  },

  async updateBankingConfig(config: any): Promise<any> {
    const response = await api.put('/settings/banking', config);
    return response.data;
  },

  async initiatePayment(invoiceId: string): Promise<any> {
    const response = await api.post(`/payments/initiate/${invoiceId}`);
    return response.data;
  },

  async getPaymentStatus(invoiceId: string): Promise<any> {
    const response = await api.get(`/payments/status/${invoiceId}`);
    return response.data;
  },

  async listPayments(): Promise<any[]> {
    const response = await api.get('/payments');
    return response.data;
  },
};

export interface AIModel {
  id: string;
  name: string;
  pricing_prompt: string;
  pricing_completion: string;
  context_length: number;
}

export default apiService;
