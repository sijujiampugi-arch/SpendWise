#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for SpendWise Expense Tracking App
Tests all endpoints with various scenarios including edge cases
"""

import requests
import json
from datetime import datetime, date
import uuid
import time

# Configuration
BASE_URL = "https://spendwise-317.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

# Test data
VALID_CATEGORIES = [
    "Grocery", "Fuel", "Dining Out", "Shopping", "Bills", 
    "Healthcare", "Entertainment", "Transport", "Other"
]

class BackendTester:
    def __init__(self):
        self.test_results = []
        self.created_expense_ids = []
        
    def log_result(self, test_name, success, message, details=None):
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
    
    def test_api_health_check(self):
        """Test GET /api/ endpoint for basic connectivity"""
        try:
            response = requests.get(f"{BASE_URL}/", headers=HEADERS, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if "message" in data and "SpendWise" in data["message"]:
                    self.log_result("API Health Check", True, "API is responding correctly", data)
                else:
                    self.log_result("API Health Check", False, "Unexpected response format", data)
            else:
                self.log_result("API Health Check", False, f"HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_result("API Health Check", False, f"Connection error: {str(e)}")
    
    def test_categories_endpoint(self):
        """Test GET /api/categories endpoint"""
        try:
            response = requests.get(f"{BASE_URL}/categories", headers=HEADERS, timeout=10)
            if response.status_code == 200:
                categories = response.json()
                
                # Check if it's a list
                if not isinstance(categories, list):
                    self.log_result("Categories Endpoint", False, "Response is not a list", categories)
                    return
                
                # Check if we have the expected categories
                category_names = [cat.get("name") for cat in categories]
                missing_categories = [cat for cat in VALID_CATEGORIES if cat not in category_names]
                
                if missing_categories:
                    self.log_result("Categories Endpoint", False, f"Missing categories: {missing_categories}", categories)
                    return
                
                # Check if each category has required fields
                for cat in categories:
                    if not all(key in cat for key in ["name", "color", "icon"]):
                        self.log_result("Categories Endpoint", False, f"Category missing required fields: {cat}")
                        return
                
                self.log_result("Categories Endpoint", True, f"All {len(categories)} categories loaded correctly", 
                              f"Categories: {category_names}")
            else:
                self.log_result("Categories Endpoint", False, f"HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Categories Endpoint", False, f"Request error: {str(e)}")
    
    def test_expense_creation(self):
        """Test POST /api/expenses with various scenarios"""
        test_expenses = [
            {
                "name": "Valid Grocery Expense",
                "data": {
                    "amount": 1250.75,
                    "category": "Grocery",
                    "description": "Weekly groceries at SM Supermarket",
                    "date": "2024-01-15"
                }
            },
            {
                "name": "Valid Fuel Expense",
                "data": {
                    "amount": 2500.00,
                    "category": "Fuel",
                    "description": "Full tank at Shell station",
                    "date": "2024-01-14"
                }
            },
            {
                "name": "Valid Dining Out Expense",
                "data": {
                    "amount": 850.50,
                    "category": "Dining Out",
                    "description": "Dinner at Jollibee with family",
                    "date": "2024-01-13"
                }
            },
            {
                "name": "Large Amount Expense",
                "data": {
                    "amount": 50000.00,
                    "category": "Bills",
                    "description": "Monthly rent payment",
                    "date": "2024-01-01"
                }
            }
        ]
        
        for test_case in test_expenses:
            try:
                response = requests.post(f"{BASE_URL}/expenses", 
                                       json=test_case["data"], 
                                       headers=HEADERS, 
                                       timeout=10)
                
                if response.status_code == 200:
                    expense = response.json()
                    
                    # Validate response structure
                    required_fields = ["id", "amount", "category", "description", "date", "user_id", "created_at"]
                    missing_fields = [field for field in required_fields if field not in expense]
                    
                    if missing_fields:
                        self.log_result(f"Create {test_case['name']}", False, 
                                      f"Missing fields in response: {missing_fields}", expense)
                        continue
                    
                    # Store expense ID for cleanup
                    self.created_expense_ids.append(expense["id"])
                    
                    # Validate data matches
                    if (expense["amount"] == test_case["data"]["amount"] and
                        expense["category"] == test_case["data"]["category"] and
                        expense["description"] == test_case["data"]["description"]):
                        self.log_result(f"Create {test_case['name']}", True, 
                                      "Expense created successfully", 
                                      f"ID: {expense['id']}, Amount: ₱{expense['amount']}")
                    else:
                        self.log_result(f"Create {test_case['name']}", False, 
                                      "Response data doesn't match input", expense)
                else:
                    self.log_result(f"Create {test_case['name']}", False, 
                                  f"HTTP {response.status_code}", response.text)
            except Exception as e:
                self.log_result(f"Create {test_case['name']}", False, f"Request error: {str(e)}")
    
    def test_expense_creation_edge_cases(self):
        """Test POST /api/expenses with invalid data"""
        edge_cases = [
            {
                "name": "Invalid Category",
                "data": {
                    "amount": 100.00,
                    "category": "InvalidCategory",
                    "description": "Test expense",
                    "date": "2024-01-15"
                },
                "should_fail": True
            },
            {
                "name": "Negative Amount",
                "data": {
                    "amount": -100.00,
                    "category": "Grocery",
                    "description": "Negative amount test",
                    "date": "2024-01-15"
                },
                "should_fail": False  # Backend might allow this for refunds
            },
            {
                "name": "Missing Required Field",
                "data": {
                    "amount": 100.00,
                    "category": "Grocery",
                    # Missing description
                    "date": "2024-01-15"
                },
                "should_fail": True
            }
        ]
        
        for test_case in edge_cases:
            try:
                response = requests.post(f"{BASE_URL}/expenses", 
                                       json=test_case["data"], 
                                       headers=HEADERS, 
                                       timeout=10)
                
                if test_case["should_fail"]:
                    if response.status_code >= 400:
                        self.log_result(f"Edge Case: {test_case['name']}", True, 
                                      f"Correctly rejected with HTTP {response.status_code}")
                    else:
                        self.log_result(f"Edge Case: {test_case['name']}", False, 
                                      f"Should have failed but got HTTP {response.status_code}", response.json())
                else:
                    if response.status_code == 200:
                        expense = response.json()
                        self.created_expense_ids.append(expense["id"])
                        self.log_result(f"Edge Case: {test_case['name']}", True, 
                                      "Accepted as expected", f"ID: {expense['id']}")
                    else:
                        self.log_result(f"Edge Case: {test_case['name']}", False, 
                                      f"Should have succeeded but got HTTP {response.status_code}", response.text)
            except Exception as e:
                self.log_result(f"Edge Case: {test_case['name']}", False, f"Request error: {str(e)}")
    
    def test_expense_retrieval(self):
        """Test GET /api/expenses with various filters"""
        test_cases = [
            {
                "name": "Get All Expenses",
                "params": {},
                "description": "Retrieve all expenses without filters"
            },
            {
                "name": "Filter by Month",
                "params": {"month": 1, "year": 2024},
                "description": "Get expenses for January 2024"
            },
            {
                "name": "Filter by Year",
                "params": {"year": 2024},
                "description": "Get expenses for 2024"
            },
            {
                "name": "Filter by Category",
                "params": {"category": "Grocery"},
                "description": "Get only grocery expenses"
            },
            {
                "name": "Combined Filters",
                "params": {"month": 1, "year": 2024, "category": "Fuel"},
                "description": "Get fuel expenses for January 2024"
            },
            {
                "name": "Limit Results",
                "params": {"limit": 5},
                "description": "Get maximum 5 expenses"
            }
        ]
        
        for test_case in test_cases:
            try:
                response = requests.get(f"{BASE_URL}/expenses", 
                                      params=test_case["params"], 
                                      headers=HEADERS, 
                                      timeout=10)
                
                if response.status_code == 200:
                    expenses = response.json()
                    
                    if not isinstance(expenses, list):
                        self.log_result(f"Retrieve: {test_case['name']}", False, 
                                      "Response is not a list", expenses)
                        continue
                    
                    # Validate structure of returned expenses
                    if expenses:
                        first_expense = expenses[0]
                        required_fields = ["id", "amount", "category", "description", "date"]
                        missing_fields = [field for field in required_fields if field not in first_expense]
                        
                        if missing_fields:
                            self.log_result(f"Retrieve: {test_case['name']}", False, 
                                          f"Missing fields in expense: {missing_fields}", first_expense)
                            continue
                    
                    self.log_result(f"Retrieve: {test_case['name']}", True, 
                                  f"Retrieved {len(expenses)} expenses", 
                                  f"Params: {test_case['params']}")
                else:
                    self.log_result(f"Retrieve: {test_case['name']}", False, 
                                  f"HTTP {response.status_code}", response.text)
            except Exception as e:
                self.log_result(f"Retrieve: {test_case['name']}", False, f"Request error: {str(e)}")
    
    def test_statistics_endpoint(self):
        """Test GET /api/expenses/stats endpoint"""
        test_cases = [
            {
                "name": "Current Month Stats",
                "params": {},
                "description": "Get statistics for current month"
            },
            {
                "name": "Specific Month Stats",
                "params": {"month": 1, "year": 2024},
                "description": "Get statistics for January 2024"
            },
            {
                "name": "Year Stats",
                "params": {"year": 2024},
                "description": "Get statistics for 2024"
            }
        ]
        
        for test_case in test_cases:
            try:
                response = requests.get(f"{BASE_URL}/expenses/stats", 
                                      params=test_case["params"], 
                                      headers=HEADERS, 
                                      timeout=10)
                
                if response.status_code == 200:
                    stats = response.json()
                    
                    # Validate required fields
                    required_fields = ["total_expenses", "category_breakdown", "monthly_trend", 
                                     "top_category", "top_category_amount"]
                    missing_fields = [field for field in required_fields if field not in stats]
                    
                    if missing_fields:
                        self.log_result(f"Stats: {test_case['name']}", False, 
                                      f"Missing fields: {missing_fields}", stats)
                        continue
                    
                    # Validate data types
                    if not isinstance(stats["total_expenses"], (int, float)):
                        self.log_result(f"Stats: {test_case['name']}", False, 
                                      "total_expenses is not a number", stats)
                        continue
                    
                    if not isinstance(stats["category_breakdown"], dict):
                        self.log_result(f"Stats: {test_case['name']}", False, 
                                      "category_breakdown is not a dict", stats)
                        continue
                    
                    if not isinstance(stats["monthly_trend"], list):
                        self.log_result(f"Stats: {test_case['name']}", False, 
                                      "monthly_trend is not a list", stats)
                        continue
                    
                    # Validate monthly trend structure
                    if stats["monthly_trend"]:
                        trend_item = stats["monthly_trend"][0]
                        if not all(key in trend_item for key in ["month", "amount"]):
                            self.log_result(f"Stats: {test_case['name']}", False, 
                                          "monthly_trend items missing required fields", trend_item)
                            continue
                    
                    self.log_result(f"Stats: {test_case['name']}", True, 
                                  f"Statistics retrieved successfully", 
                                  f"Total: ₱{stats['total_expenses']}, Categories: {len(stats['category_breakdown'])}, Trends: {len(stats['monthly_trend'])}")
                else:
                    self.log_result(f"Stats: {test_case['name']}", False, 
                                  f"HTTP {response.status_code}", response.text)
            except Exception as e:
                self.log_result(f"Stats: {test_case['name']}", False, f"Request error: {str(e)}")
    
    def test_delete_functionality(self):
        """Test DELETE /api/expenses/{expense_id}"""
        # Test deleting existing expenses
        for expense_id in self.created_expense_ids[:2]:  # Delete first 2 created expenses
            try:
                response = requests.delete(f"{BASE_URL}/expenses/{expense_id}", 
                                         headers=HEADERS, 
                                         timeout=10)
                
                if response.status_code == 200:
                    result = response.json()
                    if "message" in result and "deleted" in result["message"].lower():
                        self.log_result(f"Delete Expense", True, 
                                      f"Successfully deleted expense {expense_id}", result)
                        self.created_expense_ids.remove(expense_id)
                    else:
                        self.log_result(f"Delete Expense", False, 
                                      "Unexpected response format", result)
                else:
                    self.log_result(f"Delete Expense", False, 
                                  f"HTTP {response.status_code}", response.text)
            except Exception as e:
                self.log_result(f"Delete Expense", False, f"Request error: {str(e)}")
        
        # Test deleting non-existent expense
        fake_id = str(uuid.uuid4())
        try:
            response = requests.delete(f"{BASE_URL}/expenses/{fake_id}", 
                                     headers=HEADERS, 
                                     timeout=10)
            
            if response.status_code == 404:
                self.log_result("Delete Non-existent Expense", True, 
                              "Correctly returned 404 for non-existent expense")
            else:
                self.log_result("Delete Non-existent Expense", False, 
                              f"Expected 404 but got HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Delete Non-existent Expense", False, f"Request error: {str(e)}")
    
    def cleanup_remaining_expenses(self):
        """Clean up any remaining test expenses"""
        for expense_id in self.created_expense_ids:
            try:
                requests.delete(f"{BASE_URL}/expenses/{expense_id}", headers=HEADERS, timeout=5)
            except:
                pass  # Ignore cleanup errors
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Backend API Tests for SpendWise")
        print(f"📡 Testing API at: {BASE_URL}")
        print("=" * 60)
        
        # Run tests in order
        self.test_api_health_check()
        self.test_categories_endpoint()
        self.test_expense_creation()
        self.test_expense_creation_edge_cases()
        self.test_expense_retrieval()
        self.test_statistics_endpoint()
        self.test_delete_functionality()
        
        # Cleanup
        self.cleanup_remaining_expenses()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if r["success"]])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\n🔍 FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  • {result['test']}: {result['message']}")
        
        return self.test_results

if __name__ == "__main__":
    tester = BackendTester()
    results = tester.run_all_tests()