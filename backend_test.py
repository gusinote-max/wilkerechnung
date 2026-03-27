#!/usr/bin/env python3
"""
Comprehensive Backend API Test Suite for Candis-Kopie Invoice Management System
Tests all endpoints as specified in the review request
"""

import requests
import json
import sys
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

# Backend URL from frontend environment
BASE_URL = "https://invoice-ai-hub-5.preview.emergentagent.com/api"

class InvoiceAPITester:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        self.test_results = []
        self.created_invoice_id = None
        self.created_webhook_id = None
        
    def log_result(self, test_name: str, success: bool, message: str, details: Optional[Dict] = None):
        """Log test result"""
        result = {
            'test': test_name,
            'success': success,
            'message': message,
            'timestamp': datetime.now().isoformat()
        }
        if details:
            result['details'] = details
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    def test_health_check(self):
        """Test GET /api/health"""
        try:
            response = self.session.get(f"{self.base_url}/health")
            
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'healthy' and 'timestamp' in data:
                    self.log_result("Health Check", True, "Health endpoint working correctly", data)
                else:
                    self.log_result("Health Check", False, "Invalid health response format", data)
            else:
                self.log_result("Health Check", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("Health Check", False, f"Request failed: {str(e)}")
    
    def test_statistics(self):
        """Test GET /api/stats"""
        try:
            response = self.session.get(f"{self.base_url}/stats")
            
            if response.status_code == 200:
                data = response.json()
                required_keys = ['counts', 'amounts']
                if all(key in data for key in required_keys):
                    counts = data['counts']
                    amounts = data['amounts']
                    
                    # Check counts structure
                    count_keys = ['total', 'pending', 'approved', 'rejected', 'archived']
                    amount_keys = ['net', 'vat', 'gross']
                    
                    if all(key in counts for key in count_keys) and all(key in amounts for key in amount_keys):
                        self.log_result("Statistics API", True, "Statistics endpoint working correctly", data)
                    else:
                        self.log_result("Statistics API", False, "Missing required keys in response", data)
                else:
                    self.log_result("Statistics API", False, "Invalid statistics response format", data)
            else:
                self.log_result("Statistics API", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("Statistics API", False, f"Request failed: {str(e)}")
    
    def test_settings_get(self):
        """Test GET /api/settings"""
        try:
            response = self.session.get(f"{self.base_url}/settings")
            
            if response.status_code == 200:
                data = response.json()
                required_keys = ['id', 'ai_settings', 'company_name']
                if all(key in data for key in required_keys):
                    ai_settings = data['ai_settings']
                    if 'provider' in ai_settings and 'model' in ai_settings:
                        self.log_result("Settings GET", True, "Settings GET endpoint working correctly", 
                                      {"provider": ai_settings.get('provider'), "model": ai_settings.get('model')})
                        return data
                    else:
                        self.log_result("Settings GET", False, "Missing AI settings keys", data)
                else:
                    self.log_result("Settings GET", False, "Missing required settings keys", data)
            else:
                self.log_result("Settings GET", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("Settings GET", False, f"Request failed: {str(e)}")
        return None
    
    def test_settings_put(self):
        """Test PUT /api/settings"""
        try:
            # First get current settings
            current_settings = self.test_settings_get()
            if not current_settings:
                self.log_result("Settings PUT", False, "Cannot test PUT without current settings")
                return
            
            # Update company name for testing
            test_settings = current_settings.copy()
            test_settings['company_name'] = "Test Company GmbH - Updated"
            
            response = self.session.put(f"{self.base_url}/settings", json=test_settings)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('company_name') == "Test Company GmbH - Updated":
                    self.log_result("Settings PUT", True, "Settings PUT endpoint working correctly")
                else:
                    self.log_result("Settings PUT", False, "Settings not updated correctly", data)
            else:
                self.log_result("Settings PUT", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("Settings PUT", False, f"Request failed: {str(e)}")
    
    def test_create_manual_invoice(self):
        """Test POST /api/invoices/manual"""
        try:
            invoice_data = {
                "invoice_number": "TEST-001",
                "invoice_date": "2025-01-15",
                "vendor_name": "Test Vendor GmbH",
                "net_amount": 100.0,
                "vat_amount": 19.0,
                "vat_rate": 19.0,
                "gross_amount": 119.0,
                "currency": "EUR"
            }
            
            response = self.session.post(f"{self.base_url}/invoices/manual", json=invoice_data)
            
            if response.status_code == 200:
                data = response.json()
                if 'id' in data and data.get('status') == 'pending':
                    self.created_invoice_id = data['id']
                    self.log_result("Create Manual Invoice", True, f"Invoice created successfully with ID: {self.created_invoice_id}")
                    return data
                else:
                    self.log_result("Create Manual Invoice", False, "Invalid invoice response format", data)
            else:
                self.log_result("Create Manual Invoice", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("Create Manual Invoice", False, f"Request failed: {str(e)}")
        return None
    
    def test_get_invoices(self):
        """Test GET /api/invoices"""
        try:
            response = self.session.get(f"{self.base_url}/invoices")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("Get Invoices List", True, f"Retrieved {len(data)} invoices")
                    return data
                else:
                    self.log_result("Get Invoices List", False, "Response is not a list", {"type": type(data)})
            else:
                self.log_result("Get Invoices List", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("Get Invoices List", False, f"Request failed: {str(e)}")
        return None
    
    def test_get_single_invoice(self):
        """Test GET /api/invoices/{id}"""
        if not self.created_invoice_id:
            self.log_result("Get Single Invoice", False, "No invoice ID available for testing")
            return None
            
        try:
            response = self.session.get(f"{self.base_url}/invoices/{self.created_invoice_id}")
            
            if response.status_code == 200:
                data = response.json()
                if data.get('id') == self.created_invoice_id:
                    self.log_result("Get Single Invoice", True, "Single invoice retrieved successfully")
                    return data
                else:
                    self.log_result("Get Single Invoice", False, "Invoice ID mismatch", data)
            elif response.status_code == 404:
                self.log_result("Get Single Invoice", False, "Invoice not found", {"invoice_id": self.created_invoice_id})
            else:
                self.log_result("Get Single Invoice", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("Get Single Invoice", False, f"Request failed: {str(e)}")
        return None
    
    def test_update_invoice(self):
        """Test PUT /api/invoices/{id}"""
        if not self.created_invoice_id:
            self.log_result("Update Invoice", False, "No invoice ID available for testing")
            return
            
        try:
            update_data = {
                "data": {
                    "invoice_number": "TEST-001-UPDATED",
                    "invoice_date": "2025-01-15",
                    "vendor_name": "Test Vendor GmbH - Updated",
                    "net_amount": 150.0,
                    "vat_amount": 28.5,
                    "vat_rate": 19.0,
                    "gross_amount": 178.5,
                    "currency": "EUR"
                }
            }
            
            response = self.session.put(f"{self.base_url}/invoices/{self.created_invoice_id}", json=update_data)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('data', {}).get('vendor_name') == "Test Vendor GmbH - Updated":
                    self.log_result("Update Invoice", True, "Invoice updated successfully")
                else:
                    self.log_result("Update Invoice", False, "Invoice not updated correctly", data)
            else:
                self.log_result("Update Invoice", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("Update Invoice", False, f"Request failed: {str(e)}")
    
    def test_approve_invoice(self):
        """Test POST /api/invoices/{id}/approve"""
        if not self.created_invoice_id:
            self.log_result("Approve Invoice", False, "No invoice ID available for testing")
            return
            
        try:
            approval_data = {
                "approved_by": "Test Manager",
                "comment": "Approved for testing"
            }
            
            response = self.session.post(f"{self.base_url}/invoices/{self.created_invoice_id}/approve", json=approval_data)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'approved' and data.get('approved_by') == "Test Manager":
                    self.log_result("Approve Invoice", True, "Invoice approved successfully")
                else:
                    self.log_result("Approve Invoice", False, "Invoice approval not reflected correctly", data)
            else:
                self.log_result("Approve Invoice", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("Approve Invoice", False, f"Request failed: {str(e)}")
    
    def test_archive_invoice(self):
        """Test POST /api/invoices/{id}/archive"""
        if not self.created_invoice_id:
            self.log_result("Archive Invoice", False, "No invoice ID available for testing")
            return
            
        try:
            response = self.session.post(f"{self.base_url}/invoices/{self.created_invoice_id}/archive")
            
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'archived' and 'gobd_hash' in data:
                    self.log_result("Archive Invoice", True, f"Invoice archived successfully with GoBD hash: {data.get('gobd_hash')[:16]}...")
                else:
                    self.log_result("Archive Invoice", False, "Invoice archival not reflected correctly", data)
            else:
                self.log_result("Archive Invoice", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("Archive Invoice", False, f"Request failed: {str(e)}")
    
    def test_get_archive(self):
        """Test GET /api/archive"""
        try:
            response = self.session.get(f"{self.base_url}/archive")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("Get Archive", True, f"Retrieved {len(data)} archived invoices")
                else:
                    self.log_result("Get Archive", False, "Archive response is not a list", {"type": type(data)})
            else:
                self.log_result("Get Archive", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("Get Archive", False, f"Request failed: {str(e)}")
    
    def test_datev_exports(self):
        """Test DATEV export endpoints"""
        # Test DATEV ASCII export
        try:
            response = self.session.get(f"{self.base_url}/export/datev-ascii")
            
            if response.status_code == 200:
                if response.headers.get('content-type', '').startswith('text/csv'):
                    self.log_result("DATEV ASCII Export", True, "DATEV ASCII export working correctly")
                else:
                    self.log_result("DATEV ASCII Export", False, "Invalid content type for CSV export", 
                                  {"content_type": response.headers.get('content-type')})
            else:
                self.log_result("DATEV ASCII Export", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("DATEV ASCII Export", False, f"Request failed: {str(e)}")
        
        # Test DATEV XML export
        try:
            response = self.session.get(f"{self.base_url}/export/datev-xml")
            
            if response.status_code == 200:
                if response.headers.get('content-type', '').startswith('application/xml'):
                    self.log_result("DATEV XML Export", True, "DATEV XML export working correctly")
                else:
                    self.log_result("DATEV XML Export", False, "Invalid content type for XML export",
                                  {"content_type": response.headers.get('content-type')})
            else:
                self.log_result("DATEV XML Export", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("DATEV XML Export", False, f"Request failed: {str(e)}")
    
    def test_erechnung_exports(self):
        """Test E-Rechnung export endpoints"""
        if not self.created_invoice_id:
            self.log_result("ZUGFeRD Export", False, "No invoice ID available for testing")
            self.log_result("XRechnung Export", False, "No invoice ID available for testing")
            return
        
        # Test ZUGFeRD export
        try:
            response = self.session.get(f"{self.base_url}/export/zugferd/{self.created_invoice_id}")
            
            if response.status_code == 200:
                if response.headers.get('content-type', '').startswith('application/xml'):
                    self.log_result("ZUGFeRD Export", True, "ZUGFeRD export working correctly")
                else:
                    self.log_result("ZUGFeRD Export", False, "Invalid content type for ZUGFeRD export",
                                  {"content_type": response.headers.get('content-type')})
            else:
                self.log_result("ZUGFeRD Export", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("ZUGFeRD Export", False, f"Request failed: {str(e)}")
        
        # Test XRechnung export
        try:
            response = self.session.get(f"{self.base_url}/export/xrechnung/{self.created_invoice_id}")
            
            if response.status_code == 200:
                if response.headers.get('content-type', '').startswith('application/xml'):
                    self.log_result("XRechnung Export", True, "XRechnung export working correctly")
                else:
                    self.log_result("XRechnung Export", False, "Invalid content type for XRechnung export",
                                  {"content_type": response.headers.get('content-type')})
            else:
                self.log_result("XRechnung Export", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("XRechnung Export", False, f"Request failed: {str(e)}")
    
    def test_webhooks(self):
        """Test webhook endpoints"""
        # Test GET webhooks
        try:
            response = self.session.get(f"{self.base_url}/webhooks")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("Get Webhooks", True, f"Retrieved {len(data)} webhooks")
                else:
                    self.log_result("Get Webhooks", False, "Webhooks response is not a list", {"type": type(data)})
            else:
                self.log_result("Get Webhooks", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("Get Webhooks", False, f"Request failed: {str(e)}")
        
        # Test POST webhook
        try:
            webhook_data = {
                "name": "Test n8n Webhook",
                "url": "https://n8n.example.com/webhook/test",
                "events": ["invoice.created", "invoice.approved"],
                "active": True
            }
            
            response = self.session.post(f"{self.base_url}/webhooks", json=webhook_data)
            
            if response.status_code == 200:
                data = response.json()
                if 'id' in data and data.get('name') == "Test n8n Webhook":
                    self.created_webhook_id = data['id']
                    self.log_result("Create Webhook", True, f"Webhook created successfully with ID: {self.created_webhook_id}")
                else:
                    self.log_result("Create Webhook", False, "Invalid webhook response format", data)
            else:
                self.log_result("Create Webhook", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("Create Webhook", False, f"Request failed: {str(e)}")
        
        # Test DELETE webhook
        if self.created_webhook_id:
            try:
                response = self.session.delete(f"{self.base_url}/webhooks/{self.created_webhook_id}")
                
                if response.status_code == 200:
                    self.log_result("Delete Webhook", True, "Webhook deleted successfully")
                else:
                    self.log_result("Delete Webhook", False, f"HTTP {response.status_code}", {"response": response.text})
                    
            except Exception as e:
                self.log_result("Delete Webhook", False, f"Request failed: {str(e)}")
    
    def test_audit_log(self):
        """Test GET /api/audit/{invoice_id}"""
        if not self.created_invoice_id:
            self.log_result("Audit Log", False, "No invoice ID available for testing")
            return
            
        try:
            response = self.session.get(f"{self.base_url}/audit/{self.created_invoice_id}")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    # Should have audit entries for create, approve, archive
                    expected_actions = ['created', 'updated', 'approved', 'archived']
                    found_actions = [entry.get('action') for entry in data]
                    
                    if any(action in found_actions for action in expected_actions):
                        self.log_result("Audit Log", True, f"Audit log working correctly with {len(data)} entries")
                    else:
                        self.log_result("Audit Log", False, "No expected audit actions found", {"found_actions": found_actions})
                else:
                    self.log_result("Audit Log", False, "Audit log response is not a list", {"type": type(data)})
            else:
                self.log_result("Audit Log", False, f"HTTP {response.status_code}", {"response": response.text})
                
        except Exception as e:
            self.log_result("Audit Log", False, f"Request failed: {str(e)}")
    
    def test_reject_invoice_flow(self):
        """Test rejection workflow with a separate invoice"""
        try:
            # Create another invoice for rejection testing
            invoice_data = {
                "invoice_number": "TEST-REJECT-001",
                "invoice_date": "2025-01-15",
                "vendor_name": "Test Reject Vendor GmbH",
                "net_amount": 50.0,
                "vat_amount": 9.5,
                "vat_rate": 19.0,
                "gross_amount": 59.5,
                "currency": "EUR"
            }
            
            response = self.session.post(f"{self.base_url}/invoices/manual", json=invoice_data)
            
            if response.status_code == 200:
                reject_invoice_id = response.json().get('id')
                
                # Now reject it
                rejection_data = {
                    "rejected_by": "Test Manager",
                    "reason": "Missing documentation"
                }
                
                reject_response = self.session.post(f"{self.base_url}/invoices/{reject_invoice_id}/reject", json=rejection_data)
                
                if reject_response.status_code == 200:
                    data = reject_response.json()
                    if data.get('status') == 'rejected' and data.get('rejection_reason') == "Missing documentation":
                        self.log_result("Reject Invoice", True, "Invoice rejection workflow working correctly")
                    else:
                        self.log_result("Reject Invoice", False, "Invoice rejection not reflected correctly", data)
                else:
                    self.log_result("Reject Invoice", False, f"HTTP {reject_response.status_code}", {"response": reject_response.text})
            else:
                self.log_result("Reject Invoice", False, "Could not create invoice for rejection test")
                
        except Exception as e:
            self.log_result("Reject Invoice", False, f"Request failed: {str(e)}")
    
    def run_all_tests(self):
        """Run all API tests in the correct order"""
        print("🚀 Starting Candis-Kopie Backend API Tests")
        print("=" * 60)
        
        # Basic endpoints
        self.test_health_check()
        self.test_statistics()
        self.test_settings_get()
        self.test_settings_put()
        
        print("\n📋 Testing Invoice CRUD Operations")
        print("-" * 40)
        
        # Invoice CRUD flow
        self.test_create_manual_invoice()
        self.test_get_invoices()
        self.test_get_single_invoice()
        self.test_update_invoice()
        
        print("\n✅ Testing Approval Workflow")
        print("-" * 40)
        
        # Approval workflow
        self.test_approve_invoice()
        self.test_reject_invoice_flow()
        
        print("\n🗄️ Testing Archive Operations")
        print("-" * 40)
        
        # Archive operations
        self.test_archive_invoice()
        self.test_get_archive()
        
        print("\n📤 Testing Export Functions")
        print("-" * 40)
        
        # Export functions
        self.test_datev_exports()
        self.test_erechnung_exports()
        
        print("\n🔗 Testing Webhook Integration")
        print("-" * 40)
        
        # Webhook operations
        self.test_webhooks()
        
        print("\n📊 Testing Audit Log")
        print("-" * 40)
        
        # Audit log
        self.test_audit_log()
        
        # Summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result['success'])
        failed = len(self.test_results) - passed
        
        print(f"Total Tests: {len(self.test_results)}")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"Success Rate: {(passed/len(self.test_results)*100):.1f}%")
        
        if failed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  • {result['test']}: {result['message']}")
        
        print("\n" + "=" * 60)
        
        return passed, failed

def main():
    """Main test execution"""
    print("Candis-Kopie Backend API Test Suite")
    print(f"Testing against: {BASE_URL}")
    print()
    
    tester = InvoiceAPITester(BASE_URL)
    tester.run_all_tests()
    
    passed, failed = tester.print_summary()
    
    # Exit with appropriate code
    sys.exit(0 if failed == 0 else 1)

if __name__ == "__main__":
    main()