from fastapi import FastAPI, APIRouter, HTTPException, Query, Request, Depends, Cookie, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
import requests
import asyncio
import pandas as pd
import io
from datetime import datetime, date, timezone, timedelta
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Add global exception handler for validation errors
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logging.error(f"Validation error: {exc.errors()}")
    logging.error(f"Request body: {await request.body()}")
    return JSONResponse(
        status_code=400,
        content={
            "detail": "Validation failed",
            "errors": exc.errors(),
            "message": "Please check your input data"
        }
    )

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Expense Categories Enum
class ExpenseCategory(str, Enum):
    GROCERY = "Grocery"
    FUEL = "Fuel"
    DINING_OUT = "Dining Out"
    SHOPPING = "Shopping"
    BILLS = "Bills"
    HEALTHCARE = "Healthcare"
    ENTERTAINMENT = "Entertainment"
    TRANSPORT = "Transport"
    OTHER = "Other"

# User Role Enum
class UserRole(str, Enum):
    OWNER = "owner"
    CO_OWNER = "co_owner"
    EDITOR = "editor"
    VIEWER = "viewer"

# Authentication Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    picture: str
    role: UserRole = UserRole.VIEWER  # Default role for new users
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# User Management Models
class UserRoleUpdate(BaseModel):
    user_email: str
    new_role: UserRole

class UserCreate(BaseModel):
    email: str
    role: UserRole = UserRole.VIEWER

class UserManagement(BaseModel):
    id: str
    email: str
    name: str
    picture: str
    role: UserRole
    created_at: datetime

class UserSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SessionData(BaseModel):
    id: str
    email: str
    name: str
    picture: str
    session_token: str

# Shared Expense Models
class ExpenseSplit(BaseModel):
    user_email: str
    percentage: float
    amount: float
    paid: bool = False

