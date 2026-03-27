#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Candis-Kopie Invoice Management
Tests the 4 new endpoint groups: Auth, User Management, Workflow, Email Settings
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
auth_token = None
test_user_id = None
test_workflow_id = None

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
        return response
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")
        return None

def test_auth_api():
    """Test Authentication API endpoints"""
    global auth_token, test_user_id
    
    print("\n=== TESTING AUTH API ===")
    
    # 1. Test user registration
    test_user_data = {
        "email": "test@test.de",
        "password": "test123",
        "name": "Test User"
    }
    
    response = make_request("POST", "/auth/register", test_user_data)
    if response and response.status_code == 200:
        user_data = response.json()
        test_user_id = user_data.get("id")
        log_test("User Registration", True, f"Created user with ID: {test_user_id}")
    else:
        error_msg = response.json().get("detail", "Unknown error") if response else "No response"
        log_test("User Registration", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # 2. Test duplicate email registration (should fail)
    response = make_request("POST", "/auth/register", test_user_data)
    if response and response.status_code == 400:
        log_test("Duplicate Email Registration (Error Case)", True, "Correctly rejected duplicate email")
    else:
        log_test("Duplicate Email Registration (Error Case)", False, f"Expected 400, got {response.status_code if response else 'None'}")
    
    # 3. Test admin login
    admin_credentials = {
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    }
    
    response = make_request("POST", "/auth/login", admin_credentials)
    if response and response.status_code == 200:
        login_data = response.json()
        auth_token = login_data.get("token")
        user_info = login_data.get("user", {})
        log_test("Admin Login", True, f"Token received, User: {user_info.get('name', 'Unknown')}")
    else:
        error_msg = response.json().get("detail", "Unknown error") if response else "No response"
        log_test("Admin Login", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
        return False
    
    # 4. Test wrong password login (should fail)
    wrong_credentials = {
        "email": ADMIN_EMAIL,
        "password": "wrongpassword"
    }
    
    response = make_request("POST", "/auth/login", wrong_credentials)
    if response and response.status_code == 401:
        log_test("Wrong Password Login (Error Case)", True, "Correctly rejected wrong password")
    else:
        log_test("Wrong Password Login (Error Case)", False, f"Expected 401, got {response.status_code if response else 'None'}")
    
    # 5. Test get current user info (requires auth token)
    if auth_token:
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = make_request("GET", "/auth/me", headers=headers)
        if response and response.status_code == 200:
            user_data = response.json()
            log_test("Get Current User Info", True, f"User: {user_data.get('name')} ({user_data.get('email')})")
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            log_test("Get Current User Info", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    else:
        log_test("Get Current User Info", False, "No auth token available")
    
    return auth_token is not None

def test_user_management_api():
    """Test User Management API endpoints"""
    global test_user_id
    
    print("\n=== TESTING USER MANAGEMENT API ===")
    
    if not auth_token:
        log_test("User Management Tests", False, "No auth token available")
        return
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    # 1. Test get all users
    response = make_request("GET", "/users", headers=headers)
    if response and response.status_code == 200:
        users = response.json()
        log_test("Get All Users", True, f"Retrieved {len(users)} users")
    else:
        error_msg = response.json().get("detail", "Unknown error") if response else "No response"
        log_test("Get All Users", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # 2. Test get user by ID (use test user ID if available)
    if test_user_id:
        response = make_request("GET", f"/users/{test_user_id}", headers=headers)
        if response and response.status_code == 200:
            user_data = response.json()
            log_test("Get User by ID", True, f"Retrieved user: {user_data.get('name')}")
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            log_test("Get User by ID", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    else:
        log_test("Get User by ID", False, "No test user ID available")
    
    # 3. Test update user
    if test_user_id:
        update_data = {"name": "Updated Test User"}
        response = make_request("PUT", f"/users/{test_user_id}", update_data, headers=headers)
        if response and response.status_code == 200:
            updated_user = response.json()
            log_test("Update User", True, f"Updated name to: {updated_user.get('name')}")
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            log_test("Update User", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    else:
        log_test("Update User", False, "No test user ID available")
    
    # 4. Test delete user (cleanup)
    if test_user_id:
        response = make_request("DELETE", f"/users/{test_user_id}", headers=headers)
        if response and response.status_code == 200:
            log_test("Delete User", True, "Test user deleted successfully")
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            log_test("Delete User", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")

def test_workflow_api():
    """Test Workflow API endpoints"""
    global test_workflow_id
    
    print("\n=== TESTING WORKFLOW API ===")
    
    if not auth_token:
        log_test("Workflow Tests", False, "No auth token available")
        return
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    # 1. Test get all workflows (should be empty initially)
    response = make_request("GET", "/workflows", headers=headers)
    if response and response.status_code == 200:
        workflows = response.json()
        log_test("Get All Workflows", True, f"Retrieved {len(workflows)} workflows")
    else:
        error_msg = response.json().get("detail", "Unknown error") if response else "No response"
        log_test("Get All Workflows", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # 2. Test create workflow
    workflow_data = {
        "name": "Test Workflow",
        "stages": [
            {"stage_name": "Manager", "required_role": "manager"},
            {"stage_name": "Accounting", "required_role": "accountant"}
        ],
        "min_amount": 100,
        "max_amount": 5000
    }
    
    response = make_request("POST", "/workflows", workflow_data, headers=headers)
    if response and response.status_code == 200:
        workflow = response.json()
        test_workflow_id = workflow.get("id")
        log_test("Create Workflow", True, f"Created workflow with ID: {test_workflow_id}")
    else:
        error_msg = response.json().get("detail", "Unknown error") if response else "No response"
        log_test("Create Workflow", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # 3. Test get workflows again (should have 1 now)
    response = make_request("GET", "/workflows", headers=headers)
    if response and response.status_code == 200:
        workflows = response.json()
        log_test("Get Workflows After Creation", True, f"Retrieved {len(workflows)} workflows")
    else:
        error_msg = response.json().get("detail", "Unknown error") if response else "No response"
        log_test("Get Workflows After Creation", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # 4. Test delete workflow (cleanup)
    if test_workflow_id:
        response = make_request("DELETE", f"/workflows/{test_workflow_id}", headers=headers)
        if response and response.status_code == 200:
            log_test("Delete Workflow", True, "Test workflow deleted successfully")
        else:
            error_msg = response.json().get("detail", "Unknown error") if response else "No response"
            log_test("Delete Workflow", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    else:
        log_test("Delete Workflow", False, "No test workflow ID available")

def test_email_settings_api():
    """Test Email Settings API endpoints"""
    
    print("\n=== TESTING EMAIL SETTINGS API ===")
    
    if not auth_token:
        log_test("Email Settings Tests", False, "No auth token available")
        return
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    # 1. Test get email settings (should return defaults)
    response = make_request("GET", "/email-settings", headers=headers)
    if response and response.status_code == 200:
        settings = response.json()
        log_test("Get Email Settings", True, f"SMTP Host: {settings.get('smtp_host', 'empty')}, Enabled: {settings.get('enabled', False)}")
    else:
        error_msg = response.json().get("detail", "Unknown error") if response else "No response"
        log_test("Get Email Settings", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # 2. Test update email settings (using query parameters)
    params = {
        "smtp_host": "smtp.test.de",
        "smtp_port": 587,
        "smtp_user": "test@test.de",
        "from_email": "noreply@test.de",
        "from_name": "TestApp",
        "enabled": False
    }
    
    response = make_request("PUT", "/email-settings", headers=headers, params=params)
    if response and response.status_code == 200:
        result = response.json()
        log_test("Update Email Settings", True, f"Message: {result.get('message')}")
    else:
        error_msg = response.json().get("detail", "Unknown error") if response else "No response"
        log_test("Update Email Settings", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # 3. Test get email settings again (should show updated values)
    response = make_request("GET", "/email-settings", headers=headers)
    if response and response.status_code == 200:
        settings = response.json()
        log_test("Get Updated Email Settings", True, f"SMTP Host: {settings.get('smtp_host')}, User: {settings.get('smtp_user')}")
    else:
        error_msg = response.json().get("detail", "Unknown error") if response else "No response"
        log_test("Get Updated Email Settings", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # 4. Test get email notifications
    response = make_request("GET", "/email-notifications", headers=headers)
    if response and response.status_code == 200:
        notifications = response.json()
        log_test("Get Email Notifications", True, f"Retrieved {len(notifications)} notifications")
    else:
        error_msg = response.json().get("detail", "Unknown error") if response else "No response"
        log_test("Get Email Notifications", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")

def main():
    """Run all backend API tests"""
    print("=" * 60)
    print("CANDIS-KOPIE BACKEND API TESTING")
    print("=" * 60)
    print(f"Testing against: {BASE_URL}")
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    # Test all endpoint groups
    auth_success = test_auth_api()
    
    if auth_success:
        test_user_management_api()
        test_workflow_api()
        test_email_settings_api()
    else:
        print("\n❌ CRITICAL: Auth tests failed - skipping other tests that require authentication")
    
    print("\n" + "=" * 60)
    print("BACKEND API TESTING COMPLETE")
    print("=" * 60)

if __name__ == "__main__":
    main()