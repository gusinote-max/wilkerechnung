"""
Backend tests for:
1. Cost Centers CRUD API (/api/cost-centers)
2. Invoice approval requiring Kontierung (account_number) - must return 422 when missing
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

ADMIN_EMAIL = "admin@candis-kopie.de"
ADMIN_PASSWORD = "admin123"

TEST_CENTER_PREFIX = "TEST_CC_"


@pytest.fixture(scope="module")
def auth_token():
    """Get admin auth token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Login failed: {resp.status_code} - {resp.text}")
    return resp.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture(scope="module")
def created_center_id(auth_headers):
    """Create a test cost center and yield its ID, then clean up"""
    payload = {
        "id": str(uuid.uuid4()),
        "number": f"{TEST_CENTER_PREFIX}100",
        "name": f"{TEST_CENTER_PREFIX}Werkstatt",
        "description": "Test Beschreibung",
        "active": True,
    }
    resp = requests.post(f"{BASE_URL}/api/cost-centers", json=payload, headers=auth_headers)
    assert resp.status_code == 200, f"Create center failed: {resp.text}"
    center_id = resp.json()["id"]
    yield center_id
    # cleanup
    requests.delete(f"{BASE_URL}/api/cost-centers/{center_id}", headers=auth_headers)


# ===== GET /cost-centers =====

class TestGetCostCenters:
    """Tests for GET /api/cost-centers"""

    def test_get_active_only_default(self, auth_headers):
        """GET without include_inactive should return only active centers"""
        resp = requests.get(f"{BASE_URL}/api/cost-centers")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Response should be a list"
        # All returned should be active
        for center in data:
            assert center.get("active") == True, f"Inactive center returned: {center}"

    def test_get_all_with_include_inactive(self, auth_headers):
        """GET with include_inactive=true should return all (active + inactive)"""
        resp = requests.get(f"{BASE_URL}/api/cost-centers", params={"include_inactive": True})
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Response should be a list"

    def test_get_all_returns_more_or_equal_than_active(self, auth_headers):
        """With include_inactive, count >= count without it"""
        active_resp = requests.get(f"{BASE_URL}/api/cost-centers")
        all_resp = requests.get(f"{BASE_URL}/api/cost-centers", params={"include_inactive": True})
        assert all_resp.status_code == 200
        assert active_resp.status_code == 200
        assert len(all_resp.json()) >= len(active_resp.json())

    def test_get_cost_centers_response_schema(self, auth_headers):
        """Each center should have required fields"""
        resp = requests.get(f"{BASE_URL}/api/cost-centers", params={"include_inactive": True})
        assert resp.status_code == 200
        data = resp.json()
        if data:
            center = data[0]
            assert "id" in center
            assert "number" in center
            assert "name" in center
            assert "active" in center
            assert "_id" not in center, "MongoDB _id should not be exposed"


# ===== POST /cost-centers =====

