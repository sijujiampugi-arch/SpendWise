import React, { useState, useEffect, createContext, useContext } from 'react';
import './App.css';
import axios from 'axios';
import * as d3 from 'd3';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Create Authentication Context
const AuthContext = createContext();

// Authentication Provider Component
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    checkExistingSession();
  }, []);

  // Process session ID from URL fragment
  useEffect(() => {
    const processSessionId = async () => {
      const hash = window.location.hash;
      if (hash.includes('session_id=')) {
        setLoading(true);
        const sessionId = hash.split('session_id=')[1].split('&')[0];
        
        try {
          const response = await axios.post(`${API}/auth/session-data`, {}, {
            headers: { 'X-Session-ID': sessionId },
            withCredentials: true
          });
          
          setUser(response.data);
          // Clean URL fragment
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
          console.error('Error processing session:', error);
        }
        setLoading(false);
      }
    };

    processSessionId();
  }, []);

  const checkExistingSession = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(response.data);
    } catch (error) {
      // No existing session
      setUser(null);
    }
    setLoading(false);
  };

  const login = () => {
    const redirectUrl = encodeURIComponent(window.location.origin);
    window.location.href = `https://auth.emergentagent.com/?redirect=${redirectUrl}`;
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Philippine Peso formatter
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }).format(amount);
};

// Login Component
const LoginPage = () => {
  const { login } = useAuth();

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1 className="app-title">SpendWise</h1>
          <p className="app-subtitle">Smart expense tracking</p>
        </div>
        <div className="login-content">
          <h2>Welcome Back!</h2>
          <p>Track your expenses with beautiful insights and charts</p>
          <button onClick={login} className="google-login-button">
            <span className="google-icon">🚀</span>
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
};

// Loading Component
const LoadingSpinner = () => (
  <div className="loading-spinner">
    <div className="spinner"></div>
    <p>Loading...</p>
  </div>
);

