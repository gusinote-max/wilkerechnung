#!/usr/bin/env python3
"""
Backend API Testing for DATEV and Banking Integration
Tests the Candis-Kopie backend APIs for DATEV and Banking functionality
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://invoice-ocr-17.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@candis-kopie.de"
ADMIN_PASSWORD = "admin123"

class TestRunner:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.test_results = []
        
    def log_test(self, test_name, success, message, details=None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {message}")
        if details:
            print(f"   Details: {details}")
    
    def login(self):
        """Login and get auth token"""
        try:
            response = self.session.post(f"{BASE_URL}/auth/login", json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            })
            
            if response.status_code == 200:
                data = response.json()
                self.auth_token = data.get("token")
                self.session.headers.update({"Authorization": f"Bearer {self.auth_token}"})
                self.log_test("Login", True, "Successfully logged in as admin")
                return True
            else:
                self.log_test("Login", False, f"Login failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            self.log_test("Login", False, f"Login error: {str(e)}")
            return False
    
    def get_or_create_test_invoice(self):
        """Get existing invoice or create one for testing"""
        try:
            # Create a fresh test invoice for each test run
            test_invoice_data = {
                "data": {
                    "invoice_number": f"TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                    "invoice_date": "2024-01-15",
                    "due_date": "2024-02-15",
                    "vendor_name": "Test Supplier GmbH",
                    "vendor_address": "Teststraße 123, 12345 Berlin",
                    "vendor_vat_id": "DE123456789",
                    "vendor_iban": "DE89370400440532013000",
                    "vendor_bic": "COBADEFFXXX",
                    "buyer_name": "Meine Firma GmbH",
                    "buyer_address": "Firmenstraße 456, 54321 München",
                    "buyer_vat_id": "DE987654321",
                    "net_amount": 1000.00,
                    "vat_amount": 190.00,
                    "vat_rate": 19.0,
                    "gross_amount": 1190.00,
                    "currency": "EUR",
                    "line_items": [
                        {
                            "description": "Test Service",
                            "quantity": 1.0,
                            "unit_price": 1000.00,
                            "total": 1000.00,
                            "tax_rate": 19.0
                        }
                    ],
                    "payment_terms": "30 Tage netto",
                    "notes": "Test invoice for DATEV and Banking integration",
                    "booking_text": "Test Buchung"
                }
            }
            
            response = self.session.post(f"{BASE_URL}/invoices/manual", json=test_invoice_data)
            if response.status_code == 200:
                invoice = response.json()
                invoice_id = invoice["id"]
                self.log_test("Create Test Invoice", True, f"Created fresh test invoice: {invoice_id}")
                return invoice_id
            else:
                # Fallback to existing invoice if manual creation fails
                response = self.session.get(f"{BASE_URL}/invoices")
                if response.status_code == 200:
                    invoices = response.json()
                    if invoices:
                        invoice_id = invoices[0]["id"]
                        self.log_test("Get Test Invoice", True, f"Using existing invoice: {invoice_id}")
                        return invoice_id
                
                self.log_test("Create Test Invoice", False, f"Failed to create invoice: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            self.log_test("Get/Create Test Invoice", False, f"Error: {str(e)}")
            return None
    
    def test_datev_configuration(self):
        """Test DATEV configuration APIs"""
        print("\n=== Testing DATEV Configuration ===")
        
        # Reset DATEV config to defaults first
        try:
            reset_config = {
                "enabled": False,
                "simulation_mode": True,
                "berater_nr": "",
                "mandant_nr": ""
            }
            self.session.put(f"{BASE_URL}/settings/datev", json=reset_config)
        except:
            pass  # Ignore reset errors
        
        # Test 1: GET /api/settings/datev - expect default config
        try:
            response = self.session.get(f"{BASE_URL}/settings/datev")
            if response.status_code == 200:
                config = response.json()
                expected_defaults = {
                    "enabled": False,
                    "simulation_mode": True
                }
                
                success = all(config.get(key) == value for key, value in expected_defaults.items())
                if success:
                    self.log_test("DATEV Get Default Config", True, "Default configuration correct", config)
                else:
                    self.log_test("DATEV Get Default Config", False, "Default configuration incorrect", config)
            else:
                self.log_test("DATEV Get Default Config", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("DATEV Get Default Config", False, f"Error: {str(e)}")
        
        # Test 2: PUT /api/settings/datev - update configuration
        try:
            update_config = {
                "enabled": True,
                "simulation_mode": True,
                "berater_nr": "12345",
                "mandant_nr": "67890"
            }
            
            response = self.session.put(f"{BASE_URL}/settings/datev", json=update_config)
            if response.status_code == 200:
                self.log_test("DATEV Update Config", True, "Configuration updated successfully")
            else:
                self.log_test("DATEV Update Config", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("DATEV Update Config", False, f"Error: {str(e)}")
        
        # Test 3: GET /api/settings/datev - verify settings were saved
        try:
            response = self.session.get(f"{BASE_URL}/settings/datev")
            if response.status_code == 200:
                config = response.json()
                expected_values = {
                    "enabled": True,
                    "simulation_mode": True,
                    "berater_nr": "12345",
                    "mandant_nr": "67890"
                }
                
                success = all(config.get(key) == value for key, value in expected_values.items())
                if success:
                    self.log_test("DATEV Verify Config Save", True, "Settings were saved correctly", config)
                else:
                    self.log_test("DATEV Verify Config Save", False, "Settings not saved correctly", config)
            else:
                self.log_test("DATEV Verify Config Save", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("DATEV Verify Config Save", False, f"Error: {str(e)}")
    
    def test_datev_connection(self):
        """Test DATEV connection"""
        print("\n=== Testing DATEV Connection ===")
        
        try:
            response = self.session.post(f"{BASE_URL}/datev/test-connection")
            if response.status_code == 200:
                result = response.json()
                if result.get("success") and result.get("mode") == "simulation":
                    self.log_test("DATEV Test Connection", True, "Connection test successful in simulation mode", result)
                else:
                    self.log_test("DATEV Test Connection", False, "Unexpected connection test result", result)
            else:
                self.log_test("DATEV Test Connection", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("DATEV Test Connection", False, f"Error: {str(e)}")
    
    def test_datev_upload(self, invoice_id):
        """Test DATEV invoice upload"""
        print("\n=== Testing DATEV Invoice Upload ===")
        
        if not invoice_id:
            self.log_test("DATEV Upload", False, "No invoice ID available for testing")
            return
        
        # Test 1: Upload invoice to DATEV
        try:
            response = self.session.post(f"{BASE_URL}/datev/upload/{invoice_id}")
            if response.status_code == 200:
                result = response.json()
                if (result.get("success") and 
                    result.get("mode") == "simulation" and 
                    result.get("document_id", "").startswith("SIM-DATEV-")):
                    self.log_test("DATEV Upload Invoice", True, "Invoice uploaded successfully in simulation mode", result)
                    document_id = result.get("document_id")
                else:
                    self.log_test("DATEV Upload Invoice", False, "Unexpected upload result", result)
                    return
            else:
                self.log_test("DATEV Upload Invoice", False, f"HTTP {response.status_code}: {response.text}")
                return
        except Exception as e:
            self.log_test("DATEV Upload Invoice", False, f"Error: {str(e)}")
            return
        
        # Test 2: Check upload status
        try:
            response = self.session.get(f"{BASE_URL}/datev/status/{invoice_id}")
            if response.status_code == 200:
                status = response.json()
                if status.get("status") == "simulated":
                    self.log_test("DATEV Check Status", True, "Status correctly shows 'simulated'", status)
                else:
                    self.log_test("DATEV Check Status", False, "Unexpected status", status)
            else:
                self.log_test("DATEV Check Status", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("DATEV Check Status", False, f"Error: {str(e)}")
        
        # Test 3: Try to upload again (should fail)
        try:
            response = self.session.post(f"{BASE_URL}/datev/upload/{invoice_id}")
            if response.status_code == 400:
                self.log_test("DATEV Duplicate Upload", True, "Correctly rejected duplicate upload with 400 error")
            else:
                self.log_test("DATEV Duplicate Upload", False, f"Expected 400 error, got {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("DATEV Duplicate Upload", False, f"Error: {str(e)}")
    
    def test_banking_configuration(self):
        """Test Banking configuration APIs"""
        print("\n=== Testing Banking Configuration ===")
        
        # Test 1: GET /api/settings/banking - expect default config
        try:
            response = self.session.get(f"{BASE_URL}/settings/banking")
            if response.status_code == 200:
                config = response.json()
                self.log_test("Banking Get Default Config", True, "Retrieved default banking configuration", config)
            else:
                self.log_test("Banking Get Default Config", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Banking Get Default Config", False, f"Error: {str(e)}")
        
        # Test 2: PUT /api/settings/banking - update configuration
        try:
            update_config = {
                "enabled": True,
                "simulation_mode": True,
                "provider": "simulation",
                "company_iban": "DE89370400440532013000",
                "company_bic": "COBADEFFXXX"
            }
            
            response = self.session.put(f"{BASE_URL}/settings/banking", json=update_config)
            if response.status_code == 200:
                self.log_test("Banking Update Config", True, "Banking configuration updated successfully")
            else:
                self.log_test("Banking Update Config", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Banking Update Config", False, f"Error: {str(e)}")
        
        # Test 3: GET /api/settings/banking - verify settings were saved
        try:
            response = self.session.get(f"{BASE_URL}/settings/banking")
            if response.status_code == 200:
                config = response.json()
                expected_values = {
                    "enabled": True,
                    "simulation_mode": True,
                    "provider": "simulation",
                    "company_iban": "DE89370400440532013000",
                    "company_bic": "COBADEFFXXX"
                }
                
                success = all(config.get(key) == value for key, value in expected_values.items())
                if success:
                    self.log_test("Banking Verify Config Save", True, "Banking settings were saved correctly", config)
                else:
                    self.log_test("Banking Verify Config Save", False, "Banking settings not saved correctly", config)
            else:
                self.log_test("Banking Verify Config Save", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Banking Verify Config Save", False, f"Error: {str(e)}")
    
    def approve_invoice_for_payment(self, invoice_id):
        """Approve invoice so it can be paid"""
        try:
            # First check if invoice is already approved
            response = self.session.get(f"{BASE_URL}/invoices/{invoice_id}")
            if response.status_code == 200:
                invoice = response.json()
                if invoice.get("status") in ["approved", "archived"]:
                    self.log_test("Approve Invoice for Payment", True, f"Invoice already {invoice['status']} - ready for payment")
                    return True
            
            # Try to approve if not already approved
            response = self.session.post(f"{BASE_URL}/invoices/{invoice_id}/approve", json={
                "approved_by": "admin",
                "comment": "Approved for payment testing"
            })
            if response.status_code == 200:
                self.log_test("Approve Invoice for Payment", True, "Invoice approved successfully")
                return True
            else:
                self.log_test("Approve Invoice for Payment", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_test("Approve Invoice for Payment", False, f"Error: {str(e)}")
            return False
    
    def test_payment_initiation(self, invoice_id):
        """Test payment initiation"""
        print("\n=== Testing Payment Initiation ===")
        
        if not invoice_id:
            self.log_test("Payment Initiation", False, "No invoice ID available for testing")
            return
        
        # First approve the invoice
        if not self.approve_invoice_for_payment(invoice_id):
            return
        
        # Test 1: Initiate payment
        try:
            response = self.session.post(f"{BASE_URL}/payments/initiate/{invoice_id}")
            if response.status_code == 200:
                result = response.json()
                if (result.get("success") and 
                    result.get("mode") == "simulation" and 
                    result.get("transaction_id", "").startswith("SIM-PAY-")):
                    self.log_test("Payment Initiate", True, "Payment initiated successfully in simulation mode", result)
                    transaction_id = result.get("transaction_id")
                else:
                    self.log_test("Payment Initiate", False, "Unexpected payment initiation result", result)
                    return
            else:
                self.log_test("Payment Initiate", False, f"HTTP {response.status_code}: {response.text}")
                return
        except Exception as e:
            self.log_test("Payment Initiate", False, f"Error: {str(e)}")
            return
        
        # Test 2: Check payment status
        try:
            response = self.session.get(f"{BASE_URL}/payments/status/{invoice_id}")
            if response.status_code == 200:
                status = response.json()
                if status.get("status") == "simulated":
                    self.log_test("Payment Check Status", True, "Status correctly shows 'simulated'", status)
                else:
                    self.log_test("Payment Check Status", False, "Unexpected payment status", status)
            else:
                self.log_test("Payment Check Status", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Payment Check Status", False, f"Error: {str(e)}")
        
        # Test 3: Try to initiate payment again (should fail)
        try:
            response = self.session.post(f"{BASE_URL}/payments/initiate/{invoice_id}")
            if response.status_code == 400:
                self.log_test("Payment Duplicate Initiation", True, "Correctly rejected duplicate payment with 400 error")
            else:
                self.log_test("Payment Duplicate Initiation", False, f"Expected 400 error, got {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Payment Duplicate Initiation", False, f"Error: {str(e)}")
        
        # Test 4: List payments
        try:
            response = self.session.get(f"{BASE_URL}/payments")
            if response.status_code == 200:
                payments = response.json()
                if isinstance(payments, list):
                    self.log_test("Payment List", True, f"Retrieved payment list with {len(payments)} payments")
                else:
                    self.log_test("Payment List", False, "Payment list is not an array", payments)
            else:
                self.log_test("Payment List", False, f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Payment List", False, f"Error: {str(e)}")
    
    def run_all_tests(self):
        """Run all DATEV and Banking integration tests"""
        print("🚀 Starting DATEV and Banking Integration Tests")
        print(f"Backend URL: {BASE_URL}")
        print(f"Admin Credentials: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        print("=" * 60)
        
        # Login first
        if not self.login():
            print("❌ Cannot proceed without authentication")
            return False
        
        # Get or create test invoice
        invoice_id = self.get_or_create_test_invoice()
        
        # Run all test suites
        self.test_datev_configuration()
        self.test_datev_connection()
        self.test_datev_upload(invoice_id)
        self.test_banking_configuration()
        self.test_payment_initiation(invoice_id)
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['message']}")
        
        return failed_tests == 0

if __name__ == "__main__":
    runner = TestRunner()
    success = runner.run_all_tests()
    sys.exit(0 if success else 1)