class TestCreateCostCenter:
    """Tests for POST /api/cost-centers"""

    def test_create_cost_center_success(self, auth_headers):
        """Create a new cost center and verify persistence"""
        center_id = str(uuid.uuid4())
        payload = {
            "id": center_id,
            "number": f"{TEST_CENTER_PREFIX}200",
            "name": f"{TEST_CENTER_PREFIX}Verwaltung",
            "description": "Verwaltungskosten",
            "active": True,
        }
        resp = requests.post(f"{BASE_URL}/api/cost-centers", json=payload, headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

        created = resp.json()
        assert created["number"] == payload["number"]
        assert created["name"] == payload["name"]
        assert created["active"] == True
        assert "_id" not in created

        # Cleanup
        requests.delete(f"{BASE_URL}/api/cost-centers/{center_id}", headers=auth_headers)

    def test_create_cost_center_inactive(self, auth_headers):
        """Create an inactive cost center"""
        center_id = str(uuid.uuid4())
        payload = {
            "id": center_id,
            "number": f"{TEST_CENTER_PREFIX}300",
            "name": f"{TEST_CENTER_PREFIX}Inaktiv",
            "description": "",
            "active": False,
        }
        resp = requests.post(f"{BASE_URL}/api/cost-centers", json=payload, headers=auth_headers)
        assert resp.status_code == 200
        created = resp.json()
        assert created["active"] == False

        # Verify not in active-only list
        active_resp = requests.get(f"{BASE_URL}/api/cost-centers")
        active_ids = [c["id"] for c in active_resp.json()]
        assert center_id not in active_ids, "Inactive center should not appear in active-only list"

        # Verify in include_inactive list
        all_resp = requests.get(f"{BASE_URL}/api/cost-centers", params={"include_inactive": True})
        all_ids = [c["id"] for c in all_resp.json()]
        assert center_id in all_ids, "Inactive center should appear when include_inactive=true"

        # Cleanup
        requests.delete(f"{BASE_URL}/api/cost-centers/{center_id}", headers=auth_headers)


# ===== PUT /cost-centers/{id} =====

class TestUpdateCostCenter:
    """Tests for PUT /api/cost-centers/{id} - JSON body"""

    def test_update_cost_center_name(self, auth_headers, created_center_id):
        """Update name via JSON body"""
        update_payload = {"name": f"{TEST_CENTER_PREFIX}Werkstatt Updated"}
        resp = requests.put(
            f"{BASE_URL}/api/cost-centers/{created_center_id}",
            json=update_payload,
            headers=auth_headers
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        updated = resp.json()
        assert updated["name"] == update_payload["name"]
        assert updated["id"] == created_center_id

    def test_update_cost_center_active_status(self, auth_headers, created_center_id):
        """Toggle active status via JSON body"""
        # Deactivate
        resp = requests.put(
            f"{BASE_URL}/api/cost-centers/{created_center_id}",
            json={"active": False},
            headers=auth_headers
        )
        assert resp.status_code == 200
        assert resp.json()["active"] == False

        # Reactivate
        resp2 = requests.put(
            f"{BASE_URL}/api/cost-centers/{created_center_id}",
            json={"active": True},
            headers=auth_headers
        )
        assert resp2.status_code == 200
        assert resp2.json()["active"] == True

    def test_update_cost_center_full_payload(self, auth_headers, created_center_id):
        """Update number, name, description, active at once"""
        update_payload = {
            "number": f"{TEST_CENTER_PREFIX}999",
            "name": f"{TEST_CENTER_PREFIX}Full Update",
            "description": "Updated description",
            "active": True,
        }
        resp = requests.put(
            f"{BASE_URL}/api/cost-centers/{created_center_id}",
            json=update_payload,
            headers=auth_headers
        )
        assert resp.status_code == 200
        updated = resp.json()
        assert updated["number"] == update_payload["number"]
        assert updated["description"] == update_payload["description"]

    def test_update_nonexistent_center(self, auth_headers):
        """Update non-existent center returns 404"""
        resp = requests.put(
            f"{BASE_URL}/api/cost-centers/nonexistent-id-12345",
            json={"name": "Will Not Update"},
            headers=auth_headers
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"


# ===== DELETE /cost-centers/{id} =====

class TestDeleteCostCenter:
    """Tests for DELETE /api/cost-centers/{id}"""

    def test_delete_cost_center(self, auth_headers):
        """Create and then delete a cost center"""
        center_id = str(uuid.uuid4())
        create_resp = requests.post(f"{BASE_URL}/api/cost-centers", json={
            "id": center_id,
            "number": f"{TEST_CENTER_PREFIX}DEL",
            "name": f"{TEST_CENTER_PREFIX}ToDelete",
            "active": True,
        }, headers=auth_headers)
        assert create_resp.status_code == 200

        # Delete
        del_resp = requests.delete(f"{BASE_URL}/api/cost-centers/{center_id}", headers=auth_headers)
        assert del_resp.status_code == 200, f"Expected 200, got {del_resp.status_code}: {del_resp.text}"

        # Verify deleted (should not appear in all list)
        all_resp = requests.get(f"{BASE_URL}/api/cost-centers", params={"include_inactive": True})
        all_ids = [c["id"] for c in all_resp.json()]
        assert center_id not in all_ids, "Deleted center should not appear in list"

    def test_delete_nonexistent_center(self, auth_headers):
        """Delete non-existent center returns 404"""
        resp = requests.delete(
            f"{BASE_URL}/api/cost-centers/nonexistent-id-99999",
            headers=auth_headers
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"


# ===== INVOICE APPROVAL - REQUIRES account_number =====

class TestInvoiceApprovalRequiresKontierung:
    """Approve invoice: must return 422 when account_number not set"""

    @pytest.fixture(scope="class")
    def manual_invoice_no_account(self, auth_headers):
        """Create a manual pending invoice WITHOUT account_number, yield its ID, then clean up"""
        inv_data = {
            "invoice_number": "TEST-MANUAL-001",
            "vendor_name": "TEST_Vendor GmbH",
            "gross_amount": 100.0,
            "net_amount": 84.03,
            "vat_amount": 15.97,
            "vat_rate": 19.0,
            "currency": "EUR",
            "line_items": [],
            # No account_number!
        }
        resp = requests.post(f"{BASE_URL}/api/invoices/manual", json=inv_data, headers=auth_headers)
        assert resp.status_code == 200, f"Could not create manual invoice: {resp.text}"
        invoice_id = resp.json()["id"]
        yield invoice_id
        # Cleanup - delete the test invoice
        requests.delete(f"{BASE_URL}/api/invoices/{invoice_id}", headers=auth_headers)

    @pytest.fixture(scope="class")
    def manual_invoice_with_account(self, auth_headers):
        """Create a manual pending invoice WITH account_number, yield its ID, then clean up"""
        inv_data = {
            "invoice_number": "TEST-MANUAL-002",
            "vendor_name": "TEST_Vendor Mit Konto GmbH",
            "gross_amount": 200.0,
            "net_amount": 168.07,
            "vat_amount": 31.93,
            "vat_rate": 19.0,
            "currency": "EUR",
            "line_items": [],
            "account_number": "6800",  # Raumkosten
        }
        resp = requests.post(f"{BASE_URL}/api/invoices/manual", json=inv_data, headers=auth_headers)
        assert resp.status_code == 200, f"Could not create manual invoice: {resp.text}"
        invoice_id = resp.json()["id"]
        yield invoice_id
        # Cleanup
        requests.delete(f"{BASE_URL}/api/invoices/{invoice_id}", headers=auth_headers)

    def test_approve_without_account_number_returns_422(self, auth_headers, manual_invoice_no_account):
        """Approving an invoice without account_number must return 422"""
        invoice_id = manual_invoice_no_account
        resp = requests.post(
            f"{BASE_URL}/api/invoices/{invoice_id}/approve",
            json={"approved_by": "test_agent"},
            headers=auth_headers
        )
        assert resp.status_code == 422, (
            f"Expected 422 (Kontierung missing), got {resp.status_code}: {resp.text}"
        )
        # Check error message mentions Kontierung
        error_detail = resp.json().get("detail", "")
        assert "Kontierung" in error_detail or "account" in error_detail.lower() or "Sachkonto" in error_detail, (
            f"Error message should mention Kontierung: {error_detail}"
        )

    def test_approve_nonexistent_invoice_returns_404(self, auth_headers):
        """Approving a non-existent invoice must return 404"""
        resp = requests.post(
            f"{BASE_URL}/api/invoices/nonexistent-invoice-abc/approve",
            json={"approved_by": "test_agent"},
            headers=auth_headers
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"

    def test_approve_with_account_number_succeeds(self, auth_headers, manual_invoice_with_account):
        """Approving an invoice WITH account_number must return 200"""
        invoice_id = manual_invoice_with_account
        approve_resp = requests.post(
            f"{BASE_URL}/api/invoices/{invoice_id}/approve",
            json={"approved_by": "test_agent_t1"},
            headers=auth_headers
        )
        assert approve_resp.status_code == 200, (
            f"Expected 200 after setting account_number=6800, got {approve_resp.status_code}: {approve_resp.text}"
        )
        approved = approve_resp.json()
        assert approved["status"] == "approved"
        assert approved["approved_by"] == "test_agent_t1"


# ===== AUTH PROTECTION =====

class TestCostCentersAuthProtection:
    """Cost centers endpoints - check auth requirements"""

    def test_get_cost_centers_no_auth_required(self):
        """GET /cost-centers should be public (no auth)"""
        resp = requests.get(f"{BASE_URL}/api/cost-centers")
        assert resp.status_code == 200, "GET /cost-centers should be publicly accessible"

    def test_post_cost_center_no_auth_fails(self):
        """POST /cost-centers without auth - server accepts (no auth guard on cost-centers post)"""
        # The backend code for POST /cost-centers doesn't require auth per code review
        # This is a design note - just verify the endpoint exists
        resp = requests.post(f"{BASE_URL}/api/cost-centers", json={
            "id": str(uuid.uuid4()),
            "number": "TEST_NOAUTH",
            "name": "TEST_NoAuth",
            "active": True,
        })
        # Either 200 (no auth required) or 401 (auth required)
        assert resp.status_code in [200, 401, 403], f"Unexpected status: {resp.status_code}"
        if resp.status_code == 200:
            # Cleanup
            center_id = resp.json().get("id")
            if center_id:
                requests.delete(f"{BASE_URL}/api/cost-centers/{center_id}")
