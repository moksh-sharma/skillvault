"""
Comprehensive API Endpoint Testing Script
Tests all endpoints for proper status codes and error handling
"""
import requests
import json
import os
from typing import Dict, List, Tuple
from urllib.parse import urljoin

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8002").rstrip("/")


def mark(ok: bool) -> str:
    # Avoid UnicodeEncodeError on Windows cp1252 consoles
    return "OK" if ok else "FAIL"

# Test results storage
results: Dict[str, Dict] = {}

def test_endpoint(
    method: str,
    path: str,
    expected_status: int = None,
    auth_token: str = None,
    data: dict = None,
    files: dict = None,
    description: str = ""
) -> Tuple[int, dict]:
    """Test a single endpoint"""
    url = urljoin(BASE_URL, path)
    headers = {}
    
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, timeout=10)
        elif method.upper() == "POST":
            if files:
                response = requests.post(url, headers=headers, data=data, files=files, timeout=30)
            else:
                headers["Content-Type"] = "application/json"
                response = requests.post(url, headers=headers, json=data, timeout=10)
        elif method.upper() == "PUT":
            headers["Content-Type"] = "application/json"
            response = requests.put(url, headers=headers, json=data, timeout=10)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers, timeout=10)
        else:
            return None, {"error": f"Unsupported method: {method}"}
        
        status = response.status_code
        try:
            body = response.json()
        except:
            body = {"raw": response.text[:200]}
        
        result = {
            "status": status,
            "expected": expected_status,
            "match": expected_status is None or status == expected_status,
            "response": body,
            "description": description
        }
        
        return status, result
        
    except requests.exceptions.ConnectionError:
        return None, {"error": "Connection refused - Server not running"}
    except requests.exceptions.Timeout:
        return None, {"error": "Request timeout"}
    except Exception as e:
        return None, {"error": str(e)}


