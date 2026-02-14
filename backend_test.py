#!/usr/bin/env python3
"""
Sound Loop Backend API Testing
Tests all the backend APIs according to the review request.
"""

import requests
import json
import base64
import time
from datetime import datetime

# Configuration
BASE_URL = "https://loop-play-studio.preview.emergentagent.com/api"

# Test data
TEST_USER_DATA = {
    "email": "testuser@example.com",
    "name": "Test User",
    "password": "testpassword123"
}

# Sample base64 audio data (short WAV file header)
SAMPLE_AUDIO_B64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="

class SoundLoopAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.user_data = None
        self.created_sound_id = None
        
    def log(self, message, level="INFO"):
        """Log test messages with timestamp."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")
        
    def make_request(self, method, endpoint, **kwargs):
        """Make HTTP request with error handling."""
        url = f"{BASE_URL}{endpoint}"
        
        # Add auth header if we have a token
        if self.auth_token and 'headers' not in kwargs:
            kwargs['headers'] = {}
        if self.auth_token:
            kwargs['headers']['Authorization'] = f'Bearer {self.auth_token}'
            
        try:
            self.log(f"{method.upper()} {url}")
            response = self.session.request(method, url, **kwargs)
            self.log(f"Response: {response.status_code}")
            
            if response.headers.get('content-type', '').startswith('application/json'):
                try:
                    response_data = response.json()
                    self.log(f"Response body: {json.dumps(response_data, indent=2)}")
                except:
                    self.log(f"Response body (non-JSON): {response.text[:200]}...")
            else:
                self.log(f"Response body: {response.text[:200]}...")
                
            return response
        except Exception as e:
            self.log(f"Request failed: {str(e)}", "ERROR")
            import traceback
            traceback.print_exc()
            return None

    def test_auth_register(self):
        """Test user registration API."""
        self.log("=== Testing User Registration ===")
        
        response = self.make_request('POST', '/auth/register', json=TEST_USER_DATA)
        
        if response is None:
            return False
            
        if response.status_code == 201 or response.status_code == 200:
            data = response.json()
            if 'token' in data and 'user' in data:
                self.auth_token = data['token']
                self.user_data = data['user']
                self.log("Registration successful ✅")
                return True
            else:
                self.log("Registration response missing token or user ❌", "ERROR")
                return False
        elif response.status_code == 400:
            # User might already exist, try login instead
            self.log("User already exists, will try login")
            return True
        else:
            self.log(f"Registration failed with status {response.status_code} ❌", "ERROR")
            return False

    def test_auth_login(self):
        """Test user login API."""
        self.log("=== Testing User Login ===")
        
        login_data = {
            "email": TEST_USER_DATA["email"],
            "password": TEST_USER_DATA["password"]
        }
        
        response = self.make_request('POST', '/auth/login', json=login_data)
        
        if response is None:
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'token' in data and 'user' in data:
                self.auth_token = data['token']
                self.user_data = data['user']
                self.log("Login successful ✅")
                return True
            else:
                self.log("Login response missing token or user ❌", "ERROR")
                return False
        else:
            self.log(f"Login failed with status {response.status_code} ❌", "ERROR")
            return False

    def test_auth_me(self):
        """Test getting current user info."""
        self.log("=== Testing Get Current User (/auth/me) ===")
        
        if not self.auth_token:
            self.log("No auth token available for /auth/me test ❌", "ERROR")
            return False
            
        response = self.make_request('GET', '/auth/me')
        
        if response is None:
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'user_id' in data and 'email' in data:
                self.log("Get current user successful ✅")
                return True
            else:
                self.log("User info response missing required fields ❌", "ERROR")
                return False
        else:
            self.log(f"Get current user failed with status {response.status_code} ❌", "ERROR")
            return False

    def test_subscription_status(self):
        """Test subscription status API."""
        self.log("=== Testing Subscription Status ===")
        
        if not self.auth_token:
            self.log("No auth token available for subscription test ❌", "ERROR")
            return False
            
        response = self.make_request('GET', '/subscription/status')
        
        if response is None:
            return False
            
        if response.status_code == 200:
            data = response.json()
            required_fields = ['is_premium', 'sound_count', 'max_sounds', 'max_duration_seconds']
            if all(field in data for field in required_fields):
                # Verify free user limits
                if not data['is_premium']:
                    if data['max_sounds'] == 5 and data['max_duration_seconds'] == 300:
                        self.log("Subscription status (free user) correct ✅")
                        return True
                    else:
                        self.log(f"Free user limits incorrect: got {data['max_sounds']} sounds, {data['max_duration_seconds']} seconds ❌", "ERROR")
                        return False
                else:
                    self.log("User is premium, checking limits...")
                    if data['max_sounds'] == 30 and data['max_duration_seconds'] == 1800:
                        self.log("Subscription status (premium user) correct ✅")
                        return True
                    else:
                        self.log(f"Premium user limits incorrect: got {data['max_sounds']} sounds, {data['max_duration_seconds']} seconds ❌", "ERROR")
                        return False
            else:
                missing = [f for f in required_fields if f not in data]
                self.log(f"Subscription status response missing fields: {missing} ❌", "ERROR")
                return False
        else:
            self.log(f"Get subscription status failed with status {response.status_code} ❌", "ERROR")
            return False

    def test_create_sound(self):
        """Test creating a sound."""
        self.log("=== Testing Create Sound ===")
        
        if not self.auth_token:
            self.log("No auth token available for create sound test ❌", "ERROR")
            return False
            
        sound_data = {
            "name": "Test Sound",
            "audio_data": SAMPLE_AUDIO_B64,
            "duration_seconds": 10.5
        }
        
        response = self.make_request('POST', '/sounds', json=sound_data)
        
        if response is None:
            return False
            
        if response.status_code == 200 or response.status_code == 201:
            data = response.json()
            if 'sound_id' in data:
                self.created_sound_id = data['sound_id']
                self.log("Create sound successful ✅")
                return True
            else:
                self.log("Create sound response missing sound_id ❌", "ERROR")
                return False
        else:
            self.log(f"Create sound failed with status {response.status_code} ❌", "ERROR")
            return False

    def test_get_sounds_list(self):
        """Test getting sounds list."""
        self.log("=== Testing Get Sounds List ===")
        
        if not self.auth_token:
            self.log("No auth token available for get sounds test ❌", "ERROR")
            return False
            
        response = self.make_request('GET', '/sounds')
        
        if response is None:
            return False
            
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                self.log(f"Get sounds list successful, found {len(data)} sounds ✅")
                return True
            else:
                self.log("Get sounds list should return an array ❌", "ERROR")
                return False
        else:
            self.log(f"Get sounds list failed with status {response.status_code} ❌", "ERROR")
            return False

    def test_get_specific_sound(self):
        """Test getting a specific sound with audio data."""
        self.log("=== Testing Get Specific Sound ===")
        
        if not self.auth_token:
            self.log("No auth token available for get sound test ❌", "ERROR")
            return False
            
        if not self.created_sound_id:
            self.log("No sound ID available for get sound test ❌", "ERROR")
            return False
            
        response = self.make_request('GET', f'/sounds/{self.created_sound_id}')
        
        if response is None:
            return False
            
        if response.status_code == 200:
            data = response.json()
            required_fields = ['sound_id', 'name', 'audio_data', 'duration_seconds']
            if all(field in data for field in required_fields):
                self.log("Get specific sound successful ✅")
                return True
            else:
                missing = [f for f in required_fields if f not in data]
                self.log(f"Get sound response missing fields: {missing} ❌", "ERROR")
                return False
        else:
            self.log(f"Get specific sound failed with status {response.status_code} ❌", "ERROR")
            return False

    def test_mock_upgrade_premium(self):
        """Test mock premium upgrade."""
        self.log("=== Testing Mock Premium Upgrade ===")
        
        if not self.auth_token:
            self.log("No auth token available for premium upgrade test ❌", "ERROR")
            return False
            
        response = self.make_request('POST', '/subscription/mock-upgrade')
        
        if response is None:
            return False
            
        if response.status_code == 200:
            data = response.json()
            if 'is_premium' in data and data['is_premium']:
                self.log("Mock premium upgrade successful ✅")
                return True
            else:
                self.log("Mock upgrade response missing is_premium or not true ❌", "ERROR")
                return False
        else:
            self.log(f"Mock premium upgrade failed with status {response.status_code} ❌", "ERROR")
            return False

    def test_subscription_status_premium(self):
        """Test subscription status after premium upgrade."""
        self.log("=== Testing Subscription Status (Premium) ===")
        
        if not self.auth_token:
            self.log("No auth token available for premium status test ❌", "ERROR")
            return False
            
        response = self.make_request('GET', '/subscription/status')
        
        if response is None:
            return False
            
        if response.status_code == 200:
            data = response.json()
            if data.get('is_premium') and data.get('max_sounds') == 30 and data.get('max_duration_seconds') == 1800:
                self.log("Premium subscription status correct ✅")
                return True
            else:
                self.log(f"Premium status incorrect: premium={data.get('is_premium')}, max_sounds={data.get('max_sounds')}, max_duration={data.get('max_duration_seconds')} ❌", "ERROR")
                return False
        else:
            self.log(f"Get premium subscription status failed with status {response.status_code} ❌", "ERROR")
            return False

    def test_delete_sound(self):
        """Test deleting a sound."""
        self.log("=== Testing Delete Sound ===")
        
        if not self.auth_token:
            self.log("No auth token available for delete sound test ❌", "ERROR")
            return False
            
        if not self.created_sound_id:
            self.log("No sound ID available for delete sound test ❌", "ERROR")
            return False
            
        response = self.make_request('DELETE', f'/sounds/{self.created_sound_id}')
        
        if response is None:
            return False
            
        if response.status_code == 200:
            self.log("Delete sound successful ✅")
            return True
        else:
            self.log(f"Delete sound failed with status {response.status_code} ❌", "ERROR")
            return False

    def test_auth_logout(self):
        """Test user logout."""
        self.log("=== Testing User Logout ===")
        
        if not self.auth_token:
            self.log("No auth token available for logout test ❌", "ERROR")
            return False
            
        response = self.make_request('POST', '/auth/logout')
        
        if response is None:
            return False
            
        if response.status_code == 200:
            self.log("Logout successful ✅")
            self.auth_token = None  # Clear token
            return True
        else:
            self.log(f"Logout failed with status {response.status_code} ❌", "ERROR")
            return False

    def test_free_user_limits(self):
        """Test that free user limits are properly enforced."""
        self.log("=== Testing Free User Limits Enforcement ===")
        
        # First, downgrade to free if premium
        self.make_request('POST', '/subscription/mock-downgrade')
        
        # Try to create a sound that exceeds free duration limit (5 minutes = 300 seconds)
        long_sound_data = {
            "name": "Long Test Sound",
            "audio_data": SAMPLE_AUDIO_B64,
            "duration_seconds": 350  # Exceeds 5 minute limit
        }
        
        response = self.make_request('POST', '/sounds', json=long_sound_data)
        
        if response is None:
            return False
            
        if response.status_code == 403:
            self.log("Free user duration limit properly enforced ✅")
            return True
        else:
            self.log(f"Free user duration limit not enforced, got status {response.status_code} ❌", "ERROR")
            return False

    def run_all_tests(self):
        """Run the complete test suite."""
        self.log("🚀 Starting Sound Loop Backend API Tests")
        self.log(f"Testing against: {BASE_URL}")
        
        tests = [
            ("User Registration", self.test_auth_register),
            ("User Login", self.test_auth_login),
            ("Get Current User", self.test_auth_me),
            ("Subscription Status (Free)", self.test_subscription_status),
            ("Create Sound", self.test_create_sound),
            ("Get Sounds List", self.test_get_sounds_list),
            ("Get Specific Sound", self.test_get_specific_sound),
            ("Mock Premium Upgrade", self.test_mock_upgrade_premium),
            ("Subscription Status (Premium)", self.test_subscription_status_premium),
            ("Free User Limits", self.test_free_user_limits),
            ("Delete Sound", self.test_delete_sound),
            ("User Logout", self.test_auth_logout),
        ]
        
        results = []
        passed = 0
        failed = 0
        
        for test_name, test_func in tests:
            self.log(f"\n--- Running: {test_name} ---")
            try:
                result = test_func()
                results.append((test_name, result, None))
                if result:
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                self.log(f"Test {test_name} crashed: {str(e)}", "ERROR")
                results.append((test_name, False, str(e)))
                failed += 1
            
        # Print summary
        self.log("\n" + "="*50)
        self.log("🏁 TEST RESULTS SUMMARY")
        self.log("="*50)
        
        for test_name, result, error in results:
            status = "✅ PASS" if result else "❌ FAIL"
            self.log(f"{test_name}: {status}")
            if error:
                self.log(f"  Error: {error}")
        
        self.log(f"\nTotal: {len(tests)} tests")
        self.log(f"Passed: {passed}")
        self.log(f"Failed: {failed}")
        
        if failed == 0:
            self.log("🎉 ALL TESTS PASSED!")
            return True
        else:
            self.log(f"💥 {failed} TESTS FAILED")
            return False

if __name__ == "__main__":
    tester = SoundLoopAPITester()
    success = tester.run_all_tests()
    exit(0 if success else 1)