#!/usr/bin/env python3
"""
Specific Backend API Testing for Review Request
Tests the 3 scenarios requested:
1. Create new user (Admin creates a new user)
2. Delete invoice
3. Login with new user
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from frontend environment
BASE_URL = "https://invoice-ai-hub-5.preview.emergentagent.com/api"

# Test credentials from memory/test_credentials.md
ADMIN_EMAIL = "admin@candis-kopie.de"
ADMIN_PASSWORD = "admin123"

# Global variables for test data
admin_token = None
new_user_token = None
test_invoice_id = None

def log_test(test_name, success, details=""):
    """Log test results"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {test_name}")
    if details:
        print(f"   Details: {details}")
    if not success:
        print(f"   ERROR: {details}")

def make_request(method, endpoint, data=None, headers=None, params=None):
    """Make HTTP request with error handling"""
    url = f"{BASE_URL}{endpoint}"
    
    # Default headers
    default_headers = {"Content-Type": "application/json"}
    if headers:
        default_headers.update(headers)
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=default_headers, params=params, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, headers=default_headers, json=data, params=params, timeout=30)
        elif method.upper() == "PUT":
            response = requests.put(url, headers=default_headers, json=data, params=params, timeout=30)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=default_headers, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        print(f"DEBUG: {method} {url} -> Status: {response.status_code}")
        if response.status_code >= 400:
            try:
                error_detail = response.json()
                print(f"DEBUG: Error response: {error_detail}")
            except:
                print(f"DEBUG: Error response text: {response.text}")
        return response
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")
        return None