// Main App Component
function MainApp() {
  const { user, logout } = useAuth();
  const [darkMode, setDarkMode] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [expenses, setExpenses] = useState([]);
  const [stats, setStats] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Load data on component mount and when filters change
  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedYear]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load categories
      const categoriesRes = await axios.get(`${API}/categories`, { withCredentials: true });
      setCategories(categoriesRes.data);

      // Load expenses
      const expensesRes = await axios.get(`${API}/expenses?month=${selectedMonth}&year=${selectedYear}`, { withCredentials: true });
      setExpenses(expensesRes.data);

      // Load stats
      const statsRes = await axios.get(`${API}/expenses/stats?month=${selectedMonth}&year=${selectedYear}`, { withCredentials: true });
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
      if (error.response?.status === 401) {
        // User session expired, they will be redirected to login
        return;
      }
    }
    setLoading(false);
  };

  // Toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  return (
    <div className={`app ${darkMode ? 'dark' : 'light'}`}>
      <div className="app-container">
        {/* Header */}
        <header className="app-header">
          <div className="header-content">
            <div className="header-left">
              <h1 className="app-title">SpendWise</h1>
              <p className="app-subtitle">Smart expense tracking</p>
            </div>
            <div className="header-right">
              <div className="user-info">
                <img src={user?.picture} alt={user?.name} className="user-avatar" />
                <span className="user-name">{user?.name}</span>
              </div>
              <button 
                className="mode-toggle"
                onClick={toggleDarkMode}
                aria-label="Toggle dark mode"
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
              <button 
                className="logout-button"
                onClick={logout}
                aria-label="Logout"
              >
                🚪
              </button>
            </div>
          </div>
        </header>

        {/* Navigation */}
        <nav className="app-nav">
          <button 
            className={`nav-button ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentView('dashboard')}
          >
            📊 Dashboard
          </button>
          <button 
            className={`nav-button ${currentView === 'add' ? 'active' : ''}`}
            onClick={() => setCurrentView('add')}
          >
            ➕ Add Expense
          </button>
          <button 
            className={`nav-button ${currentView === 'expenses' ? 'active' : ''}`}
            onClick={() => setCurrentView('expenses')}
          >
            📝 Expenses
          </button>
          <button 
            className={`nav-button ${currentView === 'shared' ? 'active' : ''}`}
            onClick={() => setCurrentView('shared')}
          >
            👥 Shared
          </button>
          <button 
            className={`nav-button ${currentView === 'categories' ? 'active' : ''}`}
            onClick={() => setCurrentView('categories')}
          >
            🏷️ Categories
          </button>
          <button 
            className={`nav-button ${currentView === 'import' ? 'active' : ''}`}
            onClick={() => setCurrentView('import')}
          >
            📄 Import
          </button>
        </nav>

        {/* Month/Year Selector */}
        <div className="period-selector">
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="period-select"
          >
            {Array.from({length: 12}, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2023, i).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="period-select"
          >
            {Array.from({length: 5}, (_, i) => (
              <option key={2020 + i} value={2020 + i}>
                {2020 + i}
              </option>
            ))}
          </select>
        </div>

        {/* Main Content */}
        <main className="app-main">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <>
              {currentView === 'dashboard' && (
                <Dashboard stats={stats} categories={categories} />
              )}
              {currentView === 'add' && (
                <AddExpense categories={categories} onExpenseAdded={loadData} user={user} />
              )}
              {currentView === 'expenses' && (
                <ExpensesList expenses={expenses} categories={categories} onExpenseDeleted={loadData} />
              )}
              {currentView === 'shared' && (
                <SharedExpenses user={user} onExpenseAdded={loadData} />
              )}
              {currentView === 'categories' && (
                <CategoriesManager categories={categories} onCategoryAdded={loadData} />
              )}
              {currentView === 'import' && (
                <ImportManager categories={categories} onImportComplete={loadData} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// Dashboard Component
const Dashboard = ({ stats, categories }) => {
  useEffect(() => {
    if (stats && stats.category_breakdown) {
      drawPieChart(stats.category_breakdown, categories);
      drawLineChart(stats.monthly_trend);
    }
  }, [stats, categories]);

  const drawPieChart = (data, categories) => {
    // Clear previous chart
    d3.select("#pie-chart").selectAll("*").remove();

    const width = 300;
    const height = 300;
    const radius = Math.min(width, height) / 2;

    const svg = d3.select("#pie-chart")
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${width / 2}, ${height / 2})`);

    const categoryColors = {};
    categories.forEach(cat => {
      categoryColors[cat.name] = cat.color;
    });

    const color = d3.scaleOrdinal()
      .domain(Object.keys(data))
      .range(Object.keys(data).map(key => categoryColors[key] || '#8E8E93'));

    const pie = d3.pie().value(d => d.value);
    const arc = d3.arc().innerRadius(60).outerRadius(radius);

    const pieData = Object.entries(data).map(([key, value]) => ({
      category: key,
      value: value
    }));

    const arcs = svg.selectAll("arc")
      .data(pie(pieData))
      .enter()
      .append("g")
      .attr("class", "arc");

    arcs.append("path")
      .attr("d", arc)
      .attr("fill", d => color(d.data.category))
      .attr("stroke", "white")
      .attr("stroke-width", 2);

    arcs.append("text")
      .attr("transform", d => `translate(${arc.centroid(d)})`)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .style("font-weight", "600")
      .style("fill", "white")
      .text(d => {
        const percentage = ((d.data.value / d3.sum(pieData, d => d.value)) * 100).toFixed(1);
        return percentage > 5 ? `${percentage}%` : '';
      });
  };

  const drawLineChart = (data) => {
    // Clear previous chart
    d3.select("#line-chart").selectAll("*").remove();

    if (!data || data.length === 0) return;

    const margin = { top: 20, right: 30, bottom: 40, left: 50 };
    const width = 400 - margin.left - margin.right;
    const height = 200 - margin.top - margin.bottom;

    const svg = d3.select("#line-chart")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const parseTime = d3.timeParse("%Y-%m");
    const formatMonth = d3.timeFormat("%b");

    const processedData = data.map(d => ({
      date: parseTime(d.month),
      amount: d.amount
    }));

    const x = d3.scaleTime()
      .domain(d3.extent(processedData, d => d.date))
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(processedData, d => d.amount)])
      .range([height, 0]);

    const line = d3.line()
      .x(d => x(d.date))
      .y(d => y(d.amount))
      .curve(d3.curveMonotoneX);

    // Add axes
    svg.append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x).tickFormat(formatMonth));

    svg.append("g")
      .call(d3.axisLeft(y).tickFormat(d => formatCurrency(d)));

    // Add line
    svg.append("path")
      .datum(processedData)
      .attr("fill", "none")
      .attr("stroke", "#007AFF")
      .attr("stroke-width", 3)
      .attr("d", line);

    // Add dots
    svg.selectAll(".dot")
      .data(processedData)
      .enter().append("circle")
      .attr("class", "dot")
      .attr("cx", d => x(d.date))
      .attr("cy", d => y(d.amount))
      .attr("r", 4)
      .attr("fill", "#007AFF");
  };

  if (!stats) {
    return <div className="dashboard">No data available</div>;
  }

  return (
    <div className="dashboard">
      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-icon">💰</div>
          <div className="card-content">
            <h3>Total Spent</h3>
            <p className="card-amount">{formatCurrency(stats.total_expenses)}</p>
          </div>
        </div>
        <div className="summary-card">
          <div className="card-icon">📊</div>
          <div className="card-content">
            <h3>Top Category</h3>
            <p className="card-category">{stats.top_category || 'None'}</p>
            <p className="card-amount">{formatCurrency(stats.top_category_amount)}</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-container">
        <div className="chart-section">
          <h3>Category Breakdown</h3>
          <div id="pie-chart"></div>
        </div>
        <div className="chart-section">
          <h3>Spending Trend</h3>
          <div id="line-chart"></div>
        </div>
      </div>
    </div>
  );
};

