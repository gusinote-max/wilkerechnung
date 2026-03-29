#!/usr/bin/env python3
"""
RBAC Testing for Candis-Kopie Backend
Tests role-based access control for Admin, Accountant, and Viewer roles
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://invoice-ocr-17.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@candis-kopie.de"
ADMIN_PASSWORD = "admin123"

class RBACTestRunner:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
        self.accountant_token = None
        self.viewer_token = None
        self.test_results = []
        self.test_invoice_id = None
        
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
    
    def setup_users_and_tokens(self):
        """Setup: Login as Admin and create test users"""
        print("\n=== SETUP: Creating Users and Getting Tokens ===")
        
        # Step 1: Login as Admin
        try:
            response = requests.post(f"{BASE_URL}/auth/login", json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            })
            
            if response.status_code == 200:
                data = response.json()
                self.admin_token = data.get("token")
                self.log_test("Admin Login", True, "Successfully logged in as admin")
            else:
                self.log_test("Admin Login", False, f"Login failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            self.log_test("Admin Login", False, f"Login error: {str(e)}")
            return False
        
        # Step 2: Create Accountant user
        try:
            response = requests.post(f"{BASE_URL}/auth/register", 
                headers={"Authorization": f"Bearer {self.admin_token}"},
                json={
                    "name": "Buchhalter Test",
                    "email": "buchhalter@test.de",
                    "password": "test123",
                    "role": "accountant"
                })
            
            if response.status_code == 200:
                self.log_test("Create Accountant User", True, "Accountant user created successfully")
            else:
                # User might already exist, try to continue
                self.log_test("Create Accountant User", True, f"User creation response: {response.status_code} (might already exist)")
        except Exception as e:
            self.log_test("Create Accountant User", False, f"Error: {str(e)}")
            return False
        
        # Step 3: Login as Accountant
        try:
            response = requests.post(f"{BASE_URL}/auth/login", json={
                "email": "buchhalter@test.de",
                "password": "test123"
            })
            
            if response.status_code == 200:
                data = response.json()
                self.accountant_token = data.get("token")
                self.log_test("Accountant Login", True, "Successfully logged in as accountant")
            else:
                self.log_test("Accountant Login", False, f"Login failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            self.log_test("Accountant Login", False, f"Login error: {str(e)}")
            return False
        
        # Step 4: Create Viewer user
        try:
            response = requests.post(f"{BASE_URL}/auth/register", 
                headers={"Authorization": f"Bearer {self.admin_token}"},
                json={
                    "name": "Betrachter Test",
                    "email": "viewer@test.de",
                    "password": "test123",
                    "role": "viewer"
                })
            
            if response.status_code == 200:
                self.log_test("Create Viewer User", True, "Viewer user created successfully")
            else:
                # User might already exist, try to continue
                self.log_test("Create Viewer User", True, f"User creation response: {response.status_code} (might already exist)")
        except Exception as e:
            self.log_test("Create Viewer User", False, f"Error: {str(e)}")
            return False
        
        # Step 5: Login as Viewer
        try:
            response = requests.post(f"{BASE_URL}/auth/login", json={
                "email": "viewer@test.de",
                "password": "test123"
            })
            
            if response.status_code == 200:
                data = response.json()
                self.viewer_token = data.get("token")
                self.log_test("Viewer Login", True, "Successfully logged in as viewer")
            else:
                self.log_test("Viewer Login", False, f"Login failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            self.log_test("Viewer Login", False, f"Login error: {str(e)}")
            return False
        
        return True
    
    def get_test_invoice(self):
        """Get first available invoice for testing"""
        try:
            response = requests.get(f"{BASE_URL}/invoices", 
                headers={"Authorization": f"Bearer {self.accountant_token}"})
            
            if response.status_code == 200:
                invoices = response.json()
                if invoices:
                    self.test_invoice_id = invoices[0]["id"]
                    self.log_test("Get Test Invoice", True, f"Using invoice: {self.test_invoice_id}")
                    return True
                else:
                    # Create a test invoice if none exist
                    return self.create_test_invoice()
            else:
                self.log_test("Get Test Invoice", False, f"Failed to get invoices: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Get Test Invoice", False, f"Error: {str(e)}")
            return False
    
    def create_test_invoice(self):
        """Create a test invoice for RBAC testing"""
        try:
            test_invoice_data = {
                "data": {
                    "invoice_number": f"RBAC-TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                    "invoice_date": "2024-01-15",
                    "due_date": "2024-02-15",
                    "vendor_name": "RBAC Test Supplier GmbH",
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
                            "description": "RBAC Test Service",
                            "quantity": 1.0,
                            "unit_price": 1000.00,
                            "total": 1000.00,
                            "tax_rate": 19.0
                        }
                    ],
                    "payment_terms": "30 Tage netto",
                    "notes": "Test invoice for RBAC testing",
                    "booking_text": "RBAC Test Buchung"
                }
            }
            
            response = requests.post(f"{BASE_URL}/invoices/manual", 
                headers={"Authorization": f"Bearer {self.admin_token}"},
                json=test_invoice_data)
            
            if response.status_code == 200:
                invoice = response.json()
                self.test_invoice_id = invoice["id"]
                self.log_test("Create Test Invoice", True, f"Created test invoice: {self.test_invoice_id}")
                return True
            else:
                self.log_test("Create Test Invoice", False, f"Failed to create invoice: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            self.log_test("Create Test Invoice", False, f"Error: {str(e)}")
            return False
    
    def test_accountant_cannot_approve_invoices(self):
        """Test 1: Accountant CANNOT approve invoices"""
        print("\n=== Test 1: Accountant CANNOT approve invoices ===")
        
        if not self.test_invoice_id:
            self.log_test("Accountant Approve Test", False, "No test invoice available")
            return
        
        try:
            response = requests.post(f"{BASE_URL}/invoices/{self.test_invoice_id}/approve",
                headers={"Authorization": f"Bearer {self.accountant_token}"},
                json={
                    "approved_by": "buchhalter@test.de",
                    "comment": "Test approval attempt"
                })
            
            if response.status_code == 403:
                response_text = response.text
                if "Keine Berechtigung" in response_text:
                    self.log_test("Accountant Cannot Approve", True, "Correctly rejected with 403 'Keine Berechtigung'")
                else:
                    self.log_test("Accountant Cannot Approve", True, f"Correctly rejected with 403: {response_text}")
            else:
                self.log_test("Accountant Cannot Approve", False, f"Expected 403, got {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Accountant Cannot Approve", False, f"Error: {str(e)}")
    
    def test_accountant_cannot_delete_invoices(self):
        """Test 2: Accountant CANNOT delete invoices"""
        print("\n=== Test 2: Accountant CANNOT delete invoices ===")
        
        if not self.test_invoice_id:
            self.log_test("Accountant Delete Test", False, "No test invoice available")
            return
        
        try:
            response = requests.delete(f"{BASE_URL}/invoices/{self.test_invoice_id}",
                headers={"Authorization": f"Bearer {self.accountant_token}"})
            
            if response.status_code == 403:
                self.log_test("Accountant Cannot Delete", True, "Correctly rejected with 403")
            else:
                self.log_test("Accountant Cannot Delete", False, f"Expected 403, got {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Accountant Cannot Delete", False, f"Error: {str(e)}")
    
    def test_accountant_cannot_update_settings(self):
        """Test 3: Accountant CANNOT update settings"""
        print("\n=== Test 3: Accountant CANNOT update settings ===")
        
        try:
            test_settings = {
                "company_name": "Test Company",
                "company_address": "Test Address",
                "company_vat_id": "DE123456789",
                "ai_settings": {
                    "openrouter_api_key": "test-key",
                    "model": "gpt-4o",
                    "enabled": True
                }
            }
            
            response = requests.put(f"{BASE_URL}/settings",
                headers={"Authorization": f"Bearer {self.accountant_token}"},
                json=test_settings)
            
            if response.status_code == 403:
                self.log_test("Accountant Cannot Update Settings", True, "Correctly rejected with 403")
            else:
                self.log_test("Accountant Cannot Update Settings", False, f"Expected 403, got {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Accountant Cannot Update Settings", False, f"Error: {str(e)}")
    
    def test_accountant_can_initiate_payment(self):
        """Test 4: Accountant CAN initiate payment"""
        print("\n=== Test 4: Accountant CAN initiate payment ===")
        
        if not self.test_invoice_id:
            self.log_test("Accountant Payment Test", False, "No test invoice available")
            return
        
        # First, approve the invoice as admin so it can be paid
        try:
            response = requests.post(f"{BASE_URL}/invoices/{self.test_invoice_id}/approve",
                headers={"Authorization": f"Bearer {self.admin_token}"},
                json={
                    "approved_by": "admin@candis-kopie.de",
                    "comment": "Approved for payment testing"
                })
            
            if response.status_code == 200:
                self.log_test("Approve Invoice for Payment", True, "Invoice approved by admin")
            else:
                # Invoice might already be approved
                self.log_test("Approve Invoice for Payment", True, f"Invoice approval status: {response.status_code}")
        except Exception as e:
            self.log_test("Approve Invoice for Payment", False, f"Error: {str(e)}")
        
        # Now test payment initiation as accountant
        try:
            response = requests.post(f"{BASE_URL}/payments/initiate/{self.test_invoice_id}",
                headers={"Authorization": f"Bearer {self.accountant_token}"})
            
            if response.status_code == 200:
                result = response.json()
                self.log_test("Accountant Can Initiate Payment", True, "Payment initiated successfully", result)
            elif response.status_code == 400:
                # Payment might already be initiated or invoice not in correct state
                response_text = response.text
                if "bereits" in response_text.lower() or "already" in response_text.lower():
                    self.log_test("Accountant Can Initiate Payment", True, f"Payment already initiated (400 is expected): {response_text}")
                else:
                    self.log_test("Accountant Can Initiate Payment", False, f"Unexpected 400 error: {response_text}")
            else:
                self.log_test("Accountant Can Initiate Payment", False, f"Expected 200 or 400, got {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Accountant Can Initiate Payment", False, f"Error: {str(e)}")
    
    def test_viewer_can_only_view(self):
        """Test 5: Viewer CANNOT do anything except view"""
        print("\n=== Test 5: Viewer can only view, cannot perform actions ===")
        
        # Test 5a: Viewer CAN view invoices
        try:
            response = requests.get(f"{BASE_URL}/invoices",
                headers={"Authorization": f"Bearer {self.viewer_token}"})
            
            if response.status_code == 200:
                invoices = response.json()
                self.log_test("Viewer Can View Invoices", True, f"Successfully retrieved {len(invoices)} invoices")
            else:
                self.log_test("Viewer Can View Invoices", False, f"Expected 200, got {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Viewer Can View Invoices", False, f"Error: {str(e)}")
        
        if not self.test_invoice_id:
            return
        
        # Test 5b: Viewer CANNOT approve invoices
        try:
            response = requests.post(f"{BASE_URL}/invoices/{self.test_invoice_id}/approve",
                headers={"Authorization": f"Bearer {self.viewer_token}"},
                json={
                    "approved_by": "viewer@test.de",
                    "comment": "Test approval attempt"
                })
            
            if response.status_code == 403:
                self.log_test("Viewer Cannot Approve", True, "Correctly rejected with 403")
            else:
                self.log_test("Viewer Cannot Approve", False, f"Expected 403, got {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Viewer Cannot Approve", False, f"Error: {str(e)}")
        
        # Test 5c: Viewer CANNOT delete invoices
        try:
            response = requests.delete(f"{BASE_URL}/invoices/{self.test_invoice_id}",
                headers={"Authorization": f"Bearer {self.viewer_token}"})
            
            if response.status_code == 403:
                self.log_test("Viewer Cannot Delete", True, "Correctly rejected with 403")
            else:
                self.log_test("Viewer Cannot Delete", False, f"Expected 403, got {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Viewer Cannot Delete", False, f"Error: {str(e)}")
        
        # Test 5d: Viewer CANNOT initiate payments
        try:
            response = requests.post(f"{BASE_URL}/payments/initiate/{self.test_invoice_id}",
                headers={"Authorization": f"Bearer {self.viewer_token}"})
            
            if response.status_code == 403:
                self.log_test("Viewer Cannot Initiate Payment", True, "Correctly rejected with 403")
            else:
                self.log_test("Viewer Cannot Initiate Payment", False, f"Expected 403, got {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Viewer Cannot Initiate Payment", False, f"Error: {str(e)}")
    
    def test_admin_can_do_everything(self):
        """Test 6: Admin CAN do everything"""
        print("\n=== Test 6: Admin can do everything ===")
        
        if not self.test_invoice_id:
            self.log_test("Admin Test", False, "No test invoice available")
            return
        
        # Test 6a: Admin CAN update settings
        try:
            test_settings = {
                "company_name": "Admin Test Company",
                "company_address": "Admin Test Address",
                "company_vat_id": "DE123456789",
                "ai_settings": {
                    "openrouter_api_key": "admin-test-key",
                    "model": "gpt-4o",
                    "enabled": True
                }
            }
            
            response = requests.put(f"{BASE_URL}/settings",
                headers={"Authorization": f"Bearer {self.admin_token}"},
                json=test_settings)
            
            if response.status_code == 200:
                self.log_test("Admin Can Update Settings", True, "Settings updated successfully")
            else:
                self.log_test("Admin Can Update Settings", False, f"Expected 200, got {response.status_code}: {response.text}")
        except Exception as e:
            self.log_test("Admin Can Update Settings", False, f"Error: {str(e)}")
        
        # Test 6b: Admin CAN delete invoices (but we'll create a new one first)
        try:
            # Create a new invoice specifically for deletion test
            delete_test_invoice_data = {
                "data": {
                    "invoice_number": f"DELETE-TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                    "invoice_date": "2024-01-15",
                    "due_date": "2024-02-15",
                    "vendor_name": "Delete Test Supplier",
                    "vendor_address": "Delete Test Address",
                    "net_amount": 100.00,
                    "vat_amount": 19.00,
                    "vat_rate": 19.0,
                    "gross_amount": 119.00,
                    "currency": "EUR",
                    "line_items": [
                        {
                            "description": "Delete Test Item",
                            "quantity": 1.0,
                            "unit_price": 100.00,
                            "total": 100.00,
                            "tax_rate": 19.0
                        }
                    ]
                }
            }
            
            response = requests.post(f"{BASE_URL}/invoices/manual", 
                headers={"Authorization": f"Bearer {self.admin_token}"},
                json=delete_test_invoice_data)
            
            if response.status_code == 200:
                delete_invoice = response.json()
                delete_invoice_id = delete_invoice["id"]
                
                # Now delete it
                response = requests.delete(f"{BASE_URL}/invoices/{delete_invoice_id}",
                    headers={"Authorization": f"Bearer {self.admin_token}"})
                
                if response.status_code == 200:
                    self.log_test("Admin Can Delete Invoice", True, "Invoice deleted successfully")
                else:
                    self.log_test("Admin Can Delete Invoice", False, f"Expected 200, got {response.status_code}: {response.text}")
            else:
                self.log_test("Admin Can Delete Invoice", False, f"Failed to create test invoice for deletion: {response.status_code}")
        except Exception as e:
            self.log_test("Admin Can Delete Invoice", False, f"Error: {str(e)}")
    
    def run_all_tests(self):
        """Run all RBAC tests"""
        print("🚀 Starting RBAC Tests for Candis-Kopie")
        print(f"Backend URL: {BASE_URL}")
        print(f"Admin Credentials: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        print("=" * 60)
        
        # Setup users and tokens
        if not self.setup_users_and_tokens():
            print("❌ Cannot proceed without proper authentication setup")
            return False
        
        # Get test invoice
        if not self.get_test_invoice():
            print("❌ Cannot proceed without test invoice")
            return False
        
        # Run all RBAC tests
        self.test_accountant_cannot_approve_invoices()
        self.test_accountant_cannot_delete_invoices()
        self.test_accountant_cannot_update_settings()
        self.test_accountant_can_initiate_payment()
        self.test_viewer_can_only_view()
        self.test_admin_can_do_everything()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 RBAC TEST SUMMARY")
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
    runner = RBACTestRunner()
    success = runner.run_all_tests()
    sys.exit(0 if success else 1)