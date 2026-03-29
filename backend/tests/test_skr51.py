"""
Backend tests for SKR51 Kontenrahmen feature
Tests: Auth, Accounts API (SKR51), Settings API (SKR51 selection)
"""
import pytest
import requests
import os
from pathlib import Path
from dotenv import load_dotenv

# Load env from frontend .env (EXPO_PUBLIC_BACKEND_URL)
load_dotenv(Path('/app/frontend/.env'))

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("EXPO_PUBLIC_BACKEND_URL not set")

ADMIN_EMAIL = "admin@candis-kopie.de"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin JWT token for authenticated requests"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=10
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    """Auth headers with JWT token"""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


class TestAuth:
    """Authentication tests"""

    def test_admin_login_success(self):
        """Login with admin@candis-kopie.de / admin123 works"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        token = data.get("token") or data.get("access_token")
        assert token, "Token missing from login response"
        user = data.get("user", {})
        assert user.get("role") == "admin", f"Expected admin role, got: {user.get('role')}"
        print(f"PASS: Admin login successful - role={user.get('role')}")

    def test_invalid_login_fails(self):
        """Invalid credentials return 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": "wrongpassword"},
            timeout=10
        )
        assert response.status_code in [401, 400], f"Expected 401/400, got {response.status_code}"
        print(f"PASS: Invalid login correctly rejected with {response.status_code}")


class TestSKR51Accounts:
    """SKR51 Kontenrahmen account tests"""

    def test_get_skr51_accounts_returns_200(self):
        """GET /api/accounts?kontenrahmen=SKR51 returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/accounts",
            params={"kontenrahmen": "SKR51"},
            timeout=15
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: GET /api/accounts?kontenrahmen=SKR51 returns 200")

    def test_skr51_accounts_count_is_203(self):
        """SKR51 returns exactly 203 accounts"""
        response = requests.get(
            f"{BASE_URL}/api/accounts",
            params={"kontenrahmen": "SKR51"},
            timeout=15
        )
        assert response.status_code == 200
        accounts = response.json()
        count = len(accounts)
        assert count == 203, f"Expected 203 SKR51 accounts, got {count}"
        print(f"PASS: SKR51 returns {count} accounts (expected 203)")

    def test_skr51_accounts_have_required_fields(self):
        """Each SKR51 account has number, name, category fields"""
        response = requests.get(
            f"{BASE_URL}/api/accounts",
            params={"kontenrahmen": "SKR51"},
            timeout=15
        )
        assert response.status_code == 200
        accounts = response.json()
        assert len(accounts) > 0, "No accounts returned"
        for acc in accounts[:5]:  # Check first 5
            assert "number" in acc, f"Missing 'number' field: {acc}"
            assert "name" in acc, f"Missing 'name' field: {acc}"
            assert "category" in acc, f"Missing 'category' field: {acc}"
            assert acc.get("kontenrahmen") == "SKR51", f"Wrong kontenrahmen: {acc.get('kontenrahmen')}"
        print("PASS: SKR51 accounts have required fields")

    def test_skr51_category_ertrage_ideeller_bereich(self):
        """SKR51 contains 'Erträge Ideeller Bereich' category"""
        response = requests.get(
            f"{BASE_URL}/api/accounts",
            params={"kontenrahmen": "SKR51"},
            timeout=15
        )
        assert response.status_code == 200
        accounts = response.json()
        categories = {acc.get("category") for acc in accounts}
        assert "Erträge Ideeller Bereich" in categories, f"'Erträge Ideeller Bereich' not found. Categories: {sorted(categories)}"
        print("PASS: Found category 'Erträge Ideeller Bereich'")

    def test_skr51_category_aufwand_satzungszweck(self):
        """SKR51 contains 'Aufwand Satzungszweck' category"""
        response = requests.get(
            f"{BASE_URL}/api/accounts",
            params={"kontenrahmen": "SKR51"},
            timeout=15
        )
        assert response.status_code == 200
        accounts = response.json()
        categories = {acc.get("category") for acc in accounts}
        assert "Aufwand Satzungszweck" in categories, f"'Aufwand Satzungszweck' not found. Categories: {sorted(categories)}"
        print("PASS: Found category 'Aufwand Satzungszweck'")

    def test_skr51_has_mitgliedsbeitraege(self):
        """SKR51 contains 'Mitgliedsbeiträge' accounts"""
        response = requests.get(
            f"{BASE_URL}/api/accounts",
            params={"kontenrahmen": "SKR51"},
            timeout=15
        )
        assert response.status_code == 200
        accounts = response.json()
        # Look for Mitgliedsbeiträge in names or categories
        mitglieds_accounts = [
            acc for acc in accounts
            if "Mitgliedsbeitr" in acc.get("name", "") or "Mitgliedsbeitr" in acc.get("category", "")
        ]
        assert len(mitglieds_accounts) > 0, "No 'Mitgliedsbeiträge' accounts found in SKR51"
        print(f"PASS: Found {len(mitglieds_accounts)} 'Mitgliedsbeiträge' account(s)")

    def test_skr51_has_spenden(self):
        """SKR51 contains 'Spenden' accounts"""
        response = requests.get(
            f"{BASE_URL}/api/accounts",
            params={"kontenrahmen": "SKR51"},
            timeout=15
        )
        assert response.status_code == 200
        accounts = response.json()
        spenden_accounts = [
            acc for acc in accounts
            if "Spenden" in acc.get("name", "") or "Spenden" in acc.get("category", "")
        ]
        assert len(spenden_accounts) > 0, "No 'Spenden' accounts found in SKR51"
        print(f"PASS: Found {len(spenden_accounts)} 'Spenden' account(s)")

    def test_skr51_no_mongodb_id_in_response(self):
        """SKR51 accounts response doesn't include MongoDB _id field"""
        response = requests.get(
            f"{BASE_URL}/api/accounts",
            params={"kontenrahmen": "SKR51"},
            timeout=15
        )
        assert response.status_code == 200
        accounts = response.json()
        for acc in accounts[:5]:
            assert "_id" not in acc, f"MongoDB _id leaked in response: {acc}"
        print("PASS: No MongoDB _id in response")

    def test_skr03_and_skr04_still_work(self):
        """Existing SKR03 and SKR04 endpoints still work"""
        for framework in ["SKR03", "SKR04"]:
            response = requests.get(
                f"{BASE_URL}/api/accounts",
                params={"kontenrahmen": framework},
                timeout=15
            )
            assert response.status_code == 200, f"{framework} failed: {response.status_code}"
            accounts = response.json()
            assert len(accounts) > 0, f"{framework} returned empty accounts"
            print(f"PASS: {framework} returns {len(accounts)} accounts")