// Add Expense Component (Enhanced with Shared Expenses)
const AddExpense = ({ categories, onExpenseAdded, user }) => {
  const [formData, setFormData] = useState({
    amount: '',
    category: categories.length > 0 ? categories[0].name : 'Grocery',
    description: '',
    date: new Date().toISOString().split('T')[0],
    is_shared: false
  });

  const [sharedData, setSharedData] = useState({
    paid_by_email: user?.email || '',
    splits: [{ email: user?.email || '', percentage: 100 }]
  });

  const addSplitPerson = () => {
    setSharedData(prev => ({
      ...prev,
      splits: [...prev.splits, { email: '', percentage: 0 }]
    }));
  };

  const removeSplitPerson = (index) => {
    setSharedData(prev => ({
      ...prev,
      splits: prev.splits.filter((_, i) => i !== index)
    }));
  };

  const updateSplit = (index, field, value) => {
    setSharedData(prev => {
      const newSplits = [...prev.splits];
      newSplits[index][field] = value;
      return { ...prev, splits: newSplits };
    });
  };

  const autoSplit = () => {
    const count = sharedData.splits.length;
    const splitPercentage = Math.floor(100 / count);
    const remainder = 100 - (splitPercentage * count);
    
    setSharedData(prev => ({
      ...prev,
      splits: prev.splits.map((split, index) => ({
        ...split,
        percentage: index === 0 ? splitPercentage + remainder : splitPercentage
      }))
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // Basic form validation
      if (!formData.amount || parseFloat(formData.amount) <= 0) {
        alert('Please enter a valid amount greater than 0');
        return;
      }

      if (!formData.description.trim()) {
        alert('Please enter a description');
        return;
      }

      const requestData = {
        ...formData,
        amount: parseFloat(formData.amount), // Ensure it's a number
        shared_data: formData.is_shared ? sharedData : null
      };

      console.log('Submitting expense data:', requestData);
      
      // Validate shared expense data if needed
      if (formData.is_shared) {
        // Check for valid paid_by_email
        if (!sharedData.paid_by_email || !sharedData.paid_by_email.includes('@')) {
          alert('Please enter a valid email for who paid initially');
          return;
        }

        // Check splits
        if (!sharedData.splits || sharedData.splits.length === 0) {
          alert('Please add at least one person to split with');
          return;
        }

        // Validate each split
        for (let i = 0; i < sharedData.splits.length; i++) {
          const split = sharedData.splits[i];
          if (!split.email || !split.email.includes('@')) {
            alert(`Please enter a valid email for person ${i + 1}`);
            return;
          }
          if (!split.percentage || split.percentage <= 0) {
            alert(`Please enter a valid percentage for ${split.email}`);
            return;
          }
        }

        // Check total percentage (with some tolerance)
        const totalPercentage = sharedData.splits.reduce((sum, split) => sum + (parseFloat(split.percentage) || 0), 0);
        if (Math.abs(totalPercentage - 100) > 1) { // Allow 1% tolerance
          alert(`Split percentages should total 100%. Current total: ${totalPercentage.toFixed(1)}%`);
          return;
        }
      }

      console.log('Validation passed, sending request...');
      const response = await axios.post(`${API}/expenses`, requestData, { 
        withCredentials: true,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Expense created successfully:', response.data);
      
      // Reset form
      setFormData({
        amount: '',
        category: categories.length > 0 ? categories[0].name : 'Grocery',
        description: '',
        date: new Date().toISOString().split('T')[0],
        is_shared: false
      });
      
      setSharedData({
        paid_by_email: user?.email || '',
        splits: [{ email: user?.email || '', percentage: 100 }]
      });

      onExpenseAdded();
      alert('Expense added successfully!');
      
    } catch (error) {
      console.error('Error adding expense:', error);
      console.error('Error response:', error.response?.data);
      
      // Show detailed error message
      let errorMessage = 'Error adding expense';
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response?.data?.errors) {
        const errors = error.response.data.errors;
        errorMessage = `Validation errors: ${errors.map(e => e.msg).join(', ')}`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(`${errorMessage}\n\nPlease check the console for more details.`);
    }
  };

  return (
    <div className="add-expense">
      <h2>Add New Expense</h2>
      <form onSubmit={handleSubmit} className="expense-form">
        <div className="form-group">
          <label>Amount (₱)</label>
          <input
            type="number"
            step="0.01"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            required
            className="form-input"
            placeholder="0.00"
          />
        </div>

        <div className="form-group">
          <label>Category</label>
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="form-select"
          >
            {categories.map(cat => (
              <option key={cat.name} value={cat.name}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Description</label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            required
            className="form-input"
            placeholder="What did you spend on?"
          />
        </div>

        <div className="form-group">
          <label>Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            required
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={formData.is_shared}
              onChange={(e) => setFormData({ ...formData, is_shared: e.target.checked })}
            />
            <span className="checkmark"></span>
            Shared Expense
          </label>
        </div>

        {formData.is_shared && (
          <div className="shared-expense-section">
            <h3>Shared Expense Details</h3>
            
            <div className="form-group">
              <label>Who Paid Initially?</label>
              <input
                type="email"
                value={sharedData.paid_by_email}
                onChange={(e) => setSharedData({ ...sharedData, paid_by_email: e.target.value })}
                required
                className="form-input"
                placeholder="email@example.com"
              />
            </div>

            <div className="splits-section">
              <div className="splits-header">
                <label>Split Between:</label>
                <div className="splits-actions">
                  <button type="button" onClick={autoSplit} className="auto-split-button">
                    Equal Split
                  </button>
                  <button type="button" onClick={addSplitPerson} className="add-person-button">
                    + Add Person
                  </button>
                </div>
              </div>

              {sharedData.splits.map((split, index) => (
                <div key={index} className="split-row">
                  <input
                    type="email"
                    value={split.email}
                    onChange={(e) => updateSplit(index, 'email', e.target.value)}
                    placeholder="email@example.com"
                    className="form-input split-email"
                    required
                  />
                  <input
                    type="number"
                    value={split.percentage}
                    onChange={(e) => updateSplit(index, 'percentage', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="form-input split-percentage"
                    min="0"
                    max="100"
                    required
                  />
                  <span className="percentage-symbol">%</span>
                  {sharedData.splits.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSplitPerson(index)}
                      className="remove-person-button"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}

              <div className="split-total">
                Total: {sharedData.splits.reduce((sum, split) => sum + (split.percentage || 0), 0)}%
              </div>
            </div>
          </div>
        )}

        <button type="submit" className="submit-button">
          Add Expense
        </button>
      </form>
    </div>
  );
};

// Expenses List Component
const ExpensesList = ({ expenses, categories, onExpenseDeleted }) => {
  const getCategoryIcon = (categoryName) => {
    const category = categories.find(cat => cat.name === categoryName);
    return category ? category.icon : '📦';
  };

  const getCategoryColor = (categoryName) => {
    const category = categories.find(cat => cat.name === categoryName);
    return category ? category.color : '#8E8E93';
  };

  const handleDelete = async (expenseId) => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      try {
        await axios.delete(`${API}/expenses/${expenseId}`, { withCredentials: true });
        onExpenseDeleted();
      } catch (error) {
        console.error('Error deleting expense:', error);
        alert('Error deleting expense');
      }
    }
  };

  return (
    <div className="expenses-list">
      <h2>Recent Expenses</h2>
      {expenses.length === 0 ? (
        <div className="no-expenses">
          <p>No expenses found for this period.</p>
        </div>
      ) : (
        <div className="expenses-grid">
          {expenses.map(expense => (
            <div key={expense.id} className="expense-item">
              <div className="expense-icon" style={{ backgroundColor: getCategoryColor(expense.category) }}>
                {getCategoryIcon(expense.category)}
              </div>
              <div className="expense-details">
                <h4>{expense.description}</h4>
                <p className="expense-category">{expense.category}</p>
                <p className="expense-date">{new Date(expense.date).toLocaleDateString()}</p>
                {expense.is_shared && <span className="shared-badge">👥 Shared</span>}
              </div>
              <div className="expense-amount">
                <span>{formatCurrency(expense.amount)}</span>
                <button 
                  onClick={() => handleDelete(expense.id)}
                  className="delete-button"
                  title="Delete expense"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Shared Expenses Component
const SharedExpenses = ({ user, onExpenseAdded }) => {
  const [sharedExpenses, setSharedExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSharedData();
  }, []);

  const loadSharedData = async () => {
    setLoading(true);
    try {
      // Load shared expenses
      const sharedRes = await axios.get(`${API}/shared-expenses`, { withCredentials: true });
      setSharedExpenses(sharedRes.data);

      // Load settlements
      const settlementsRes = await axios.get(`${API}/settlements`, { withCredentials: true });
      setSettlements(settlementsRes.data.balances);
    } catch (error) {
      console.error('Error loading shared data:', error);
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="loading">Loading shared expenses...</div>;
  }

  return (
    <div className="shared-expenses">
      <h2>Shared Expenses & Settlements</h2>
      
      {/* Settlements Section */}
      <div className="settlements-section">
        <h3>💰 Settlements</h3>
        {settlements.length === 0 ? (
          <div className="no-settlements">
            <p>All settled up! 🎉</p>
          </div>
        ) : (
          <div className="settlements-list">
            {settlements.map((settlement, index) => (
              <div key={index} className={`settlement-item ${settlement.type}`}>
                <div className="settlement-info">
                  <span className="settlement-person">{settlement.person}</span>
                  <span className="settlement-amount">{formatCurrency(settlement.amount)}</span>
                </div>
                <div className="settlement-type">
                  {settlement.type === 'owed_to_you' ? '💚 Owes you' : '💸 You owe'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shared Expenses History */}
      <div className="shared-history-section">
        <h3>📋 Shared Expenses History</h3>
        {sharedExpenses.length === 0 ? (
          <div className="no-shared-expenses">
            <p>No shared expenses yet. Create one using "Add Expense" with the shared option!</p>
          </div>
        ) : (
          <div className="shared-expenses-list">
            {sharedExpenses.map(expense => (
              <div key={expense.id} className="shared-expense-item">
                <div className="shared-expense-header">
                  <h4>{expense.description}</h4>
                  <span className="shared-expense-amount">{formatCurrency(expense.amount)}</span>
                </div>
                <div className="shared-expense-details">
                  <p><strong>Category:</strong> {expense.category}</p>
                  <p><strong>Date:</strong> {new Date(expense.date).toLocaleDateString()}</p>
                  <p><strong>Paid by:</strong> {expense.paid_by}</p>
                </div>
                <div className="shared-expense-splits">
                  <h5>Split Details:</h5>
                  {expense.splits.map((split, index) => (
                    <div key={index} className="split-detail">
                      <span className="split-person">{split.user_email}</span>
                      <span className="split-info">
                        {split.percentage}% ({formatCurrency(split.amount)})
                        {split.paid && <span className="paid-badge">✅ Paid</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Categories Manager Component
const CategoriesManager = ({ categories, onCategoryAdded }) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    color: '#007AFF',
    icon: '📦'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/categories`, formData, { withCredentials: true });
      setFormData({ name: '', color: '#007AFF', icon: '📦' });
      setShowCreateForm(false);
      onCategoryAdded();
      alert('Category created successfully!');
    } catch (error) {
      console.error('Error creating category:', error);
      alert(error.response?.data?.detail || 'Error creating category');
    }
  };

  return (
    <div className="categories-manager">
      <div className="categories-header">
        <h2>Manage Categories</h2>
        <button 
          className="add-category-button"
          onClick={() => setShowCreateForm(true)}
        >
          ➕ Add Category
        </button>
      </div>

      {showCreateForm && (
        <div className="create-category-form">
          <h3>Create New Category</h3>
          <form onSubmit={handleSubmit} className="category-form">
            <div className="form-row">
              <div className="form-group">
                <label>Category Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="form-input"
                  placeholder="e.g., Coffee Shops"
                />
              </div>
              <div className="form-group">
                <label>Icon (Emoji)</label>
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  required
                  className="form-input emoji-input"
                  placeholder="☕"
                  maxLength="2"
                />
              </div>
              <div className="form-group">
                <label>Color</label>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="form-color-input"
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="submit-button">
                Create Category
              </button>
              <button 
                type="button" 
                className="cancel-button"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="categories-grid">
        {categories.map(category => (
          <div key={category.name} className="category-card">
            <div 
              className="category-icon"
              style={{ backgroundColor: category.color }}
            >
              {category.icon}
            </div>
            <div className="category-info">
              <h4>{category.name}</h4>
              <p style={{ color: category.color }}>{category.color}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Import Manager Component
const ImportManager = ({ categories, onImportComplete }) => {
  const [importFile, setImportFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImportFile(file);
    setPreviewData(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`${API}/import/preview`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true
      });

      setPreviewData(response.data);
      setColumnMapping(response.data.detected_columns);
    } catch (error) {
      console.error('Error previewing file:', error);
      alert(error.response?.data?.detail || 'Error previewing file');
    }
  };

  const handleImport = async () => {
    if (!importFile || !previewData) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('column_mapping', JSON.stringify(columnMapping));

      const response = await axios.post(`${API}/import/execute`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true
      });

      setImportResult(response.data);
      onImportComplete();
    } catch (error) {
      console.error('Error importing file:', error);
      alert(error.response?.data?.detail || 'Error importing file');
    }
    setImporting(false);
  };

  return (
    <div className="import-manager">
      <h2>Import Expenses from Spreadsheet</h2>
      
      <div className="import-section">
        <div className="file-upload-section">
          <h3>1. Select File</h3>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileSelect}
            className="file-input"
          />
          <p className="file-help">Supported formats: CSV, Excel (.xlsx, .xls)</p>
        </div>

        {previewData && (
          <div className="preview-section">
            <h3>2. Preview & Column Mapping</h3>
            <div className="import-stats">
              <p><strong>Total Rows:</strong> {previewData.total_rows}</p>
              <p><strong>Auto-detected columns:</strong> {Object.keys(previewData.detected_columns).length}</p>
            </div>

            <div className="column-mapping">
              <h4>Column Mapping</h4>
              <div className="mapping-grid">
                <div className="mapping-row">
                  <label>Amount Column *</label>
                  <select
                    value={columnMapping.amount || ''}
                    onChange={(e) => setColumnMapping({ ...columnMapping, amount: e.target.value })}
                    className="form-select"
                  >
                    <option value="">Select column</option>
                    {Object.keys(previewData.preview_data[0] || {}).map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                <div className="mapping-row">
                  <label>Description Column *</label>
                  <select
                    value={columnMapping.description || ''}
                    onChange={(e) => setColumnMapping({ ...columnMapping, description: e.target.value })}
                    className="form-select"
                  >
                    <option value="">Select column</option>
                    {Object.keys(previewData.preview_data[0] || {}).map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                <div className="mapping-row">
                  <label>Category Column</label>
                  <select
                    value={columnMapping.category || ''}
                    onChange={(e) => setColumnMapping({ ...columnMapping, category: e.target.value })}
                    className="form-select"
                  >
                    <option value="">Select column (optional)</option>
                    {Object.keys(previewData.preview_data[0] || {}).map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                <div className="mapping-row">
                  <label>Date Column</label>
                  <select
                    value={columnMapping.date || ''}
                    onChange={(e) => setColumnMapping({ ...columnMapping, date: e.target.value })}
                    className="form-select"
                  >
                    <option value="">Select column (optional)</option>
                    {Object.keys(previewData.preview_data[0] || {}).map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="preview-table">
              <h4>Data Preview</h4>
              <table className="preview-data-table">
                <thead>
                  <tr>
                    {Object.keys(previewData.preview_data[0] || {}).map(col => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.preview_data.map((row, index) => (
                    <tr key={index}>
                      {Object.values(row).map((value, cellIndex) => (
                        <td key={cellIndex}>{String(value)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="import-actions">
              <button
                onClick={handleImport}
                disabled={importing || !columnMapping.amount || !columnMapping.description}
                className="import-button"
              >
                {importing ? 'Importing...' : `Import ${previewData.total_rows} Expenses`}
              </button>
            </div>
          </div>
        )}

        {importResult && (
          <div className="import-result">
            <h3>3. Import Results</h3>
            <div className="result-stats">
              <div className="result-card success">
                <h4>✅ Successful</h4>
                <p>{importResult.successful} expenses</p>
              </div>
              <div className="result-card error">
                <h4>❌ Failed</h4>
                <p>{importResult.failed} expenses</p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="import-errors">
                <h4>Errors:</h4>
                <ul>
                  {importResult.errors.slice(0, 10).map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                  {importResult.errors.length > 10 && (
                    <li>... and {importResult.errors.length - 10} more errors</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Main App with Authentication
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const AppContent = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <LoginPage />;
  }

  return <MainApp />;
};

export default App;