class SharedExpense(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    amount: float
    category: str
    description: str
    date: date
    created_by: str  # user_id who created the expense
    paid_by: str  # email of person who paid initially
    splits: List[ExpenseSplit]
    is_shared: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SharedExpenseCreate(BaseModel):
    amount: float
    category: str
    description: str
    date: date
    paid_by_email: str  # email of person who paid
    splits: List[Dict[str, Any]]  # [{"email": "user@example.com", "percentage": 50}]

# Regular Expense Models
class Expense(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    amount: float
    category: str
    description: str
    date: date
    user_id: str
    is_shared: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ExpenseCreate(BaseModel):
    amount: float = Field(..., gt=0, description="Amount must be greater than 0")
    category: str = Field(..., min_length=1, description="Category cannot be empty")
    description: str = Field(..., min_length=1, description="Description cannot be empty")
    date: date
    is_shared: bool = Field(default=False)
    shared_data: Optional[Dict[str, Any]] = Field(default=None, description="Shared expense data if is_shared is True")

    class Config:
        json_encoders = {
            date: lambda v: v.isoformat()
        }

class ExpenseUpdate(BaseModel):
    amount: float = Field(..., gt=0, description="Amount must be greater than 0")
    category: str = Field(..., min_length=1, description="Category cannot be empty")
    description: str = Field(..., min_length=1, description="Description cannot be empty")
    date: date

    class Config:
        json_encoders = {
            date: lambda v: v.isoformat()
        }

class ExpenseStats(BaseModel):
    total_expenses: float
    total_individual_expenses: float
    total_shared_expenses: float
    shared_expense_count: int
    category_breakdown: Dict[str, float]
    monthly_trend: List[Dict[str, Any]]
    top_category: Optional[str]
    top_category_amount: float

class CategoryInfo(BaseModel):
    name: str
    color: str
    emoji: str

# Custom Category Models
class CustomCategory(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: str
    emoji: str
    created_by: str  # user_id who created it
    is_system: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CustomCategoryCreate(BaseModel):
    name: str
    color: str = "#007AFF"  # Default blue color
    emoji: str = "📝"

class CustomCategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    emoji: Optional[str] = None

class CategoryResponse(BaseModel):
    id: str
    name: str
    color: str
    emoji: str
    is_system: bool = False
    created_by: Optional[str] = None
    created_at: datetime

# Expense Sharing Models
class ExpenseShare(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    expense_id: str
    shared_with_email: str
    permission: str  # "view" or "edit"
    shared_by: str  # user_id who shared it
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ExpenseShareCreate(BaseModel):
    shared_with_email: str
    permission: str = Field(default="view", description="view or edit")

class ExpenseShareUpdate(BaseModel):
    permission: str = Field(description="view or edit")

# Settlement Models
class Settlement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_user: str
    to_user: str
    amount: float
    description: str
    settled: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Import Models
class ImportPreview(BaseModel):
    total_rows: int
    preview_data: List[Dict[str, Any]]
    detected_columns: Dict[str, str]
    import_stats: Dict[str, Any]  # Changed from Dict[str, int] to allow mixed types

class ImportResult(BaseModel):
    total_imported: int
    successful: int
    failed: int
    errors: List[str]

# Helper functions
def prepare_for_mongo(data):
    """Convert date objects to ISO strings for MongoDB storage"""
    if isinstance(data.get('date'), date):
        data['date'] = data['date'].isoformat()
    if isinstance(data.get('created_at'), datetime):
        data['created_at'] = data['created_at'].isoformat()
    if isinstance(data.get('expires_at'), datetime):
        data['expires_at'] = data['expires_at'].isoformat()
    return data

def parse_from_mongo(item):
    """Parse date strings back to date objects from MongoDB"""
    if isinstance(item.get('date'), str):
        item['date'] = datetime.fromisoformat(item['date']).date()
    if isinstance(item.get('created_at'), str):
        item['created_at'] = datetime.fromisoformat(item['created_at'])
    if isinstance(item.get('expires_at'), str):
        item['expires_at'] = datetime.fromisoformat(item['expires_at'])
    return item

# Authentication helper
async def get_current_user(request: Request, session_token: Optional[str] = Cookie(None)) -> Optional[User]:
    """Get current authenticated user from session token in cookie or Authorization header"""
    # First try cookie
    token = session_token
    
    # If no cookie, try Authorization header
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    
    if not token:
        return None
    
    try:
        # Find valid session
        session = await db.user_sessions.find_one({
            "session_token": token,
            "expires_at": {"$gt": datetime.now(timezone.utc).isoformat()}
        })
        
        if not session:
            return None
        
        # Get user data
        user_data = await db.users.find_one({"id": session["user_id"]})
        if not user_data:
            return None
        
        return User(**parse_from_mongo(user_data))
    except Exception as e:
        logging.error(f"Error getting current user: {e}")
        return None

async def require_auth(request: Request, session_token: Optional[str] = Cookie(None)) -> User:
    """Require authentication, raise 401 if not authenticated"""
    user = await get_current_user(request, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user

# Helper function to find user by email
async def find_user_by_email(email: str) -> Optional[User]:
    """Find user by email address"""
    try:
        user_data = await db.users.find_one({"email": email})
        if user_data:
            return User(**parse_from_mongo(user_data))
        return None
    except Exception as e:
        logging.error(f"Error finding user by email: {e}")
        return None

# Role-based permission helper functions
async def require_role(user: User, allowed_roles: List[UserRole]) -> bool:
    """Check if user has one of the allowed roles"""
    return user.role in allowed_roles

async def require_admin_role(user: User = Depends(require_auth)) -> User:
    """Require Owner or Co-owner role"""
    if user.role not in [UserRole.OWNER, UserRole.CO_OWNER]:
        raise HTTPException(status_code=403, detail="Owner or Co-owner role required")
    return user

def can_edit_expense(user: User, expense_user_id: str) -> bool:
    """Check if user can edit an expense"""
    # Owner and Co-owner can edit any expense
    if user.role in [UserRole.OWNER, UserRole.CO_OWNER]:
        return True
    # Editor can edit their own expenses
    if user.role == UserRole.EDITOR and user.id == expense_user_id:
        return True
    return False

def can_delete_expense(user: User, expense_user_id: str) -> bool:
    """Check if user can delete an expense"""
    # Owner and Co-owner can delete any expense
    if user.role in [UserRole.OWNER, UserRole.CO_OWNER]:
        return True
    # Editor can delete their own expenses
    if user.role == UserRole.EDITOR and user.id == expense_user_id:
        return True
    return False

def can_share_expense(user: User, expense_user_id: str) -> bool:
    """Check if user can share an expense"""
    # Owner can share any expense
    if user.role == UserRole.OWNER:
        return True
    # Editor can share their own expenses
    if user.role == UserRole.EDITOR and user.id == expense_user_id:
        return True
    return False

# Helper function to check expense access
async def check_expense_access(expense_id: str, user: User, required_permission: str = "view") -> bool:
    """Check if user has access to an expense"""
    try:
        # Check if user owns the expense
        expense = await db.expenses.find_one({"id": expense_id, "user_id": user.id})
        if expense:
            return True  # Owner has full access
        
        # Check if expense is shared with user
        share = await db.expense_shares.find_one({
            "expense_id": expense_id,
            "shared_with_email": user.email
        })
        
        if not share:
            return False
        
        # Check permission level
        if required_permission == "edit" and share["permission"] != "edit":
            return False
        
        return True
    except Exception as e:
        logging.error(f"Error checking expense access: {e}")
        return False

async def get_accessible_expenses(user: User, filter_query: dict) -> List[dict]:
    """Get ALL expenses for full visibility across all users"""
    try:
        # Get ALL expenses (not just user-specific ones) for full visibility
        all_expenses = await db.expenses.find(filter_query).to_list(length=None)
        
        # Get shares for this user to mark shared expenses
        shares = await db.expense_shares.find({"shared_with_email": user.email}).to_list(length=None)
        shared_expense_ids = [share["expense_id"] for share in shares]
        
        # Process each expense to add proper flags
        for expense in all_expenses:
            # Mark if user owns this expense
            if expense.get("user_id") == user.id:
                expense["is_owned_by_me"] = True
            else:
                expense["is_owned_by_me"] = False
            
            # Add role-based permission flags for frontend
            expense["can_edit"] = can_edit_expense(user, expense.get("user_id"))
            expense["can_delete"] = can_delete_expense(user, expense.get("user_id"))
            expense["can_share"] = can_share_expense(user, expense.get("user_id"))
            
            # Mark if expense is shared with this user
            if expense["id"] in shared_expense_ids:
                share = next((s for s in shares if s["expense_id"] == expense["id"]), None)
                if share:
                    expense["shared_permission"] = share["permission"]
                    expense["is_shared_with_me"] = True
            
            # Check if expense has any shares (is shared with others)
            expense_shares = await db.expense_shares.find({"expense_id": expense["id"]}).to_list(length=None)
            if expense_shares:
                expense["is_shared"] = True
        
        # Sort by date (most recent first)
        all_expenses.sort(key=lambda x: x.get("date", ""), reverse=True)
        
        return all_expenses
    except Exception as e:
        logging.error(f"Error getting accessible expenses: {e}")
        return []

# Category configurations with Apple-like colors
CATEGORY_CONFIG = {
    ExpenseCategory.GROCERY: {"color": "#34C759", "emoji": "🛒"},
    ExpenseCategory.FUEL: {"color": "#FF9500", "emoji": "⛽"},
    ExpenseCategory.DINING_OUT: {"color": "#FF3B30", "emoji": "🍽️"},
    ExpenseCategory.SHOPPING: {"color": "#AF52DE", "emoji": "🛍️"},
    ExpenseCategory.BILLS: {"color": "#007AFF", "emoji": "📋"},
    ExpenseCategory.HEALTHCARE: {"color": "#FF2D92", "emoji": "🏥"},
    ExpenseCategory.ENTERTAINMENT: {"color": "#5AC8FA", "emoji": "🎬"},
    ExpenseCategory.TRANSPORT: {"color": "#FFCC02", "emoji": "🚗"},
    ExpenseCategory.OTHER: {"color": "#8E8E93", "emoji": "📦"},
}

# Initialize system categories on startup
async def initialize_system_categories():
    """Initialize system categories in database"""
    try:
        for category, config in CATEGORY_CONFIG.items():
            existing = await db.categories.find_one({
                "name": category.value,
                "is_system": True
            })
            
            if not existing:
                system_category = CustomCategory(
                    name=category.value,
                    color=config["color"],
                    icon=config["icon"],
                    created_by="system",
                    is_system=True
                )
                await db.categories.insert_one(prepare_for_mongo(system_category.dict()))
                logging.info(f"Initialized system category: {category.value}")
    except Exception as e:
        logging.error(f"Error initializing system categories: {e}")

# Authentication Routes
@api_router.post("/auth/session-data")
async def process_session_data(request: Request):
    """Process session ID from Emergent Auth and create user session"""
    try:
        session_id = request.headers.get("X-Session-ID")
        if not session_id:
            raise HTTPException(status_code=400, detail="X-Session-ID header required")
        
        # Call Emergent Auth API to get session data
        auth_response = requests.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
            timeout=10
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Invalid session ID")
        
        session_data = auth_response.json()
        
        # Check if user exists, if not create them
        existing_user = await db.users.find_one({"email": session_data["email"]})
        
        if not existing_user:
            # Check if this is the first user (should be Owner) or specific owner email
            user_count = await db.users.count_documents({})
            
            # Determine role: specific owner email or first user gets Owner role
            user_role = UserRole.OWNER if (user_count == 0 or session_data["email"] == "sijujiampugi@gmail.com") else UserRole.VIEWER
            
            # Create new user
            new_user = User(
                email=session_data["email"],
                name=session_data["name"],
                picture=session_data["picture"],
                role=user_role
            )
            await db.users.insert_one(prepare_for_mongo(new_user.dict()))
            user_id = new_user.id
            
            logging.info(f"Created new user {session_data['email']} with role {new_user.role} (user count was {user_count})")
        else:
            # Check if existing user is the specific owner email and update role if needed
            if session_data["email"] == "sijujiampugi@gmail.com" and existing_user.get("role") != UserRole.OWNER.value:
                await db.users.update_one(
                    {"email": session_data["email"]},
                    {"$set": {"role": UserRole.OWNER.value}}
                )
                logging.info(f"Updated {session_data['email']} to Owner role")
            
            user_id = existing_user["id"]
        
        # Create session with 7-day expiry
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        user_session = UserSession(
            user_id=user_id,
            session_token=session_data["session_token"],
            expires_at=expires_at
        )
        
        await db.user_sessions.insert_one(prepare_for_mongo(user_session.dict()))
        
        # Create response with httpOnly cookie
        response_data = SessionData(
            id=user_id,
            email=session_data["email"],
            name=session_data["name"],
            picture=session_data["picture"],
            session_token=session_data["session_token"]
        )
        
        response = JSONResponse(content=response_data.dict())
        response.set_cookie(
            key="session_token",
            value=session_data["session_token"],
            httponly=True,
            secure=True,
            samesite="none",
            path="/",
            max_age=7 * 24 * 60 * 60  # 7 days
        )
        
        return response
        
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=400, detail=f"Auth service error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")

@api_router.get("/auth/me")
async def get_current_user_info(user: User = Depends(require_auth)):
    """Get current authenticated user information"""
    return user

@api_router.post("/auth/logout")
async def logout(request: Request, session_token: Optional[str] = Cookie(None)):
    """Logout user by deleting session"""
    try:
        token = session_token
        if not token:
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
        
        if token:
            await db.user_sessions.delete_one({"session_token": token})
        
        response = JSONResponse(content={"message": "Logged out successfully"})
        response.delete_cookie(key="session_token", path="/")
        return response
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Logout error: {str(e)}")

# User Management Routes
@api_router.get("/users", response_model=List[UserManagement])
async def get_all_users(admin_user: User = Depends(require_admin_role)):
    """Get all users in the system (Owner/Co-owner only)"""
    try:
        users = await db.users.find({}).to_list(length=None)
        result = []
        for user_data in users:
            user = parse_from_mongo(user_data)
            result.append(UserManagement(
                id=user["id"],
                email=user["email"],
                name=user["name"],
                picture=user["picture"],
                role=UserRole(user.get("role", UserRole.VIEWER)),
                created_at=user["created_at"]
            ))
        
        # Sort by role hierarchy (Owner -> Co-owner -> Editor -> Viewer) then by name
        role_order = {UserRole.OWNER: 0, UserRole.CO_OWNER: 1, UserRole.EDITOR: 2, UserRole.VIEWER: 3}
        result.sort(key=lambda x: (role_order.get(x.role, 4), x.name.lower()))
        
        return result
    except Exception as e:
        logging.error(f"Error getting users: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/users/assign-role")
async def assign_user_role(role_data: UserRoleUpdate, admin_user: User = Depends(require_admin_role)):
    """Assign role to user by email (Owner/Co-owner only)"""
    try:
        # Check if user exists
        user_data = await db.users.find_one({"email": role_data.user_email})
        if not user_data:
            # Create user entry if they don't exist (they'll be fully created when they first login)
            new_user_id = str(uuid.uuid4())
            await db.users.insert_one({
                "id": new_user_id,
                "email": role_data.user_email,
                "name": role_data.user_email.split("@")[0],  # Temporary name
                "picture": "",  # Will be updated on first login
                "role": role_data.new_role.value,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            return {"message": f"User {role_data.user_email} created with role {role_data.new_role.value}"}
        
        # Update existing user's role
        await db.users.update_one(
            {"email": role_data.user_email},
            {"$set": {"role": role_data.new_role.value}}
        )
        
        return {"message": f"Role updated for {role_data.user_email} to {role_data.new_role.value}"}
    except Exception as e:
        logging.error(f"Error assigning role: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/users/{user_email}")
async def remove_user(user_email: str, admin_user: User = Depends(require_admin_role)):
    """Remove user from system (Owner/Co-owner only)"""
    try:
        # Prevent removing yourself
        if user_email == admin_user.email:
            raise HTTPException(status_code=400, detail="Cannot remove yourself from the system")
        
        # Check if user exists
        user_data = await db.users.find_one({"email": user_email})
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_id = user_data["id"]
        
        # Remove user and their data
        await db.users.delete_one({"email": user_email})
        
        # Remove user's expenses (optional - you might want to reassign them instead)
        await db.expenses.delete_many({"user_id": user_id})
        
        # Remove user's expense shares
        await db.expense_shares.delete_many({"shared_with_email": user_email})
        
        # Remove user's sessions
        await db.sessions.delete_many({"user_id": user_id})
        
        return {"message": f"User {user_email} and their data removed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error removing user: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/users/roles")
async def get_available_roles(user: User = Depends(require_auth)):
    """Get available roles for dropdown"""
    return {
        "roles": [
            {"value": UserRole.OWNER, "label": "Owner - Full access to all expenses and user management"},
            {"value": UserRole.CO_OWNER, "label": "Co-owner - Full access to all expenses and user management"},
            {"value": UserRole.EDITOR, "label": "Editor - Can edit own expenses"},
            {"value": UserRole.VIEWER, "label": "Viewer - Can only view expenses"}
        ]
    }

# Category Routes
@api_router.get("/categories", response_model=List[CategoryInfo])
async def get_categories(user: User = Depends(require_auth)):
    """Get all categories (system + custom)"""
    try:
        # Get all categories (system + user's custom categories)
        categories = await db.categories.find({
            "$or": [
                {"is_system": True},
                {"created_by": user.id}
            ]
        }).to_list(length=None)
        
        result = []
        for cat in categories:
            result.append(CategoryInfo(
                name=cat["name"],
                color=cat["color"],
                icon=cat["icon"]
            ))
        
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/categories", response_model=CustomCategory)
async def create_custom_category(category_data: CustomCategoryCreate, user: User = Depends(require_auth)):
    """Create a new custom category"""
    try:
        # Check if category name already exists for this user or as system category
        existing = await db.categories.find_one({
            "name": category_data.name,
            "$or": [
                {"is_system": True},
                {"created_by": user.id}
            ]
        })
        
        if existing:
            raise HTTPException(status_code=400, detail="Category name already exists")
        
        custom_category = CustomCategory(
            name=category_data.name,
            color=category_data.color,
            icon=category_data.icon,
            created_by=user.id,
            is_system=False
        )
        
        await db.categories.insert_one(prepare_for_mongo(custom_category.dict()))
        return custom_category
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Expense Routes
@api_router.get("/")
async def root():
    return {"message": "SpendWise API - Enhanced Expense Tracking with Shared Expenses"}

@api_router.post("/expenses", response_model=Expense)
async def create_expense(expense_data: ExpenseCreate, user: User = Depends(require_auth)):
    """Create a new expense (shared or individual)"""
    try:
        logging.info(f"Creating expense for user {user.email}: {expense_data.dict()}")
        
        if expense_data.is_shared and expense_data.shared_data:
            # Create shared expense
            shared_data = expense_data.shared_data
            logging.info(f"Processing shared expense: {shared_data}")
            
            # Validate shared_data structure
            if not isinstance(shared_data, dict):
                raise HTTPException(status_code=400, detail="shared_data must be an object")
            
            # Validate required fields in shared_data
            if "paid_by_email" not in shared_data:
                raise HTTPException(status_code=400, detail="paid_by_email is required for shared expenses")
            
            if "splits" not in shared_data or not isinstance(shared_data["splits"], list):
                raise HTTPException(status_code=400, detail="splits array is required for shared expenses")
            
            # Validate email format for paid_by_email
            paid_by_email = shared_data["paid_by_email"]
            if not paid_by_email or "@" not in paid_by_email:
                raise HTTPException(status_code=400, detail="Invalid paid by email format")
            
            # Calculate splits
            splits = []
            total_percentage = 0
            
            for i, split_data in enumerate(shared_data["splits"]):
                if not isinstance(split_data, dict):
                    raise HTTPException(status_code=400, detail=f"Split {i+1} must be an object")
                
                if "email" not in split_data or "percentage" not in split_data:
                    raise HTTPException(status_code=400, detail=f"Split {i+1} must have email and percentage")
                
                email = split_data["email"]
                if not email or "@" not in email:
                    raise HTTPException(status_code=400, detail=f"Invalid email in split {i+1}: {email}")
                
                try:
                    percentage = float(split_data["percentage"])
                except (ValueError, TypeError):
                    raise HTTPException(status_code=400, detail=f"Invalid percentage in split {i+1}")
                
                if percentage <= 0 or percentage > 100:
                    raise HTTPException(status_code=400, detail=f"Split percentage must be between 0 and 100, got {percentage}")
                
                amount = (expense_data.amount * percentage) / 100
                total_percentage += percentage
                
                splits.append(ExpenseSplit(
                    user_email=email,
                    percentage=percentage,
                    amount=amount,
                    paid=(email == paid_by_email)
                ))
            
            if abs(total_percentage - 100) > 0.01:
                raise HTTPException(status_code=400, detail=f"Split percentages must total 100%, got {total_percentage}%")
            
            logging.info(f"Creating shared expense with {len(splits)} splits, total {total_percentage}%")
            
            # Create shared expense record
            shared_expense = SharedExpense(
                amount=expense_data.amount,
                category=expense_data.category,
                description=expense_data.description,
                date=expense_data.date,
                created_by=user.id,
                paid_by=paid_by_email,  # Store email instead of user_id
                splits=splits
            )
            
            await db.shared_expenses.insert_one(prepare_for_mongo(shared_expense.dict()))
            logging.info(f"Shared expense created with ID: {shared_expense.id}")
            
            # Create individual expense record for the current user (their portion)
            user_split = next((s for s in splits if s.user_email == user.email), None)
            if user_split:
                individual_expense = Expense(
                    amount=user_split.amount,
                    category=expense_data.category,
                    description=f"[SHARED] {expense_data.description}",
                    date=expense_data.date,
                    user_id=user.id,
                    is_shared=True
                )
                await db.expenses.insert_one(prepare_for_mongo(individual_expense.dict()))
                logging.info(f"Individual expense created for user {user.email}: {user_split.amount}")
                return individual_expense
            else:
                # If current user is not in splits, create with 0 amount for tracking
                individual_expense = Expense(
                    amount=0,
                    category=expense_data.category,
                    description=f"[SHARED - CREATED] {expense_data.description}",
                    date=expense_data.date,
                    user_id=user.id,
                    is_shared=True
                )
                await db.expenses.insert_one(prepare_for_mongo(individual_expense.dict()))
                logging.info(f"Creator expense created for user {user.email} (not in splits)")
                return individual_expense
        
        else:
            # Create regular individual expense
            logging.info(f"Creating individual expense")
            expense = Expense(**expense_data.dict(), user_id=user.id)
            expense_dict = prepare_for_mongo(expense.dict())
            await db.expenses.insert_one(expense_dict)
            logging.info(f"Individual expense created with ID: {expense.id}")
            return expense
            
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Unexpected error creating expense: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@api_router.get("/expenses")
async def get_expenses(
    user: User = Depends(require_auth),
    month: Optional[int] = Query(None, description="Filter by month (1-12)"),
    year: Optional[int] = Query(None, description="Filter by year"),
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(100, description="Maximum number of expenses to return")
):
    """Get expenses with optional filtering (includes shared expenses)"""
    try:
        # Build filter query
        filter_query = {}
        
        if month or year:
            date_filter = {}
            if year:
                start_date = f"{year}-01-01"
                end_date = f"{year}-12-31"
                if month:
                    start_date = f"{year}-{month:02d}-01"
                    # Get last day of the month
                    if month == 12:
                        end_date = f"{year + 1}-01-01"
                    else:
                        end_date = f"{year}-{month + 1:02d}-01"
                
                filter_query["date"] = {"$gte": start_date, "$lt": end_date}
        
        if category:
            filter_query["category"] = category
        
        # Get accessible expenses (own + shared)
        expenses = await get_accessible_expenses(user, filter_query)
        
        # Apply limit
        expenses = expenses[:limit]
        
        # Convert to response format (keep as dicts to preserve additional fields)
        result = []
        for expense in expenses:
            expense_data = parse_from_mongo(expense)
            
            # Create base expense dict with all required fields
            expense_dict = {
                "id": expense_data.get("id"),
                "amount": expense_data.get("amount"),
                "category": expense_data.get("category"),
                "description": expense_data.get("description"),
                "date": expense_data.get("date"),
                "user_id": expense_data.get("user_id"),
                "is_shared": expense_data.get("is_shared", False),
                "created_at": expense_data.get("created_at")
            }
            
            # Add additional fields for sharing info and frontend logic
            # Always include is_owned_by_me (True or False) for frontend canEdit/canDelete logic
            expense_dict["is_owned_by_me"] = expense.get("is_owned_by_me", False)
            
            # CRITICAL FIX: Include role-based permission flags for frontend
            expense_dict["can_edit"] = expense.get("can_edit", False)
            expense_dict["can_delete"] = expense.get("can_delete", False)
            expense_dict["can_share"] = expense.get("can_share", False)
            
            if expense.get("shared_permission"):
                expense_dict["shared_permission"] = expense["shared_permission"]
            if expense.get("is_shared_with_me"):
                expense_dict["is_shared_with_me"] = True
            
            result.append(expense_dict)
        
        return result
    except Exception as e:
        logging.error(f"Error getting expenses: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/expenses/stats", response_model=ExpenseStats)
async def get_expense_stats(
    user: User = Depends(require_auth),
    month: Optional[int] = Query(None, description="Filter by month (1-12)"),
    year: Optional[int] = Query(None, description="Filter by year")
):
    """Get expense statistics for charts and analysis"""
    try:
        # Default to current month if no parameters provided
        current_date = datetime.now()
        if not year:
            year = current_date.year
        if not month:
            month = current_date.month
        
        # Build date filter for ALL expenses (full visibility)
        start_date = f"{year}-{month:02d}-01"
        if month == 12:
            end_date = f"{year + 1}-01-01"
        else:
            end_date = f"{year}-{month + 1:02d}-01"
        
        # FULL VISIBILITY: Show stats for ALL expenses, not just user-specific ones
        filter_query = {
            "date": {"$gte": start_date, "$lt": end_date}
        }
        
        logging.info(f"Getting dashboard stats for user {user.email} (role: {user.role}) - showing ALL expenses for {month}/{year}")
        expenses = await db.expenses.find(filter_query).to_list(length=None)
        logging.info(f"Found {len(expenses)} total expenses for dashboard stats")
        
        # Calculate statistics
        total_expenses = sum(expense["amount"] for expense in expenses)
        
        # Separate individual and shared expenses
        individual_expenses = [exp for exp in expenses if not exp.get("is_shared", False)]
        shared_expenses = [exp for exp in expenses if exp.get("is_shared", False)]
        
        total_individual_expenses = sum(expense["amount"] for expense in individual_expenses)
        total_shared_expenses = sum(expense["amount"] for expense in shared_expenses)
        shared_expense_count = len(shared_expenses)
        
        # Category breakdown (all expenses)
        category_breakdown = {}
        for expense in expenses:
            category = expense["category"]
            category_breakdown[category] = category_breakdown.get(category, 0) + expense["amount"]
        
        # Find top category
        top_category = None
        top_category_amount = 0
        if category_breakdown:
            top_category = max(category_breakdown, key=category_breakdown.get)
            top_category_amount = category_breakdown[top_category]
        
        # Monthly trend (last 6 months)
        monthly_trend = []
        for i in range(6):
            trend_month = month - i
            trend_year = year
            if trend_month <= 0:
                trend_month += 12
                trend_year -= 1
            
            trend_start = f"{trend_year}-{trend_month:02d}-01"
            if trend_month == 12:
                trend_end = f"{trend_year + 1}-01-01"
            else:
                trend_end = f"{trend_year}-{trend_month + 1:02d}-01"
            
            # FULL VISIBILITY: Show trend data for ALL expenses
            trend_filter = {
                "date": {"$gte": trend_start, "$lt": trend_end}
            }
            
            trend_expenses = await db.expenses.find(trend_filter).to_list(length=None)
            trend_total = sum(exp["amount"] for exp in trend_expenses)
            
            monthly_trend.append({
                "month": f"{trend_year}-{trend_month:02d}",
                "amount": trend_total
            })
        
        monthly_trend.reverse()  # Show oldest to newest
        
        return ExpenseStats(
            total_expenses=total_expenses,
            total_individual_expenses=total_individual_expenses,
            total_shared_expenses=total_shared_expenses,
            shared_expense_count=shared_expense_count,
            category_breakdown=category_breakdown,
            monthly_trend=monthly_trend,
            top_category=top_category,
            top_category_amount=top_category_amount
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.put("/expenses/{expense_id}", response_model=Expense)
async def update_expense(expense_id: str, expense_data: ExpenseUpdate, user: User = Depends(require_auth)):
    """Update an existing expense (role-based access control)"""
    try:
        logging.info(f"Updating expense {expense_id} for user {user.email} (role: {user.role}): {expense_data.dict()}")
        
        # Get the expense first to check ownership
        existing_expense = await db.expenses.find_one({"id": expense_id})
        if not existing_expense:
            raise HTTPException(status_code=404, detail="Expense not found")
        
        # Check role-based edit permissions
        if not can_edit_expense(user, existing_expense["user_id"]):
            raise HTTPException(status_code=403, detail="You don't have permission to edit this expense")
        
        logging.info(f"Edit permission granted for user {user.email} (role: {user.role}) on expense owned by {existing_expense['user_id']}")
        
        # Parse existing expense
        existing_expense = parse_from_mongo(existing_expense)
        
        # Update fields (keep original user_id and other metadata)
        updated_expense = Expense(
            id=expense_id,
            amount=expense_data.amount,
            category=expense_data.category,
            description=expense_data.description,
            date=expense_data.date,
            user_id=existing_expense.get("user_id"),  # Keep original owner
            is_shared=existing_expense.get("is_shared", False),
            created_at=existing_expense.get("created_at", datetime.now(timezone.utc))
        )
        
        # Update in database
        expense_dict = prepare_for_mongo(updated_expense.dict())
        await db.expenses.update_one(
            {"id": expense_id},
            {"$set": expense_dict}
        )
        
        logging.info(f"Expense {expense_id} updated successfully by {user.email}")
        return updated_expense
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating expense: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user: User = Depends(require_auth)):
    """Delete an expense (role-based access control)"""
    try:
        logging.info(f"Delete request for expense {expense_id} by user {user.email} (role: {user.role})")
        
        # Get the expense first to check ownership
        existing_expense = await db.expenses.find_one({"id": expense_id})
        if not existing_expense:
            raise HTTPException(status_code=404, detail="Expense not found")
        
        # Check role-based delete permissions
        if not can_delete_expense(user, existing_expense["user_id"]):
            raise HTTPException(status_code=403, detail="You don't have permission to delete this expense")
        
        logging.info(f"Delete permission granted for user {user.email} (role: {user.role}) on expense owned by {existing_expense['user_id']}")
        
        # Add debugging to check expense fields before deletion
        logging.info(f"Expense to delete - ID: {expense_id}, Fields: {list(existing_expense.keys())}")
        logging.info(f"Expense is_shared value: {existing_expense.get('is_shared', 'FIELD_NOT_FOUND')}")
        
        # Delete the expense
        result = await db.expenses.delete_one({"id": expense_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Failed to delete expense")
        
        # Also delete any shares of this expense
        await db.expense_shares.delete_many({"expense_id": expense_id})
        
        # CRITICAL FIX: Clean up related shared_expenses records
        # When deleting a shared expense from main expenses tab, we need to remove
        # the corresponding record from shared_expenses collection
        original_description = existing_expense["description"]
        is_shared_expense = existing_expense.get("is_shared", False)
        has_shared_prefix = (original_description.startswith("[SHARED") or 
                           "shared" in original_description.lower())
        
        logging.info(f"Shared expense cleanup check - is_shared: {is_shared_expense}, has_prefix: {has_shared_prefix}")
        
        # Check if this is a shared expense (either by flag OR by description pattern)
        if is_shared_expense or has_shared_prefix:
            logging.info("This is a shared expense - proceeding with shared_expenses cleanup")
            
            # Remove the [SHARED] or [SHARED - CREATED] prefix to get original description
            clean_description = original_description
            if original_description.startswith("[SHARED - CREATED] "):
                clean_description = original_description[19:]  # Remove "[SHARED - CREATED] "
            elif original_description.startswith("[SHARED] "):
                clean_description = original_description[9:]   # Remove "[SHARED] "
            
            logging.info(f"Cleaning description from '{original_description}' to '{clean_description}'")
            
            # Find and delete matching shared expense records
            # Try multiple matching strategies since data structure might vary
            
            # Strategy 1: Exact match with clean description
            shared_expense_filter = {
                "created_by": existing_expense["user_id"],
                "category": existing_expense["category"],
                "description": clean_description,
                "date": existing_expense["date"]
            }
            
            logging.info(f"Strategy 1 - Searching with filter: {shared_expense_filter}")
            deleted_shared = await db.shared_expenses.delete_many(shared_expense_filter)
            
            if deleted_shared.deleted_count > 0:
                logging.info(f"✅ Strategy 1 SUCCESS: Deleted {deleted_shared.deleted_count} shared expense records")
            else:
                logging.warning(f"⚠️ Strategy 1 FAILED: No matches found")
                
                # Strategy 2: Match with original description (in case no prefix cleanup needed)
                alt_filter_1 = {
                    "created_by": existing_expense["user_id"],
                    "category": existing_expense["category"],
                    "description": original_description,
                    "date": existing_expense["date"]
                }
                
                logging.info(f"Strategy 2 - Searching with original description: {alt_filter_1}")
                deleted_alt_1 = await db.shared_expenses.delete_many(alt_filter_1)
                
                if deleted_alt_1.deleted_count > 0:
                    logging.info(f"✅ Strategy 2 SUCCESS: Deleted {deleted_alt_1.deleted_count} shared expense records")
                else:
                    logging.warning(f"⚠️ Strategy 2 FAILED: No matches with original description")
                    
                    # Strategy 3: Try matching by description only (ignore amount differences due to splitting)
                    alt_filter_2 = {
                        "description": clean_description,
                        "created_by": existing_expense["user_id"],
                        "date": existing_expense["date"]
                    }
                    
                    logging.info(f"Strategy 3 - Flexible matching: {alt_filter_2}")
                    deleted_alt_2 = await db.shared_expenses.delete_many(alt_filter_2)
                    
                    if deleted_alt_2.deleted_count > 0:
                        logging.info(f"✅ Strategy 3 SUCCESS: Deleted {deleted_alt_2.deleted_count} shared expense records")
                    else:
                        logging.warning(f"⚠️ Strategy 3 FAILED: No flexible matches found")
                        
                        # Strategy 4: Last resort - show what's actually in the database for debugging
                        logging.warning("🔍 DEBUGGING: Showing all shared expenses for this user:")
                        debug_records = await db.shared_expenses.find({"created_by": existing_expense["user_id"]}).to_list(length=10)
                        for i, record in enumerate(debug_records):
                            logging.warning(f"  Record {i+1}: description='{record.get('description')}', category='{record.get('category')}', date='{record.get('date')}', amount={record.get('amount')}")
                            
            total_deleted = deleted_shared.deleted_count + (deleted_alt_1.deleted_count if 'deleted_alt_1' in locals() else 0) + (deleted_alt_2.deleted_count if 'deleted_alt_2' in locals() else 0)
            if total_deleted > 0:
                logging.info(f"🎉 TOTAL CLEANUP SUCCESS: Deleted {total_deleted} shared expense records for expense {expense_id}")
        else:
            logging.info("This is not a shared expense - skipping shared_expenses cleanup")
        return {"message": "Expense deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Expense Sharing Routes
@api_router.post("/expenses/{expense_id}/share")
async def share_expense(expense_id: str, share_data: ExpenseShareCreate, user: User = Depends(require_auth)):
    """Share an expense with another user (role-based access control)"""
    try:
        logging.info(f"Sharing expense {expense_id} with {share_data.shared_with_email} by {user.email} (role: {user.role})")
        
        # Get the expense first to check ownership
        expense = await db.expenses.find_one({"id": expense_id})
        if not expense:
            raise HTTPException(status_code=404, detail="Expense not found")
        
        # Check role-based share permissions
        if not can_share_expense(user, expense["user_id"]):
            raise HTTPException(status_code=403, detail="You don't have permission to share this expense")
        
        logging.info(f"Share permission granted for user {user.email} (role: {user.role}) on expense owned by {expense['user_id']}")
        
        # Validate permission level
        if share_data.permission not in ["view", "edit"]:
            raise HTTPException(status_code=400, detail="Permission must be 'view' or 'edit'")
        
        # Validate email format
        if "@" not in share_data.shared_with_email:
            raise HTTPException(status_code=400, detail="Invalid email address")
        
        # Don't allow sharing with self
        if share_data.shared_with_email == user.email:
            raise HTTPException(status_code=400, detail="You cannot share an expense with yourself")
        
        # Check if already shared with this user
        existing_share = await db.expense_shares.find_one({
            "expense_id": expense_id,
            "shared_with_email": share_data.shared_with_email
        })
        
        if existing_share:
            # Update existing share
            await db.expense_shares.update_one(
                {"id": existing_share["id"]},
                {"$set": {"permission": share_data.permission}}
            )
            message = "Share updated successfully"
        else:
            # Create new share
            expense_share = ExpenseShare(
                expense_id=expense_id,
                shared_with_email=share_data.shared_with_email,
                permission=share_data.permission,
                shared_by=user.id
            )
            await db.expense_shares.insert_one(prepare_for_mongo(expense_share.dict()))
            message = "Expense shared successfully"
        
        logging.info(f"Expense {expense_id} shared with {share_data.shared_with_email}")
        return {"message": message}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error sharing expense: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/expenses/{expense_id}/shares")
async def get_expense_shares(expense_id: str, user: User = Depends(require_auth)):
    """Get all shares for an expense (owner only)"""
    try:
        # Check if user owns the expense
        expense = await db.expenses.find_one({"id": expense_id, "user_id": user.id})
        if not expense:
            raise HTTPException(status_code=404, detail="Expense not found or you don't have permission to view shares")
        
        shares = await db.expense_shares.find({"expense_id": expense_id}).to_list(length=None)
        
        result = []
        for share in shares:
            result.append({
                "id": share["id"],
                "shared_with_email": share["shared_with_email"],
                "permission": share["permission"],
                "created_at": share["created_at"]
            })
        
        return {"shares": result}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting expense shares: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/expenses/{expense_id}/shares/{share_id}")
async def remove_expense_share(expense_id: str, share_id: str, user: User = Depends(require_auth)):
    """Remove a share (owner only)"""
    try:
        # Check if user owns the expense
        expense = await db.expenses.find_one({"id": expense_id, "user_id": user.id})
        if not expense:
            raise HTTPException(status_code=404, detail="Expense not found or you don't have permission")
        
        # Delete the share
        result = await db.expense_shares.delete_one({"id": share_id, "expense_id": expense_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Share not found")
        
        return {"message": "Share removed successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error removing expense share: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# Shared Expenses Routes
@api_router.get("/shared-expenses", response_model=List[SharedExpense])
async def get_shared_expenses(user: User = Depends(require_auth)):
    """Get shared expenses where user is involved"""
    try:
        # Find shared expenses where user is in splits or created by user
        shared_expenses = await db.shared_expenses.find({
            "$or": [
                {"created_by": user.id},
                {"splits.user_email": user.email}
            ]
        }).sort("date", -1).to_list(length=None)
        
        result = []
        for expense in shared_expenses:
            result.append(SharedExpense(**parse_from_mongo(expense)))
        
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/settlements")
async def get_settlements(user: User = Depends(require_auth)):
    """Get settlement balances for current user"""
    try:
        # Calculate who owes what based on shared expenses
        balances = {}
        
        # Get all shared expenses involving this user
        shared_expenses = await db.shared_expenses.find({
            "splits.user_email": user.email
        }).to_list(length=None)
        
        for expense in shared_expenses:
            paid_by_email = expense["paid_by"]
                
            for split in expense["splits"]:
                if split["user_email"] == user.email and not split["paid"]:
                    # Current user owes money
                    if paid_by_email != user.email:  # Don't owe yourself
                        if paid_by_email not in balances:
                            balances[paid_by_email] = {"owes": 0, "owed": 0}
                        balances[paid_by_email]["owes"] += split["amount"]
                
                elif split["user_email"] != user.email and paid_by_email == user.email:
                    # Current user is owed money
                    owed_by = split["user_email"]
                    if owed_by not in balances:
                        balances[owed_by] = {"owes": 0, "owed": 0}
                    balances[owed_by]["owed"] += split["amount"]
        
        # Calculate net balances
        net_balances = []
        for person, amounts in balances.items():
            net_amount = amounts["owed"] - amounts["owes"]
            if abs(net_amount) > 0.01:  # Only show significant balances
                net_balances.append({
                    "person": person,
                    "amount": abs(net_amount),
                    "type": "owed_to_you" if net_amount > 0 else "you_owe"
                })
        
        return {"balances": net_balances}
    except Exception as e:
        logging.error(f"Error getting settlements: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# Spreadsheet Import Routes
@api_router.post("/import/preview")
async def preview_import(file: UploadFile = File(...), user: User = Depends(require_auth)):
    """Preview spreadsheet import with smart column detection"""
    try:
        logging.info(f"Import preview requested by user {user.email} for file: {file.filename}")
        
        if not file.filename.endswith(('.csv', '.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="Only CSV and Excel files are supported")
        
        # Read file content
        file_content = await file.read()
        logging.info(f"File content size: {len(file_content)} bytes")
        
        # Parse file based on extension
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(file_content))
            logging.info("File parsed as CSV")
        else:
            df = pd.read_excel(io.BytesIO(file_content))
            logging.info("File parsed as Excel")
        
        if df.empty:
            raise HTTPException(status_code=400, detail="File is empty")
        
        logging.info(f"DataFrame shape: {df.shape}, columns: {list(df.columns)}")
        
        # Smart column detection
        detected_columns = {}
        column_mapping = {
            'amount': ['amount', 'cost', 'price', 'total', 'value', 'expense'],
            'description': ['description', 'desc', 'detail', 'note', 'item', 'title'],
            'category': ['category', 'type', 'class', 'group'],
            'date': ['date', 'timestamp', 'time', 'when', 'created']
        }
        
        for required_field, possible_names in column_mapping.items():
            for col_name in df.columns:
                if any(possible in col_name.lower() for possible in possible_names):
                    detected_columns[required_field] = col_name
                    break
        
        logging.info(f"Detected columns: {detected_columns}")
        
        # Get preview data (first 5 rows)
        preview_data = df.head(5).fillna('').to_dict('records')
        
        # Calculate import stats
        import_stats = {
            'total_rows': len(df),
            'has_amount': 'amount' in detected_columns,
            'has_description': 'description' in detected_columns,
            'has_category': 'category' in detected_columns,
            'has_date': 'date' in detected_columns,
            'missing_required': []
        }
        
        # Check for required fields
        required_fields = ['amount', 'description']
        for field in required_fields:
            if field not in detected_columns:
                import_stats['missing_required'].append(field)
        
        logging.info(f"Import stats: {import_stats}")
        
        result = ImportPreview(
            total_rows=len(df),
            preview_data=preview_data,
            detected_columns=detected_columns,
            import_stats=import_stats
        )
        
        logging.info("Import preview created successfully")
        return result
        
    except pd.errors.EmptyDataError:
        logging.error("Empty data error during import preview")
        raise HTTPException(status_code=400, detail="File is empty or corrupted")
    except Exception as e:
        logging.error(f"Error processing import preview: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")

@api_router.post("/import/execute")
async def execute_import(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(require_auth)
):
    """Execute spreadsheet import with custom column mapping"""
    try:
        import json
        
        # Get column mapping from form data
        form = await request.form()
        if 'column_mapping' not in form:
            raise HTTPException(status_code=400, detail="column_mapping is required")
        
        try:
            mapping = json.loads(form['column_mapping'])
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid column mapping JSON")
        
        # Read file
        file_content = await file.read()
        
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(file_content))
        else:
            df = pd.read_excel(io.BytesIO(file_content))
        
        if df.empty:
            raise HTTPException(status_code=400, detail="File is empty")
        
        # Validate required mappings
        required_fields = ['amount', 'description']
        for field in required_fields:
            if field not in mapping or not mapping[field]:
                raise HTTPException(status_code=400, detail=f"Missing required field mapping: {field}")
        
        # Process imports
        successful = 0
        failed = 0
        errors = []
        
        for index, row in df.iterrows():
            try:
                # Extract data based on mapping
                amount_str = str(row.get(mapping['amount'], '')).strip()
                if not amount_str or amount_str.lower() in ['nan', 'none', '']:
                    errors.append(f"Row {index + 1}: Missing amount")
                    failed += 1
                    continue
                
                # Clean and parse amount
                amount_str = amount_str.replace('₱', '').replace(',', '').replace('$', '')
                try:
                    amount = float(amount_str)
                    if amount <= 0:
                        errors.append(f"Row {index + 1}: Invalid amount (must be positive)")
                        failed += 1
                        continue
                except ValueError:
                    errors.append(f"Row {index + 1}: Invalid amount format")
                    failed += 1
                    continue
                
                # Extract description
                description = str(row.get(mapping['description'], '')).strip()
                if not description or description.lower() in ['nan', 'none']:
                    errors.append(f"Row {index + 1}: Missing description")
                    failed += 1
                    continue
                
                # Extract category (optional)
                category = 'Other'  # Default category
                if 'category' in mapping and mapping['category']:
                    cat_value = str(row.get(mapping['category'], '')).strip()
                    if cat_value and cat_value.lower() not in ['nan', 'none', '']:
                        # Check if category exists in user's available categories
                        existing_categories = await db.categories.find({
                            "$or": [
                                {"is_system": True},
                                {"created_by": user.id}
                            ]
                        }).to_list(length=None)
                        
                        category_names = [cat["name"] for cat in existing_categories]
                        if cat_value in category_names:
                            category = cat_value
                        else:
                            # Use default but log warning
                            category = 'Other'
                
                # Extract date (optional)
                expense_date = date.today()
                if 'date' in mapping and mapping['date']:
                    date_value = row.get(mapping['date'])
                    if pd.notna(date_value):
                        try:
                            if isinstance(date_value, str):
                                expense_date = pd.to_datetime(date_value).date()
                            else:
                                expense_date = pd.to_datetime(date_value).date()
                        except:
                            # Use today's date if parsing fails
                            expense_date = date.today()
                
                # Create expense
                expense = Expense(
                    amount=amount,
                    category=category,
                    description=f"[IMPORTED] {description}",
                    date=expense_date,
                    user_id=user.id,
                    is_shared=False
                )
                
                await db.expenses.insert_one(prepare_for_mongo(expense.dict()))
                successful += 1
                
            except Exception as e:
                errors.append(f"Row {index + 1}: {str(e)}")
                failed += 1
        
        return ImportResult(
            total_imported=successful + failed,
            successful=successful,
            failed=failed,
            errors=errors
        )
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Import error: {str(e)}")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    """Initialize system categories on startup"""
    await initialize_system_categories()

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()