class TestSettingsWithSKR51:
    """Settings API tests for SKR51 selection"""

    def test_get_current_settings(self, auth_headers):
        """GET /api/settings returns current settings"""
        response = requests.get(
            f"{BASE_URL}/api/settings",
            headers=auth_headers,
            timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "default_kontenrahmen" in data, f"'default_kontenrahmen' missing from settings: {data}"
        print(f"PASS: GET /api/settings returns 200. Current kontenrahmen: {data.get('default_kontenrahmen')}")

    def test_update_settings_with_skr51(self, auth_headers):
        """PUT /api/settings with SKR51 succeeds"""
        # First get current settings
        get_response = requests.get(
            f"{BASE_URL}/api/settings",
            headers=auth_headers,
            timeout=10
        )
        assert get_response.status_code == 200
        current_settings = get_response.json()

        # Update kontenrahmen to SKR51
        current_settings["default_kontenrahmen"] = "SKR51"
        # Ensure required nested fields are present
        if "ai_settings" not in current_settings:
            current_settings["ai_settings"] = {"provider": "openrouter", "api_key": "", "model": "openai/gpt-4o"}

        put_response = requests.put(
            f"{BASE_URL}/api/settings",
            headers=auth_headers,
            json=current_settings,
            timeout=10
        )
        assert put_response.status_code == 200, f"PUT /api/settings failed: {put_response.status_code}: {put_response.text}"
        updated = put_response.json()
        assert updated.get("default_kontenrahmen") == "SKR51", f"Expected SKR51, got: {updated.get('default_kontenrahmen')}"
        print("PASS: PUT /api/settings with SKR51 returns 200 and persists SKR51")

    def test_settings_persist_skr51_after_get(self, auth_headers):
        """After updating to SKR51, GET /api/settings returns SKR51"""
        # First ensure SKR51 is set (relies on test above running first)
        get_response = requests.get(
            f"{BASE_URL}/api/settings",
            headers=auth_headers,
            timeout=10
        )
        assert get_response.status_code == 200
        data = get_response.json()
        # The test above should have set SKR51, verify it persisted
        kontenrahmen = data.get("default_kontenrahmen")
        assert kontenrahmen == "SKR51", f"Expected SKR51 to be persisted, got: {kontenrahmen}"
        print(f"PASS: SKR51 setting persisted - GET returns {kontenrahmen}")

    def test_settings_without_auth_returns_200(self):
        """GET /api/settings should be accessible (used by frontend)"""
        response = requests.get(f"{BASE_URL}/api/settings", timeout=10)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: GET /api/settings accessible without auth")

    def test_put_settings_without_auth_returns_401(self):
        """PUT /api/settings without auth should return 401/403"""
        response = requests.put(
            f"{BASE_URL}/api/settings",
            json={"default_kontenrahmen": "SKR51", "id": "global_settings",
                  "ai_settings": {"provider": "openrouter", "api_key": "", "model": "openai/gpt-4o"}},
            timeout=10
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"PASS: PUT /api/settings without auth correctly rejected with {response.status_code}")

    def test_restore_settings_to_skr03(self, auth_headers):
        """Restore settings back to SKR03 after testing"""
        get_response = requests.get(
            f"{BASE_URL}/api/settings",
            headers=auth_headers,
            timeout=10
        )
        assert get_response.status_code == 200
        current_settings = get_response.json()
        current_settings["default_kontenrahmen"] = "SKR03"

        put_response = requests.put(
            f"{BASE_URL}/api/settings",
            headers=auth_headers,
            json=current_settings,
            timeout=10
        )
        assert put_response.status_code == 200
        print("PASS: Settings restored to SKR03")
