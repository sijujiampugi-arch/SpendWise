from fastapi import FastAPI, APIRouter, HTTPException, Query, Request, Depends, Cookie
from fastapi.responses import JSONResponse
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
from datetime import datetime, date, timezone
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

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

# Authentication Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    picture: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

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

# Expense Models
class Expense(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    amount: float
    category: ExpenseCategory
    description: str
    date: date
    user_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ExpenseCreate(BaseModel):
    amount: float
    category: ExpenseCategory
    description: str
    date: date

class ExpenseStats(BaseModel):
    total_expenses: float
    category_breakdown: Dict[str, float]
    monthly_trend: List[Dict[str, Any]]
    top_category: Optional[str]
    top_category_amount: float

class CategoryInfo(BaseModel):
    name: str
    color: str
    icon: str

# Custom Category Models
class CustomCategory(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: str
    icon: str
    created_by: str  # user_id who created it
    is_system: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CustomCategoryCreate(BaseModel):
    name: str
    color: str
    icon: str

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

# Category configurations with Apple-like colors
CATEGORY_CONFIG = {
    ExpenseCategory.GROCERY: {"color": "#34C759", "icon": "🛒"},
    ExpenseCategory.FUEL: {"color": "#FF9500", "icon": "⛽"},
    ExpenseCategory.DINING_OUT: {"color": "#FF3B30", "icon": "🍽️"},
    ExpenseCategory.SHOPPING: {"color": "#AF52DE", "icon": "🛍️"},
    ExpenseCategory.BILLS: {"color": "#007AFF", "icon": "📋"},
    ExpenseCategory.HEALTHCARE: {"color": "#FF2D92", "icon": "🏥"},
    ExpenseCategory.ENTERTAINMENT: {"color": "#5AC8FA", "icon": "🎬"},
    ExpenseCategory.TRANSPORT: {"color": "#FFCC02", "icon": "🚗"},
    ExpenseCategory.OTHER: {"color": "#8E8E93", "icon": "📦"},
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
            # Create new user
            new_user = User(
                email=session_data["email"],
                name=session_data["name"],
                picture=session_data["picture"]
            )
            await db.users.insert_one(prepare_for_mongo(new_user.dict()))
            user_id = new_user.id
        else:
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
    return {"message": "SpendWise API - Expense Tracking App"}

@api_router.post("/expenses", response_model=Expense)
async def create_expense(expense_data: ExpenseCreate, user: User = Depends(require_auth)):
    """Create a new expense"""
    try:
        expense = Expense(**expense_data.dict(), user_id=user.id)
        expense_dict = prepare_for_mongo(expense.dict())
        await db.expenses.insert_one(expense_dict)
        return expense
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/expenses", response_model=List[Expense])
async def get_expenses(
    user: User = Depends(require_auth),
    month: Optional[int] = Query(None, description="Filter by month (1-12)"),
    year: Optional[int] = Query(None, description="Filter by year"),
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(100, description="Maximum number of expenses to return")
):
    """Get expenses with optional filtering"""
    try:
        # Build filter query for user's expenses
        filter_query = {"user_id": user.id}
        
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
        
        expenses = await db.expenses.find(filter_query).sort("date", -1).limit(limit).to_list(length=None)
        return [Expense(**parse_from_mongo(expense)) for expense in expenses]
    except Exception as e:
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
        
        # Build date filter for user's expenses
        start_date = f"{year}-{month:02d}-01"
        if month == 12:
            end_date = f"{year + 1}-01-01"
        else:
            end_date = f"{year}-{month + 1:02d}-01"
        
        filter_query = {
            "user_id": user.id,
            "date": {"$gte": start_date, "$lt": end_date}
        }
        
        expenses = await db.expenses.find(filter_query).to_list(length=None)
        
        # Calculate statistics
        total_expenses = sum(expense["amount"] for expense in expenses)
        
        # Category breakdown
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
            
            trend_filter = {
                "user_id": user.id,
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
            category_breakdown=category_breakdown,
            monthly_trend=monthly_trend,
            top_category=top_category,
            top_category_amount=top_category_amount
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user: User = Depends(require_auth)):
    """Delete an expense"""
    try:
        result = await db.expenses.delete_one({"id": expense_id, "user_id": user.id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Expense not found")
        return {"message": "Expense deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

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