def main():
    """Test all endpoints"""
    print("=" * 80)
    print("API ENDPOINT TESTING SCRIPT")
    print("=" * 80)
    print(f"Testing against: {BASE_URL}\n")
    
    # Test authentication first
    print("Testing Authentication Endpoints...")
    print("-" * 80)
    
    # 1. Health check (should always work)
    status, result = test_endpoint("GET", "/health", expected_status=200, description="Health check")
    results["GET /health"] = result
    print(f"GET /health: {status} {mark(status == 200)}")
    
    # 2. Root endpoint
    status, result = test_endpoint("GET", "/", expected_status=200, description="Root endpoint")
    results["GET /"] = result
    print(f"GET /: {status} {mark(status == 200)}")
    
    # 3. Docs endpoint
    status, result = test_endpoint("GET", "/docs", expected_status=200, description="API documentation")
    results["GET /docs"] = result
    print(f"GET /docs: {status} {mark(status == 200)}")
    
    # 4. Auth endpoints (without auth - should return 401 or 400)
    print("\nTesting Auth Endpoints (without authentication)...")
    print("-" * 80)
    
    auth_endpoints = [
        ("GET", "/api/auth/me", 401, "Get current user (no auth)"),
        ("POST", "/api/auth/login", 400, "Login with invalid credentials"),
        ("POST", "/api/auth/signup", 400, "Signup with invalid data"),
        ("POST", "/api/auth/logout", 401, "Logout without token"),
    ]
    
    for method, path, expected, desc in auth_endpoints:
        status, result = test_endpoint(method, path, expected_status=expected, description=desc)
        results[f"{method} {path}"] = result
        match = mark(status == expected)
        print(f"{method} {path}: {status} (expected {expected}) {match}")
    
    # 5. Resume endpoints (without auth - should return 401 or 200 for public endpoints)
    print("\nTesting Resume Endpoints...")
    print("-" * 80)
    
    resume_endpoints = [
        ("GET", "/api/resumes", 401, "List resumes (no auth)"),
        ("GET", "/api/resumes/search", 200, "Search resumes (public)"),
        ("GET", "/api/resumes/1", 401, "Get resume by ID (no auth)"),
        ("POST", "/api/resumes/upload", 401, "Upload resume (no auth)"),
        ("POST", "/api/resumes/parse-only", 400, "Parse resume only (no file)"),
    ]
    
    for method, path, expected, desc in resume_endpoints:
        status, result = test_endpoint(method, path, expected_status=expected, description=desc)
        results[f"{method} {path}"] = result
        match = mark(status == expected)
        print(f"{method} {path}: {status} (expected {expected}) {match}")
    
    # 6. Admin endpoints (should return 401 without auth)
    print("\nTesting Admin Endpoints (without authentication)...")
    print("-" * 80)
    
    admin_endpoints = [
        ("GET", "/api/admin/stats", 401, "Get admin stats (no auth)"),
        ("GET", "/api/admin/users", 401, "List users (no auth)"),
        ("DELETE", "/api/admin/users/1", 401, "Delete user (no auth)"),
    ]
    
    for method, path, expected, desc in admin_endpoints:
        status, result = test_endpoint(method, path, expected_status=expected, description=desc)
        results[f"{method} {path}"] = result
        match = mark(status == expected)
        print(f"{method} {path}: {status} (expected {expected}) {match}")
    
    # 7. JD Analysis endpoints
    print("\nTesting JD Analysis Endpoints...")
    print("-" * 80)
    
    jd_endpoints = [
        ("POST", "/api/jd/analyze", 401, "Analyze JD (no auth)"),
        ("GET", "/api/jd/results/INVALID", 401, "Get JD results (no auth)"),
        ("GET", "/api/jd/history", 401, "Get JD history (no auth)"),
    ]
    
    for method, path, expected, desc in jd_endpoints:
        status, result = test_endpoint(method, path, expected_status=expected, description=desc)
        results[f"{method} {path}"] = result
        match = mark(status == expected)
        print(f"{method} {path}: {status} (expected {expected}) {match}")
    
    # 8. User Profile endpoints
    print("\nTesting User Profile Endpoints (without authentication)...")
    print("-" * 80)
    
    profile_endpoints = [
        ("GET", "/api/user/profile", 401, "Get profile (no auth)"),
        ("PUT", "/api/user/profile", 401, "Update profile (no auth)"),
    ]
    
    for method, path, expected, desc in profile_endpoints:
        status, result = test_endpoint(method, path, expected_status=expected, description=desc)
        results[f"{method} {path}"] = result
        match = mark(status == expected)
        print(f"{method} {path}: {status} (expected {expected}) {match}")
    
    # 9. Test 404 errors
    print("\nTesting 404 Errors (Non-existent endpoints)...")
    print("-" * 80)
    
    not_found_endpoints = [
        ("GET", "/api/nonexistent", 404, "Non-existent endpoint"),
        ("GET", "/api/resumes/999999", 401, "Non-existent resume (should be 401, not 404)"),
    ]
    
    for method, path, expected, desc in not_found_endpoints:
        status, result = test_endpoint(method, path, expected_status=expected, description=desc)
        results[f"{method} {path}"] = result
        match = mark(status == expected)
        print(f"{method} {path}: {status} (expected {expected}) {match}")
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    total = len(results)
    passed = sum(1 for r in results.values() if r.get("match", False) and "error" not in r)
    failed = total - passed
    
    print(f"Total endpoints tested: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    
    if failed > 0:
        print("\nFailed Endpoints:")
        for endpoint, result in results.items():
            if not result.get("match", False) and "error" not in result:
                print(f"  {endpoint}: Got {result.get('status')}, expected {result.get('expected')}")
    
    # Check for connection errors
    connection_errors = [ep for ep, r in results.items() if "error" in r]
    if connection_errors:
        print(f"\n⚠️  Connection Errors ({len(connection_errors)} endpoints):")
        print("   Server may not be running. Start with: python -m src.main")
        for ep in connection_errors[:3]:
            print(f"   - {ep}")
    
    print("\n" + "=" * 80)
    print("Detailed results saved to: endpoint_test_results.json")
    
    # Save results to file
    with open("endpoint_test_results.json", "w") as f:
        json.dump(results, f, indent=2, default=str)
    
    return passed, failed


if __name__ == "__main__":
    try:
        passed, failed = main()
        exit(0 if failed == 0 else 1)
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
        exit(1)
    except Exception as e:
        print(f"\n\nTest script error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)

