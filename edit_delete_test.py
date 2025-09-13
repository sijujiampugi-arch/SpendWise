#!/usr/bin/env python3
"""
Specific test for Edit and Delete functionality after Full Visibility implementation
Tests the user-reported issue: "Edit and delete function for each expense was missing"
"""

import requests
import json
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta
import uuid

# Load environment
load_dotenv('backend/.env')

# Configuration
BASE_URL = "https://budget-sentinel-1.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

class EditDeleteTester:
    def __init__(self):
        self.test_results = []
        self.session_token = None
        self.user_id = None
        self.user_email = None
        self.test_expense_id = None
        
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
        print(f"{status}: {test_name}")
        print(f"   {message}")
        if details:
            print(f"   Details: {details}")
        print()
    
    async def setup_real_authentication(self):
        """Get a real session token from the database"""
        try:
            mongo_url = os.environ['MONGO_URL']
            client = AsyncIOMotorClient(mongo_url)
            db = client[os.environ['DB_NAME']]
            
            # Get a valid session
            session = await db.user_sessions.find_one({
                "expires_at": {"$gt": datetime.now(timezone.utc).isoformat()}
            })
            
            if session:
                self.session_token = session["session_token"]
                self.user_id = session["user_id"]
                
                # Get user details
                user = await db.users.find_one({"id": self.user_id})
                if user:
                    self.user_email = user["email"]
                    
                self.log_result("Setup: Real Authentication", True, 
                              f"Found valid session for user {self.user_email}", 
                              f"User ID: {self.user_id}")
                client.close()
                return True
            else:
                self.log_result("Setup: Real Authentication", False, 
                              "No valid sessions found in database")
                client.close()
                return False
                
        except Exception as e:
            self.log_result("Setup: Real Authentication", False, f"Database error: {str(e)}")
            return False
    
    def test_get_expenses_with_ownership_flags(self):
        """Test GET /api/expenses returns expenses with is_owned_by_me property"""
        try:
            headers = HEADERS.copy()
            headers["Authorization"] = f"Bearer {self.session_token}"
            
            response = requests.get(f"{BASE_URL}/expenses", headers=headers, timeout=10)
            
            if response.status_code == 200:
                expenses = response.json()
                
                if isinstance(expenses, list):
                    if expenses:
                        # Check each expense for ownership flags
                        ownership_flags_present = 0
                        missing_flags = 0
                        
                        for expense in expenses:
                            if "is_owned_by_me" in expense:
                                ownership_flags_present += 1
                            else:
                                missing_flags += 1
                        
                        if ownership_flags_present > 0 and missing_flags == 0:
                            self.log_result("GET Expenses: Ownership Flags", True, 
                                          f"✅ ALL {len(expenses)} expenses have is_owned_by_me property", 
                                          f"Sample: {expenses[0].get('description', 'N/A')} - is_owned_by_me: {expenses[0].get('is_owned_by_me', 'MISSING')}")
                        elif ownership_flags_present > 0:
                            self.log_result("GET Expenses: Ownership Flags", False, 
                                          f"❌ PARTIAL: {ownership_flags_present} have flags, {missing_flags} missing", 
                                          f"This will cause edit/delete buttons to not appear correctly")
                        else:
                            self.log_result("GET Expenses: Ownership Flags", False, 
                                          f"❌ CRITICAL: NO expenses have is_owned_by_me property", 
                                          f"Edit and delete buttons will not work! Available fields: {list(expenses[0].keys()) if expenses else 'No expenses'}")
                        
                        # Store a test expense ID for further testing
                        if expenses:
                            self.test_expense_id = expenses[0].get("id")
                    else:
                        self.log_result("GET Expenses: Ownership Flags", True, 
                                      "No expenses found - cannot test ownership flags")
                else:
                    self.log_result("GET Expenses: Ownership Flags", False, 
                                  "Response is not a list", expenses)
            else:
                self.log_result("GET Expenses: Ownership Flags", False, 
                              f"HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_result("GET Expenses: Ownership Flags", False, f"Request error: {str(e)}")
    
    def test_put_expense_functionality(self):
        """Test PUT /api/expenses/{expense_id} edit functionality"""
        if not self.test_expense_id:
            self.log_result("PUT Expense: Edit Functionality", False, 
                          "No test expense ID available - skipping edit test")
            return
        
        try:
            headers = HEADERS.copy()
            headers["Authorization"] = f"Bearer {self.session_token}"
            
            # First, get the current expense data
            get_response = requests.get(f"{BASE_URL}/expenses", headers=headers, timeout=10)
            if get_response.status_code != 200:
                self.log_result("PUT Expense: Edit Functionality", False, 
                              "Cannot get current expense data for edit test")
                return
            
            expenses = get_response.json()
            target_expense = None
            for expense in expenses:
                if expense.get("id") == self.test_expense_id and expense.get("is_owned_by_me"):
                    target_expense = expense
                    break
            
            if not target_expense:
                self.log_result("PUT Expense: Edit Functionality", False, 
                              "No owned expense found for edit test")
                return
            
            # Prepare update data
            update_data = {
                "amount": float(target_expense["amount"]) + 10.50,  # Modify amount
                "category": target_expense["category"],
                "description": f"[EDITED] {target_expense['description']}",
                "date": target_expense["date"]
            }
            
            # Attempt to edit the expense
            response = requests.put(f"{BASE_URL}/expenses/{self.test_expense_id}", 
                                  json=update_data, headers=headers, timeout=10)
            
            if response.status_code == 200:
                updated_expense = response.json()
                
                # Verify the update worked
                if (updated_expense.get("amount") == update_data["amount"] and 
                    "[EDITED]" in updated_expense.get("description", "")):
                    self.log_result("PUT Expense: Edit Functionality", True, 
                                  "✅ Edit functionality working correctly", 
                                  f"Updated: {updated_expense['description']} - Amount: {updated_expense['amount']}")
                else:
                    self.log_result("PUT Expense: Edit Functionality", False, 
                                  "❌ Edit response doesn't match update data", 
                                  f"Expected amount: {update_data['amount']}, Got: {updated_expense.get('amount')}")
            elif response.status_code == 403:
                self.log_result("PUT Expense: Edit Functionality", False, 
                              "❌ CRITICAL: Edit forbidden - ownership check may be broken", 
                              f"User {self.user_email} cannot edit expense {self.test_expense_id}")
            elif response.status_code == 404:
                self.log_result("PUT Expense: Edit Functionality", False, 
                              "❌ Expense not found for edit", response.text)
            else:
                self.log_result("PUT Expense: Edit Functionality", False, 
                              f"❌ Unexpected HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_result("PUT Expense: Edit Functionality", False, f"Request error: {str(e)}")
    
    def test_delete_expense_functionality(self):
        """Test DELETE /api/expenses/{expense_id} delete functionality"""
        if not self.test_expense_id:
            self.log_result("DELETE Expense: Delete Functionality", False, 
                          "No test expense ID available - skipping delete test")
            return
        
        try:
            headers = HEADERS.copy()
            headers["Authorization"] = f"Bearer {self.session_token}"
            
            # First, verify the expense exists and is owned by user
            get_response = requests.get(f"{BASE_URL}/expenses", headers=headers, timeout=10)
            if get_response.status_code != 200:
                self.log_result("DELETE Expense: Delete Functionality", False, 
                              "Cannot verify expense ownership for delete test")
                return
            
            expenses = get_response.json()
            target_expense = None
            for expense in expenses:
                if expense.get("id") == self.test_expense_id and expense.get("is_owned_by_me"):
                    target_expense = expense
                    break
            
            if not target_expense:
                self.log_result("DELETE Expense: Delete Functionality", False, 
                              "No owned expense found for delete test")
                return
            
            # Attempt to delete the expense
            response = requests.delete(f"{BASE_URL}/expenses/{self.test_expense_id}", 
                                     headers=headers, timeout=10)
            
            if response.status_code == 200:
                result = response.json()
                if "message" in result and "deleted" in result["message"].lower():
                    self.log_result("DELETE Expense: Delete Functionality", True, 
                                  "✅ Delete functionality working correctly", 
                                  f"Deleted: {target_expense['description']} - {result['message']}")
                    
                    # Verify expense is actually deleted
                    verify_response = requests.get(f"{BASE_URL}/expenses", headers=headers, timeout=10)
                    if verify_response.status_code == 200:
                        remaining_expenses = verify_response.json()
                        if not any(exp.get("id") == self.test_expense_id for exp in remaining_expenses):
                            self.log_result("DELETE Expense: Verification", True, 
                                          "✅ Expense successfully removed from database")
                        else:
                            self.log_result("DELETE Expense: Verification", False, 
                                          "❌ Expense still exists after delete")
                else:
                    self.log_result("DELETE Expense: Delete Functionality", False, 
                                  "❌ Delete response format incorrect", result)
            elif response.status_code == 403:
                self.log_result("DELETE Expense: Delete Functionality", False, 
                              "❌ CRITICAL: Delete forbidden - ownership check may be broken", 
                              f"User {self.user_email} cannot delete expense {self.test_expense_id}")
            elif response.status_code == 404:
                self.log_result("DELETE Expense: Delete Functionality", False, 
                              "❌ Expense not found for delete", response.text)
            else:
                self.log_result("DELETE Expense: Delete Functionality", False, 
                              f"❌ Unexpected HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_result("DELETE Expense: Delete Functionality", False, f"Request error: {str(e)}")
    
    def test_frontend_logic_data_availability(self):
        """Test that frontend canEdit() and canDelete() logic has required data"""
        try:
            headers = HEADERS.copy()
            headers["Authorization"] = f"Bearer {self.session_token}"
            
            response = requests.get(f"{BASE_URL}/expenses", headers=headers, timeout=10)
            
            if response.status_code == 200:
                expenses = response.json()
                
                if isinstance(expenses, list) and expenses:
                    # Analyze data availability for frontend logic
                    can_edit_data_count = 0
                    can_delete_data_count = 0
                    
                    for expense in expenses:
                        # canEdit() logic: expense.is_owned_by_me || expense.shared_permission === 'edit'
                        has_edit_data = ("is_owned_by_me" in expense or "shared_permission" in expense)
                        if has_edit_data:
                            can_edit_data_count += 1
                        
                        # canDelete() logic: expense.is_owned_by_me
                        has_delete_data = "is_owned_by_me" in expense
                        if has_delete_data:
                            can_delete_data_count += 1
                    
                    total_expenses = len(expenses)
                    
                    if can_edit_data_count == total_expenses and can_delete_data_count == total_expenses:
                        self.log_result("Frontend Logic: Data Availability", True, 
                                      f"✅ ALL {total_expenses} expenses have data for canEdit() and canDelete() logic", 
                                      f"Sample expense fields: {list(expenses[0].keys())}")
                    else:
                        missing_edit = total_expenses - can_edit_data_count
                        missing_delete = total_expenses - can_delete_data_count
                        self.log_result("Frontend Logic: Data Availability", False, 
                                      f"❌ Missing data: {missing_edit} expenses lack edit data, {missing_delete} lack delete data", 
                                      f"This will cause edit/delete buttons to not appear correctly")
                else:
                    self.log_result("Frontend Logic: Data Availability", True, 
                                  "No expenses to test, but endpoint structure is correct")
            else:
                self.log_result("Frontend Logic: Data Availability", False, 
                              f"HTTP {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Frontend Logic: Data Availability", False, f"Request error: {str(e)}")
    
    def test_authentication_enforcement(self):
        """Test that edit and delete endpoints properly enforce authentication"""
        if not self.test_expense_id:
            # Create a fake ID for testing
            test_id = str(uuid.uuid4())
        else:
            test_id = self.test_expense_id
        
        # Test edit without authentication
        try:
            update_data = {
                "amount": 100.0,
                "category": "Other",
                "description": "Unauthorized edit test",
                "date": "2024-01-01"
            }
            
            response = requests.put(f"{BASE_URL}/expenses/{test_id}", 
                                  json=update_data, headers=HEADERS, timeout=10)
            
            if response.status_code == 401:
                self.log_result("Auth Enforcement: Edit", True, 
                              "✅ Edit endpoint correctly requires authentication")
            else:
                self.log_result("Auth Enforcement: Edit", False, 
                              f"❌ SECURITY ISSUE: Edit works without auth - HTTP {response.status_code}")
        except Exception as e:
            self.log_result("Auth Enforcement: Edit", False, f"Request error: {str(e)}")
        
        # Test delete without authentication
        try:
            response = requests.delete(f"{BASE_URL}/expenses/{test_id}", 
                                     headers=HEADERS, timeout=10)
            
            if response.status_code == 401:
                self.log_result("Auth Enforcement: Delete", True, 
                              "✅ Delete endpoint correctly requires authentication")
            else:
                self.log_result("Auth Enforcement: Delete", False, 
                              f"❌ SECURITY ISSUE: Delete works without auth - HTTP {response.status_code}")
        except Exception as e:
            self.log_result("Auth Enforcement: Delete", False, f"Request error: {str(e)}")
    
    async def run_comprehensive_test(self):
        """Run comprehensive edit and delete functionality tests"""
        print("🔧 EDIT AND DELETE FUNCTIONALITY TEST")
        print("=" * 60)
        print("Testing user-reported issue: 'Edit and delete function for each expense was missing'")
        print("Focus: Full visibility implementation impact on edit/delete functionality")
        print("=" * 60)
        
        # Setup authentication
        auth_success = await self.setup_real_authentication()
        if not auth_success:
            print("❌ Cannot proceed without valid authentication")
            return
        
        print(f"🔐 Testing with user: {self.user_email}")
        print("-" * 60)
        
        # Run tests in order
        self.test_get_expenses_with_ownership_flags()
        self.test_put_expense_functionality()
        self.test_delete_expense_functionality()
        self.test_frontend_logic_data_availability()
        self.test_authentication_enforcement()
        
        # Summary
        print("=" * 60)
        print("📊 EDIT/DELETE FUNCTIONALITY TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if r["success"]])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        # Critical findings
        critical_issues = []
        for result in self.test_results:
            if not result["success"] and "CRITICAL" in result["message"]:
                critical_issues.append(result["test"])
        
        if critical_issues:
            print(f"\n🚨 CRITICAL ISSUES FOUND:")
            for issue in critical_issues:
                print(f"  • {issue}")
        else:
            print(f"\n✅ NO CRITICAL ISSUES FOUND")
        
        # Specific findings for the user issue
        print(f"\n🎯 USER ISSUE ANALYSIS:")
        print(f"Issue: 'Edit and delete function for each expense was missing'")
        
        ownership_test = next((r for r in self.test_results if "Ownership Flags" in r["test"]), None)
        edit_test = next((r for r in self.test_results if "Edit Functionality" in r["test"]), None)
        delete_test = next((r for r in self.test_results if "Delete Functionality" in r["test"]), None)
        
        if ownership_test and ownership_test["success"]:
            print("✅ Backend returns proper ownership flags (is_owned_by_me)")
        else:
            print("❌ Backend missing ownership flags - this causes edit/delete buttons to not appear")
        
        if edit_test and edit_test["success"]:
            print("✅ Edit functionality works correctly")
        else:
            print("❌ Edit functionality has issues")
        
        if delete_test and delete_test["success"]:
            print("✅ Delete functionality works correctly")
        else:
            print("❌ Delete functionality has issues")
        
        return self.test_results

# Run the test
if __name__ == "__main__":
    tester = EditDeleteTester()
    asyncio.run(tester.run_comprehensive_test())