def test_scenario_1_create_user():
    """Test 1: Create new user (Admin creates a new user)"""
    global admin_token
    
    print("\n=== TEST 1: CREATE NEW USER (ADMIN CREATES USER) ===")
    
    # Step 1: Login as admin
    print("\nStep 1: Admin Login")
    admin_credentials = {
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    }
    
    response = make_request("POST", "/auth/login", admin_credentials)
    if response and response.status_code == 200:
        login_data = response.json()
        admin_token = login_data.get("token")
        user_info = login_data.get("user", {})
        log_test("Admin Login", True, f"Token received, User: {user_info.get('name', 'Unknown')}")
    else:
        error_msg = response.json().get("detail", "Unknown error") if response else "No response"
        log_test("Admin Login", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
        return False
    
    # Step 2: Create new user with manager role
    print("\nStep 2: Create New User")
    new_user_data = {
        "name": "Max Mustermann",
        "email": "max@test.de",
        "password": "test123",
        "role": "manager"
    }
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    response = make_request("POST", "/auth/register", new_user_data, headers=headers)
    if response and response.status_code == 200:
        user_data = response.json()
        user_role = user_data.get("role")
        log_test("Create User with Manager Role", True, f"Created user: {user_data.get('name')} with role: {user_role}")
        
        # Verify role is "manager"
        if user_role == "manager":
            log_test("Verify Manager Role", True, f"Role correctly set to: {user_role}")
        else:
            log_test("Verify Manager Role", False, f"Expected 'manager', got: {user_role}")
    else:
        error_msg = response.json().get("detail", "Unknown error") if response else "No response"
        log_test("Create User with Manager Role", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
        return False
    
    # Step 3: Verify user in user list
    print("\nStep 3: Verify User in List")
    response = make_request("GET", "/users", headers=headers)
    if response and response.status_code == 200:
        users = response.json()
        max_user = next((user for user in users if user.get("email") == "max@test.de"), None)
        if max_user:
            log_test("Verify User in List", True, f"Found user: {max_user.get('name')} ({max_user.get('email')})")
        else:
            log_test("Verify User in List", False, "New user not found in user list")
    else:
        error_msg = response.json().get("detail", "Unknown error") if response else "No response"
        log_test("Verify User in List", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    return True

def test_scenario_2_delete_invoice():
    """Test 2: Delete invoice"""
    global test_invoice_id
    
    print("\n=== TEST 2: DELETE INVOICE ===")
    
    if not admin_token:
        log_test("Delete Invoice Test", False, "No admin token available")
        return False
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # Step 1: Get invoices to find an invoice ID
    print("\nStep 1: Get Invoices")
    response = make_request("GET", "/invoices", headers=headers)
    if response and response.status_code == 200:
        invoices = response.json()
        log_test("Get Invoices", True, f"Retrieved {len(invoices)} invoices")
        
        if len(invoices) > 0:
            test_invoice_id = invoices[0].get("id")
            log_test("Found Invoice for Testing", True, f"Using invoice ID: {test_invoice_id}")
        else:
            # Create a test invoice first
            print("\nCreating test invoice for deletion test...")
            test_invoice_data = {
                "invoice_number": "TEST-DEL-001",
                "supplier_name": "Test Supplier",
                "amount": 100.00,
                "tax_amount": 19.00,
                "total_amount": 119.00,
                "invoice_date": "2024-01-15",
                "due_date": "2024-02-15",
                "description": "Test invoice for deletion"
            }
            
            response = make_request("POST", "/invoices/manual", test_invoice_data, headers=headers)
            if response and response.status_code == 200:
                invoice_data = response.json()
                test_invoice_id = invoice_data.get("id")
                log_test("Create Test Invoice", True, f"Created invoice ID: {test_invoice_id}")
            else:
                error_msg = response.json().get("detail", "Unknown error") if response else "No response"
                log_test("Create Test Invoice", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
                return False
    else:
        error_msg = response.json().get("detail", "Unknown error") if response else "No response"
        log_test("Get Invoices", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
        return False
    
    # Step 2: Delete the invoice
    print("\nStep 2: Delete Invoice")
    if test_invoice_id:
        response = make_request("DELETE", f"/invoices/{test_invoice_id}", headers=headers)
        if response and response.status_code == 200:
            result = response.json()
            log_test("Delete Invoice", True, f"Response: {result.get('message', 'Invoice deleted')}")
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            log_test("Delete Invoice", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
            return False
    else:
        log_test("Delete Invoice", False, "No invoice ID available for deletion")
        return False
    
    # Step 3: Verify deletion (should return 404)
    print("\nStep 3: Verify Deletion")
    response = make_request("GET", f"/invoices/{test_invoice_id}", headers=headers)
    if response is not None:
        if response.status_code == 404:
            log_test("Verify Invoice Deletion", True, "Invoice correctly not found (404)")
        else:
            log_test("Verify Invoice Deletion", False, f"Expected 404, got {response.status_code}")
    else:
        log_test("Verify Invoice Deletion", False, "No response received")
    
    return True

def test_scenario_3_login_new_user():
    """Test 3: Login with new user"""
    global new_user_token
    
    print("\n=== TEST 3: LOGIN WITH NEW USER ===")
    
    # Login with the new user credentials
    new_user_credentials = {
        "email": "max@test.de",
        "password": "test123"
    }
    
    response = make_request("POST", "/auth/login", new_user_credentials)
    if response and response.status_code == 200:
        login_data = response.json()
        new_user_token = login_data.get("token")
        user_info = login_data.get("user", {})
        user_role = user_info.get("role")
        
        log_test("New User Login", True, f"Token received, User: {user_info.get('name')} ({user_info.get('email')})")
        
        # Verify role is "manager"
        if user_role == "manager":
            log_test("Verify New User Role", True, f"Role correctly returned as: {user_role}")
        else:
            log_test("Verify New User Role", False, f"Expected 'manager', got: {user_role}")
    else:
        error_msg = response.json().get("detail", "Unknown error") if response else "No response"
        log_test("New User Login", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
        return False
    
    return True

def cleanup():
    """Clean up test data"""
    print("\n=== CLEANUP ===")
    
    if admin_token:
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Delete the test user
        response = make_request("GET", "/users", headers=headers)
        if response and response.status_code == 200:
            users = response.json()
            max_user = next((user for user in users if user.get("email") == "max@test.de"), None)
            if max_user:
                user_id = max_user.get("id")
                response = make_request("DELETE", f"/users/{user_id}", headers=headers)
                if response and response.status_code == 200:
                    log_test("Cleanup: Delete Test User", True, "Test user deleted successfully")
                else:
                    log_test("Cleanup: Delete Test User", False, "Failed to delete test user")

def main():
    """Run all review request tests"""
    print("=" * 60)
    print("CANDIS-KOPIE REVIEW REQUEST TESTING")
    print("=" * 60)
    print(f"Testing against: {BASE_URL}")
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    # Run the 3 test scenarios
    scenario1_success = test_scenario_1_create_user()
    scenario2_success = test_scenario_2_delete_invoice()
    scenario3_success = test_scenario_3_login_new_user()
    
    # Cleanup
    cleanup()
    
    # Summary
    print("\n" + "=" * 60)
    print("REVIEW REQUEST TESTING SUMMARY")
    print("=" * 60)
    
    total_tests = 3
    passed_tests = sum([scenario1_success, scenario2_success, scenario3_success])
    
    print(f"Total Scenarios: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {total_tests - passed_tests}")
    print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
    
    if passed_tests == total_tests:
        print("\n✅ ALL REVIEW REQUEST TESTS PASSED!")
    else:
        print(f"\n❌ {total_tests - passed_tests} TEST(S) FAILED")
    
    print("=" * 60)

if __name__ == "__main__":
    main()