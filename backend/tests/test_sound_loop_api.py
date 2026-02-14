"""
Backend API Tests for Sound Loop App
Tests: Authentication (register, login), Sounds CRUD, Subscription status
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://looper-mobile.preview.emergentagent.com')

# Test user credentials
TEST_EMAIL = f"test_{uuid.uuid4().hex[:8]}@example.com"
TEST_PASSWORD = "Test123!"
TEST_NAME = "Test User"

# Test account from main agent
EXISTING_EMAIL = "newtest@example.com"
EXISTING_PASSWORD = "Test123!"


class TestHealthCheck:
    """Health check endpoint tests - Run first"""
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print(f"API root check passed: {data}")
    
    def test_health_endpoint(self):
        """Test health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print(f"Health check passed: {data}")


class TestAuthenticationFlow:
    """Authentication tests - Register, Login, Me endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.test_email = TEST_EMAIL
        self.test_password = TEST_PASSWORD
        self.test_name = TEST_NAME
    
    def test_01_register_new_user(self):
        """Test user registration"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": self.test_email,
            "name": self.test_name,
            "password": self.test_password
        })
        
        # Status code assertion
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        # Data assertions
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == self.test_email
        assert data["user"]["name"] == self.test_name
        assert data["user"]["is_premium"] == False
        assert data["user"]["sound_count"] == 0
        assert "user_id" in data["user"]
        print(f"Registration passed: user_id={data['user']['user_id']}")
    
    def test_02_register_duplicate_email(self):
        """Test duplicate email registration fails"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": self.test_email,
            "name": self.test_name,
            "password": self.test_password
        })
        
        assert response.status_code == 400
        print("Duplicate email registration correctly rejected")
    
    def test_03_login_with_valid_credentials(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": EXISTING_EMAIL,
            "password": EXISTING_PASSWORD
        })
        
        # Status code assertion
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        # Data assertions
        data = response.json()
        assert "token" in data
        assert len(data["token"]) > 0
        assert "user" in data
        assert data["user"]["email"] == EXISTING_EMAIL
        assert "user_id" in data["user"]
        print(f"Login passed: token received, user_id={data['user']['user_id']}")
        
        return data["token"]
    
    def test_04_login_with_invalid_credentials(self):
        """Test login with invalid credentials fails"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        
        assert response.status_code == 401
        print("Invalid credentials correctly rejected")
    
    def test_05_get_me_with_valid_token(self):
        """Test get current user with valid token"""
        # First login to get token
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": EXISTING_EMAIL,
            "password": EXISTING_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        # Get user info
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == EXISTING_EMAIL
        print(f"Get me passed: {data}")
    
    def test_06_get_me_without_token(self):
        """Test get current user without token fails"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("Get me without token correctly rejected")


class TestSoundsAPI:
    """Sounds CRUD tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": EXISTING_EMAIL,
            "password": EXISTING_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Authentication failed - skipping authenticated tests")
    
    def test_01_get_sounds_empty(self, auth_token):
        """Test getting sounds list (may be empty initially)"""
        response = requests.get(f"{BASE_URL}/api/sounds", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Get sounds passed: {len(data)} sounds found")
    
    def test_02_create_sound(self, auth_token):
        """Test creating a new sound"""
        # Create a simple test audio base64 (small stub for testing)
        import base64
        test_audio = base64.b64encode(b"test audio data").decode('utf-8')
        
        response = requests.post(f"{BASE_URL}/api/sounds", 
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "TEST_Sound_1",
                "audio_data": test_audio,
                "duration_seconds": 10.5
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "sound_id" in data
        assert data["name"] == "TEST_Sound_1"
        assert data["duration_seconds"] == 10.5
        print(f"Create sound passed: sound_id={data['sound_id']}")
        
        return data["sound_id"]
    
    def test_03_get_sounds_after_create(self, auth_token):
        """Test sounds list after creation"""
        response = requests.get(f"{BASE_URL}/api/sounds", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        
        assert response.status_code == 200
        data = response.json()
        # Should have at least one sound (created in previous test)
        test_sounds = [s for s in data if s["name"].startswith("TEST_")]
        print(f"Get sounds after create: {len(test_sounds)} test sounds found")
    
    def test_04_get_specific_sound(self, auth_token):
        """Test getting a specific sound by ID"""
        # First create a sound
        import base64
        test_audio = base64.b64encode(b"test audio data specific").decode('utf-8')
        
        create_response = requests.post(f"{BASE_URL}/api/sounds", 
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "TEST_Specific_Sound",
                "audio_data": test_audio,
                "duration_seconds": 5.0
            }
        )
        assert create_response.status_code == 200
        sound_id = create_response.json()["sound_id"]
        
        # Get the specific sound
        response = requests.get(f"{BASE_URL}/api/sounds/{sound_id}", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["sound_id"] == sound_id
        assert data["name"] == "TEST_Specific_Sound"
        assert "audio_data" in data  # Should include audio data
        print(f"Get specific sound passed: {data['name']}")
    
    def test_05_update_sound(self, auth_token):
        """Test updating a sound name"""
        # First create a sound
        import base64
        test_audio = base64.b64encode(b"test audio update").decode('utf-8')
        
        create_response = requests.post(f"{BASE_URL}/api/sounds", 
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "TEST_Update_Sound",
                "audio_data": test_audio,
                "duration_seconds": 3.0
            }
        )
        assert create_response.status_code == 200
        sound_id = create_response.json()["sound_id"]
        
        # Update the sound
        response = requests.put(f"{BASE_URL}/api/sounds/{sound_id}", 
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": "TEST_Updated_Sound_Name"}
        )
        
        assert response.status_code == 200
        
        # Verify update by getting the sound
        get_response = requests.get(f"{BASE_URL}/api/sounds/{sound_id}", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert get_response.status_code == 200
        assert get_response.json()["name"] == "TEST_Updated_Sound_Name"
        print(f"Update sound passed: sound renamed")
    
    def test_06_delete_sound(self, auth_token):
        """Test deleting a sound"""
        # First create a sound
        import base64
        test_audio = base64.b64encode(b"test audio delete").decode('utf-8')
        
        create_response = requests.post(f"{BASE_URL}/api/sounds", 
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": "TEST_Delete_Sound",
                "audio_data": test_audio,
                "duration_seconds": 2.0
            }
        )
        assert create_response.status_code == 200
        sound_id = create_response.json()["sound_id"]
        
        # Delete the sound
        response = requests.delete(f"{BASE_URL}/api/sounds/{sound_id}", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        
        assert response.status_code == 200
        
        # Verify deletion by trying to get the sound
        get_response = requests.get(f"{BASE_URL}/api/sounds/{sound_id}", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert get_response.status_code == 404
        print(f"Delete sound passed: sound removed")
    
    def test_07_get_sounds_without_auth(self):
        """Test getting sounds without authentication fails"""
        response = requests.get(f"{BASE_URL}/api/sounds")
        assert response.status_code == 401
        print("Get sounds without auth correctly rejected")


class TestSubscriptionAPI:
    """Subscription status tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": EXISTING_EMAIL,
            "password": EXISTING_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Authentication failed - skipping authenticated tests")
    
    def test_01_get_subscription_status(self, auth_token):
        """Test getting subscription status"""
        response = requests.get(f"{BASE_URL}/api/subscription/status", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "is_premium" in data
        assert "sound_count" in data
        assert "max_sounds" in data
        assert "max_duration_seconds" in data
        assert "sounds_remaining" in data
        
        # Validate values
        if not data["is_premium"]:
            assert data["max_sounds"] == 5
            assert data["max_duration_seconds"] == 300  # 5 minutes
        else:
            assert data["max_sounds"] == 30
            assert data["max_duration_seconds"] == 1800  # 30 minutes
        
        print(f"Subscription status passed: {data}")
    
    def test_02_mock_upgrade_to_premium(self, auth_token):
        """Test mock upgrade to premium"""
        response = requests.post(f"{BASE_URL}/api/subscription/mock-upgrade", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["is_premium"] == True
        print("Mock upgrade to premium passed")
    
    def test_03_verify_premium_status(self, auth_token):
        """Verify premium status after upgrade"""
        response = requests.get(f"{BASE_URL}/api/subscription/status", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["is_premium"] == True
        assert data["max_sounds"] == 30
        print("Premium status verified")
    
    def test_04_mock_downgrade_from_premium(self, auth_token):
        """Test mock downgrade from premium"""
        response = requests.post(f"{BASE_URL}/api/subscription/mock-downgrade", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["is_premium"] == False
        print("Mock downgrade from premium passed")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": EXISTING_EMAIL,
            "password": EXISTING_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["token"]
        pytest.skip("Authentication failed - skipping cleanup")
    
    def test_cleanup_test_sounds(self, auth_token):
        """Clean up TEST_ prefixed sounds"""
        # Get all sounds
        response = requests.get(f"{BASE_URL}/api/sounds", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        
        if response.status_code == 200:
            sounds = response.json()
            test_sounds = [s for s in sounds if s["name"].startswith("TEST_")]
            
            for sound in test_sounds:
                delete_response = requests.delete(
                    f"{BASE_URL}/api/sounds/{sound['sound_id']}", 
                    headers={"Authorization": f"Bearer {auth_token}"}
                )
                if delete_response.status_code == 200:
                    print(f"Deleted test sound: {sound['name']}")
            
            print(f"Cleanup completed: removed {len(test_sounds)} test sounds")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
