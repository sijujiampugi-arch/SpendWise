from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
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

# Define Models
class Expense(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    amount: float
    category: ExpenseCategory
    description: str
    date: date
    user_id: str = "default_user"  # Simple user system for MVP
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

# Helper functions
def prepare_for_mongo(data):
    """Convert date objects to ISO strings for MongoDB storage"""
    if isinstance(data.get('date'), date):
        data['date'] = data['date'].isoformat()
    if isinstance(data.get('created_at'), datetime):
        data['created_at'] = data['created_at'].isoformat()
    return data

def parse_from_mongo(item):
    """Parse date strings back to date objects from MongoDB"""
    if isinstance(item.get('date'), str):
        item['date'] = datetime.fromisoformat(item['date']).date()
    if isinstance(item.get('created_at'), str):
        item['created_at'] = datetime.fromisoformat(item['created_at'])
    return item

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

# Routes
@api_router.get("/")
async def root():
    return {"message": "SpendWise API - Expense Tracking App"}

@api_router.post("/expenses", response_model=Expense)
async def create_expense(expense_data: ExpenseCreate):
    """Create a new expense"""
    try:
        expense = Expense(**expense_data.dict())
        expense_dict = prepare_for_mongo(expense.dict())
        await db.expenses.insert_one(expense_dict)
        return expense
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/expenses", response_model=List[Expense])
async def get_expenses(
    month: Optional[int] = Query(None, description="Filter by month (1-12)"),
    year: Optional[int] = Query(None, description="Filter by year"),
    category: Optional[ExpenseCategory] = Query(None, description="Filter by category"),
    limit: int = Query(100, description="Maximum number of expenses to return")
):
    """Get expenses with optional filtering"""
    try:
        # Build filter query
        filter_query = {"user_id": "default_user"}
        
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
            filter_query["category"] = category.value
        
        expenses = await db.expenses.find(filter_query).sort("date", -1).limit(limit).to_list(length=None)
        return [Expense(**parse_from_mongo(expense)) for expense in expenses]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/expenses/stats", response_model=ExpenseStats)
async def get_expense_stats(
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
        
        # Build date filter
        start_date = f"{year}-{month:02d}-01"
        if month == 12:
            end_date = f"{year + 1}-01-01"
        else:
            end_date = f"{year}-{month + 1:02d}-01"
        
        filter_query = {
            "user_id": "default_user",
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
                "user_id": "default_user",
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

@api_router.get("/categories", response_model=List[CategoryInfo])
async def get_categories():
    """Get all expense categories with their configuration"""
    categories = []
    for category, config in CATEGORY_CONFIG.items():
        categories.append(CategoryInfo(
            name=category.value,
            color=config["color"],
            icon=config["icon"]
        ))
    return categories

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str):
    """Delete an expense"""
    try:
        result = await db.expenses.delete_one({"id": expense_id, "user_id": "default_user"})
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()