import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
}

export interface Stats {
  counts: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    archived: number;
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

export const apiService = {
  // Health
  async healthCheck() {
    const response = await api.get('/health');
    return response.data;
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
};

export default apiService;
