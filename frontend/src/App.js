import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
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
  
  // User management state
  const [users, setUsers] = useState([]);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [userManagementLoading, setUserManagementLoading] = useState(false);

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

  // User management functions
  const loadUsers = useCallback(async () => {
    setUserManagementLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        axios.get(`${API}/users`, { withCredentials: true }),
        axios.get(`${API}/users/roles`, { withCredentials: true })
      ]);
      setUsers(usersRes.data);
      setAvailableRoles(rolesRes.data.roles);
    } catch (error) {
      console.error('Error loading users:', error);
      alert(error.response?.data?.detail || 'Error loading users');
    }
    setUserManagementLoading(false);
  }, []); // Empty dependency array since it doesn't depend on any props/state

  const assignUserRole = async (email, role) => {
    try {
      await axios.post(`${API}/users/assign-role`, {
        user_email: email,
        new_role: role
      }, { withCredentials: true });
      
      alert(`Role assigned successfully to ${email}`);
      loadUsers(); // Refresh users list
    } catch (error) {
      console.error('Error assigning role:', error);
      alert(error.response?.data?.detail || 'Error assigning role');
    }
  };

  const removeUser = async (email) => {
    if (!window.confirm(`Are you sure you want to remove ${email} from the system? This will delete all their data.`)) {
      return;
    }
    
    try {
      await axios.delete(`${API}/users/${encodeURIComponent(email)}`, { withCredentials: true });
      alert(`User ${email} removed successfully`);
      loadUsers(); // Refresh users list
    } catch (error) {
      console.error('Error removing user:', error);
      alert(error.response?.data?.detail || 'Error removing user');
    }
  };

  // Load users when settings tab is accessed
  useEffect(() => {
    if (currentView === 'settings' && (user?.role === 'owner' || user?.role === 'co_owner')) {
      loadUsers();
    }
  }, [currentView, user?.role]);

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
          <button 
            className={`nav-button ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
          >
            ⚙️ Settings
          </button>
        </nav>

        {/* Month/Year Selector */}
        <div className="period-selector">
          <div className="period-label">
            <span>📅 Filter expenses by:</span>
          </div>
          <div className="period-controls">
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
              {(() => {
                const currentYear = new Date().getFullYear();
                const startYear = currentYear - 2; // Show 2 years back
                const endYear = currentYear + 1;   // Show 1 year ahead
                const years = [];
                
                for (let year = startYear; year <= endYear; year++) {
                  years.push(
                    <option key={year} value={year}>
                      {year}
                      {year === currentYear && ' (Current)'}
                      {year === currentYear + 1 && ' (Future)'}
                    </option>
                  );
                }
                return years;
              })()}
            </select>
          </div>
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
                <SharedExpenses 
                  user={user} 
                  onExpenseAdded={loadData}
                  refreshTrigger={selectedMonth + '-' + selectedYear + '-' + expenses.length}
                />
              )}
              {currentView === 'categories' && (
                <CategoriesManager categories={categories} onCategoryAdded={loadData} />
              )}
              {currentView === 'import' && (
                <ImportManager categories={categories} onImportComplete={loadData} />
              )}
              {currentView === 'settings' && (
                <Settings 
                  user={user}
                  users={users} 
                  availableRoles={availableRoles}
                  onAssignRole={assignUserRole}
                  onRemoveUser={removeUser}
                  userManagementLoading={userManagementLoading}
                  onLoadUsers={loadUsers}
                />
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
          <div className="card-icon">👥</div>
          <div className="card-content">
            <h3>Shared Expenses</h3>
            <p className="card-amount">{formatCurrency(stats.total_shared_expenses || 0)}</p>
            <p className="card-subtitle">{stats.shared_expense_count || 0} expenses</p>
          </div>
        </div>
        <div className="summary-card">
          <div className="card-icon">👤</div>
          <div className="card-content">
            <h3>Individual</h3>
            <p className="card-amount">{formatCurrency(stats.total_individual_expenses || 0)}</p>
          </div>
        </div>
        <div className="summary-card">
          <div className="card-icon">📊</div>
          <div className="card-content">
            <h3>Top Category</h3>
            <p className="card-category">{stats.top_category || 'None'}</p>
            <p className="card-amount">{formatCurrency(stats.top_category_amount || 0)}</p>
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
  const [editingExpense, setEditingExpense] = useState(null);
  const [sharingExpense, setSharingExpense] = useState(null);
  const [editFormData, setEditFormData] = useState({
    amount: '',
    category: '',
    description: '',
    date: ''
  });
  const [shareFormData, setShareFormData] = useState({
    email: '',
    permission: 'view'
  });
  const [expenseShares, setExpenseShares] = useState({});

  const getCategoryIcon = (categoryName) => {
    const category = categories.find(cat => cat.name === categoryName);
    return category ? category.icon : '📦';
  };

  const getCategoryColor = (categoryName) => {
    const category = categories.find(cat => cat.name === categoryName);
    return category ? category.color : '#8E8E93';
  };

  const handleEdit = (expense) => {
    setEditingExpense(expense.id);
    setEditFormData({
      amount: expense.amount.toString(),
      category: expense.category,
      description: expense.description,
      date: expense.date
    });
  };

  const handleSaveEdit = async (expenseId) => {
    try {
      console.log('Saving expense edit:', editFormData);
      
      const updateData = {
        amount: parseFloat(editFormData.amount),
        category: editFormData.category,
        description: editFormData.description,
        date: editFormData.date
      };

      await axios.put(`${API}/expenses/${expenseId}`, updateData, { withCredentials: true });
      
      setEditingExpense(null);
      setEditFormData({ amount: '', category: '', description: '', date: '' });
      onExpenseDeleted(); // Refresh the data
      alert('Expense updated successfully!');
    } catch (error) {
      console.error('Error updating expense:', error);
      alert(error.response?.data?.detail || 'Error updating expense');
    }
  };

  const handleCancelEdit = () => {
    setEditingExpense(null);
    setEditFormData({ amount: '', category: '', description: '', date: '' });
  };

  const handleShare = async (expense) => {
    setSharingExpense(expense.id);
    setShareFormData({ email: '', permission: 'view' });
    
    // Load existing shares
    try {
      const response = await axios.get(`${API}/expenses/${expense.id}/shares`, { withCredentials: true });
      setExpenseShares({ ...expenseShares, [expense.id]: response.data.shares });
    } catch (error) {
      console.error('Error loading shares:', error);
    }
  };

  const handleSaveShare = async (expenseId) => {
    try {
      await axios.post(`${API}/expenses/${expenseId}/share`, shareFormData, { withCredentials: true });
      
      // Reload shares
      const response = await axios.get(`${API}/expenses/${expenseId}/shares`, { withCredentials: true });
      setExpenseShares({ ...expenseShares, [expenseId]: response.data.shares });
      
      setShareFormData({ email: '', permission: 'view' });
      
      // Refresh all data to sync Shared expenses tab
      onExpenseDeleted();
      
      alert('Expense shared successfully!');
    } catch (error) {
      console.error('Error sharing expense:', error);
      alert(error.response?.data?.detail || 'Error sharing expense');
    }
  };

  const handleRemoveShare = async (expenseId, shareId) => {
    try {
      await axios.delete(`${API}/expenses/${expenseId}/shares/${shareId}`, { withCredentials: true });
      
      // Reload shares
      const response = await axios.get(`${API}/expenses/${expenseId}/shares`, { withCredentials: true });
      setExpenseShares({ ...expenseShares, [expenseId]: response.data.shares });
      
      // Refresh all data to sync Shared expenses tab
      onExpenseDeleted();
      
      alert('Share removed successfully!');
    } catch (error) {
      console.error('Error removing share:', error);
      alert(error.response?.data?.detail || 'Error removing share');
    }
  };

  const handleCancelShare = () => {
    setSharingExpense(null);
    setShareFormData({ email: '', permission: 'view' });
  };

  const canEdit = (expense) => {
    // Use backend role-based permissions if available, fallback to old logic
    return expense.can_edit !== undefined ? expense.can_edit : (expense.is_owned_by_me || expense.shared_permission === 'edit');
  };

  const canShare = (expense) => {
    // Use backend role-based permissions if available, fallback to old logic
    return expense.can_share !== undefined ? expense.can_share : expense.is_owned_by_me;
  };

  const canDelete = (expense) => {
    // Use backend role-based permissions if available, fallback to old logic
    return expense.can_delete !== undefined ? expense.can_delete : expense.is_owned_by_me;
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
            <div key={expense.id} className={`expense-item ${expense.is_shared_with_me ? 'shared-with-me' : ''}`}>
              {editingExpense === expense.id ? (
                // Edit Mode
                <div className="expense-edit-form">
                  <div className="edit-form-header">
                    <h4>✏️ Edit Expense</h4>
                  </div>
                  <div className="edit-form-content">
                    <div className="edit-form-row">
                      <div className="edit-form-group">
                        <label>Amount (₱)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editFormData.amount}
                          onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })}
                          className="edit-form-input"
                        />
                      </div>
                      <div className="edit-form-group">
                        <label>Category</label>
                        <select
                          value={editFormData.category}
                          onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                          className="edit-form-select"
                        >
                          {categories.map(cat => (
                            <option key={cat.name} value={cat.name}>
                              {cat.icon} {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="edit-form-row">
                      <div className="edit-form-group">
                        <label>Description</label>
                        <input
                          type="text"
                          value={editFormData.description}
                          onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                          className="edit-form-input"
                        />
                      </div>
                      <div className="edit-form-group">
                        <label>Date</label>
                        <input
                          type="date"
                          value={editFormData.date}
                          onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                          className="edit-form-input"
                        />
                      </div>
                    </div>
                    <div className="edit-form-actions">
                      <button 
                        onClick={() => handleSaveEdit(expense.id)}
                        className="save-edit-button"
                      >
                        ✅ Save
                      </button>
                      <button 
                        onClick={handleCancelEdit}
                        className="cancel-edit-button"
                      >
                        ❌ Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : sharingExpense === expense.id ? (
                // Share Mode
                <div className="expense-share-form">
                  <div className="share-form-header">
                    <h4>👥 Share Expense</h4>
                  </div>
                  <div className="share-form-content">
                    <div className="share-form-row">
                      <div className="share-form-group">
                        <label>Email Address</label>
                        <input
                          type="email"
                          value={shareFormData.email}
                          onChange={(e) => setShareFormData({ ...shareFormData, email: e.target.value })}
                          className="share-form-input"
                          placeholder="user@example.com"
                        />
                      </div>
                      <div className="share-form-group">
                        <label>Permission</label>
                        <select
                          value={shareFormData.permission}
                          onChange={(e) => setShareFormData({ ...shareFormData, permission: e.target.value })}
                          className="share-form-select"
                        >
                          <option value="view">👁️ View Only</option>
                          <option value="edit">✏️ View & Edit</option>
                        </select>
                      </div>
                    </div>
                    <div className="share-form-actions">
                      <button 
                        onClick={() => handleSaveShare(expense.id)}
                        className="save-share-button"
                      >
                        ➕ Share
                      </button>
                      <button 
                        onClick={handleCancelShare}
                        className="cancel-share-button"
                      >
                        ❌ Cancel
                      </button>
                    </div>
                    
                    {/* Existing Shares */}
                    {expenseShares[expense.id] && expenseShares[expense.id].length > 0 && (
                      <div className="existing-shares">
                        <h5>Currently Shared With:</h5>
                        {expenseShares[expense.id].map(share => (
                          <div key={share.id} className="share-item">
                            <span className="share-email">{share.shared_with_email}</span>
                            <span className="share-permission">
                              {share.permission === 'edit' ? '✏️ Edit' : '👁️ View'}
                            </span>
                            <button 
                              onClick={() => handleRemoveShare(expense.id, share.id)}
                              className="remove-share-button"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // View Mode
                <>
                  <div className="expense-icon" style={{ backgroundColor: getCategoryColor(expense.category) }}>
                    {getCategoryIcon(expense.category)}
                  </div>
                  <div className="expense-details">
                    <h4>{expense.description}</h4>
                    <p className="expense-category">{expense.category}</p>
                    <p className="expense-date">{new Date(expense.date).toLocaleDateString()}</p>
                    <div className="expense-badges">
                      {expense.is_shared && <span className="shared-badge">👥 Shared</span>}
                      {expense.is_shared_with_me && (
                        <span className="shared-with-me-badge">
                          {expense.shared_permission === 'edit' ? '✏️ Can Edit' : '👁️ View Only'}
                        </span>
                      )}
                      {expense.is_owned_by_me && <span className="owner-badge">👑 Owner</span>}
                    </div>
                  </div>
                  <div className="expense-amount">
                    <span>{formatCurrency(expense.amount)}</span>
                    <div className="expense-actions">
                      {canEdit(expense) && (
                        <button 
                          onClick={() => handleEdit(expense)}
                          className="edit-button"
                          title="Edit expense"
                        >
                          ✏️
                        </button>
                      )}
                      {canShare(expense) && (
                        <button 
                          onClick={() => handleShare(expense)}
                          className="share-button"
                          title="Share expense"
                        >
                          👥
                        </button>
                      )}
                      {canDelete(expense) && (
                        <button 
                          onClick={() => handleDelete(expense.id)}
                          className="delete-button"
                          title="Delete expense"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Shared Expenses Component
const SharedExpenses = ({ user, onExpenseAdded, refreshTrigger }) => {
  const [sharedExpenses, setSharedExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSharedData();
  }, []);

  // Refresh data when refreshTrigger changes (when expenses are modified/deleted from other tabs)
  useEffect(() => {
    if (refreshTrigger) {
      console.log('SharedExpenses: Refreshing due to data changes, trigger:', refreshTrigger);
      // Add a small delay to ensure backend cleanup is complete
      setTimeout(() => {
        loadSharedData();
      }, 500);
    }
  }, [refreshTrigger]);

  // Refresh when component becomes visible (tab switching)
  useEffect(() => {
    console.log('SharedExpenses: Component mounted or refreshed');
    loadSharedData();
  }, [user]);

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
  const [uploadingPreview, setUploadingPreview] = useState(false);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    console.log('File selected:', file.name, file.type, file.size);
    
    // Basic file validation
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!validExtensions.includes(fileExtension)) {
      alert(`Invalid file type. Please select a CSV or Excel file (.csv, .xlsx, .xls). You selected: ${fileExtension}`);
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      alert('File too large. Please select a file smaller than 10MB.');
      return;
    }

    setImportFile(file);
    setPreviewData(null);
    setImportResult(null);
    setUploadingPreview(true);

    try {
      console.log('Uploading file for preview...');
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`${API}/import/preview`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true
      });

      console.log('Preview response:', response.data);
      setPreviewData(response.data);
      setColumnMapping(response.data.detected_columns);
      
      alert(`File uploaded successfully! Found ${response.data.total_rows} rows of data.`);
    } catch (error) {
      console.error('Error previewing file:', error);
      console.error('Error response:', error.response?.data);
      
      let errorMessage = 'Error previewing file';
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response?.status === 401) {
        errorMessage = 'Authentication required. Please log in first.';
      } else if (error.response?.status === 413) {
        errorMessage = 'File too large. Please select a smaller file.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(`Upload failed: ${errorMessage}`);
    } finally {
      setUploadingPreview(false);
    }
  };

  const handleImport = async () => {
    if (!importFile || !previewData) {
      alert('Please select a file first');
      return;
    }

    // Validate required column mappings
    if (!columnMapping.amount || !columnMapping.description) {
      alert('Please map the required columns (Amount and Description) before importing');
      return;
    }

    setImporting(true);
    try {
      console.log('Starting import with mapping:', columnMapping);
      
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('column_mapping', JSON.stringify(columnMapping));

      const response = await axios.post(`${API}/import/execute`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true
      });

      console.log('Import response:', response.data);
      setImportResult(response.data);
      
      // Show success message
      const result = response.data;
      let message = `Import completed!\n`;
      message += `✅ Successfully imported: ${result.successful} expenses\n`;
      if (result.failed > 0) {
        message += `❌ Failed: ${result.failed} expenses\n`;
        message += `Check the results below for details.`;
      }
      
      alert(message);
      onImportComplete();
      
    } catch (error) {
      console.error('Error importing file:', error);
      console.error('Error response:', error.response?.data);
      
      let errorMessage = 'Error importing file';
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response?.status === 401) {
        errorMessage = 'Authentication required. Please log in first.';
      } else if (error.response?.data?.errors) {
        const errors = error.response.data.errors;
        errorMessage = `Import validation errors: ${errors.map(e => e.msg).join(', ')}`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(`Import failed: ${errorMessage}\n\nPlease check the console for more details.`);
    }
    setImporting(false);
  };

  return (
    <div className="import-manager">
      <h2>Import Expenses from Spreadsheet</h2>
      
      <div className="import-section">
        <div className="file-upload-section">
          <h3>1. Select File</h3>
          {uploadingPreview ? (
            <div className="uploading-state">
              <div className="spinner"></div>
              <p>Processing file...</p>
            </div>
          ) : (
            <>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="file-input"
              />
              <p className="file-help">Supported formats: CSV, Excel (.xlsx, .xls)</p>
              {importFile && (
                <p className="file-selected">Selected: {importFile.name}</p>
              )}
            </>
          )}
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
// Settings Component
const Settings = ({ user, users, availableRoles, onAssignRole, onRemoveUser, userManagementLoading, onLoadUsers }) => {
  const [activeSettingsTab, setActiveSettingsTab] = useState('general');

  useEffect(() => {
    // Load users when user management tab is accessed
    if (activeSettingsTab === 'users' && (user?.role === 'owner' || user?.role === 'co_owner')) {
      onLoadUsers();
    }
  }, [activeSettingsTab, user?.role, onLoadUsers]);

  return (
    <div className="settings">
      <div className="section-header">
        <h2>⚙️ Settings</h2>
        <p>Manage your application preferences and system settings</p>
      </div>

      {/* Settings Navigation */}
      <div className="settings-nav">
        <button 
          className={`settings-nav-button ${activeSettingsTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveSettingsTab('general')}
        >
          🏠 General
        </button>
        <button 
          className={`settings-nav-button ${activeSettingsTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveSettingsTab('profile')}
        >
          👤 Profile
        </button>
        {(user?.role === 'owner' || user?.role === 'co_owner') && (
          <button 
            className={`settings-nav-button ${activeSettingsTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveSettingsTab('users')}
          >
            👥 User Management
          </button>
        )}
        <button 
          className={`settings-nav-button ${activeSettingsTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveSettingsTab('about')}
        >
          ℹ️ About
        </button>
      </div>

      {/* Settings Content */}
      <div className="settings-content">
        {activeSettingsTab === 'general' && (
          <GeneralSettings />
        )}
        
        {activeSettingsTab === 'profile' && (
          <ProfileSettings user={user} />
        )}
        
        {activeSettingsTab === 'users' && (user?.role === 'owner' || user?.role === 'co_owner') && (
          <UserManagement 
            users={users} 
            availableRoles={availableRoles}
            onAssignRole={onAssignRole}
            onRemoveUser={onRemoveUser}
            loading={userManagementLoading}
            currentUser={user}
          />
        )}
        
        {activeSettingsTab === 'about' && (
          <AboutSettings />
        )}
      </div>
    </div>
  );
};

// User Management Component (now part of Settings)
const UserManagement = ({ users, availableRoles, onAssignRole, onRemoveUser, loading, currentUser }) => {
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignFormData, setAssignFormData] = useState({
    email: '',
    role: 'viewer'
  });

  const handleAssignRole = async (e) => {
    e.preventDefault();
    if (!assignFormData.email.trim()) {
      alert('Please enter an email address');
      return;
    }
    
    await onAssignRole(assignFormData.email, assignFormData.role);
    setAssignFormData({ email: '', role: 'viewer' });
    setShowAssignForm(false);
  };

  const getRoleLabel = (role) => {
    const roleObj = availableRoles.find(r => r.value === role);
    return roleObj ? roleObj.label : role;
  };

  const getRoleBadgeClass = (role) => {
    switch(role) {
      case 'owner': return 'role-owner';
      case 'co_owner': return 'role-co-owner';
      case 'editor': return 'role-editor';
      case 'viewer': return 'role-viewer';
      default: return 'role-viewer';
    }
  };

  return (
    <div className="user-management">
      <div className="section-header">
        <h2>👤 User Management</h2>
        <p>Manage user roles and permissions</p>
      </div>

      {loading ? (
        <div className="loading">Loading users...</div>
      ) : (
        <>
          <div className="user-actions">
            <button 
              className="add-user-button"
              onClick={() => setShowAssignForm(!showAssignForm)}
            >
              ➕ Assign Role to User
            </button>
          </div>

          {showAssignForm && (
            <div className="assign-role-form">
              <h3>Assign Role to User</h3>
              <form onSubmit={handleAssignRole}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      value={assignFormData.email}
                      onChange={(e) => setAssignFormData({ ...assignFormData, email: e.target.value })}
                      placeholder="user@example.com"
                      className="form-input"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Role</label>
                    <select
                      value={assignFormData.role}
                      onChange={(e) => setAssignFormData({ ...assignFormData, role: e.target.value })}
                      className="form-select"
                    >
                      {availableRoles.map(role => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="submit-button">
                    ✅ Assign Role
                  </button>
                  <button 
                    type="button" 
                    className="cancel-button"
                    onClick={() => setShowAssignForm(false)}
                  >
                    ❌ Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="users-list">
            <h3>System Users ({users.length})</h3>
            {users.length === 0 ? (
              <div className="no-users">
                <p>No users found.</p>
              </div>
            ) : (
              <div className="users-grid">
                {users.map(user => (
                  <div key={user.email} className="user-card">
                    <div className="user-info">
                      <img src={user.picture} alt={user.name} className="user-avatar-large" />
                      <div className="user-details">
                        <h4>{user.name}</h4>
                        <p className="user-email">{user.email}</p>
                        <span className={`role-badge ${getRoleBadgeClass(user.role)}`}>
                          {getRoleLabel(user.role).split(' - ')[0]}
                        </span>
                        <p className="user-created">
                          Joined: {new Date(user.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="user-actions">
                      <select
                        value={user.role}
                        onChange={(e) => onAssignRole(user.email, e.target.value)}
                        className="role-select"
                        disabled={user.email === currentUser?.email}
                      >
                        {availableRoles.map(role => (
                          <option key={role.value} value={role.value}>
                            {role.label.split(' - ')[0]}
                          </option>
                        ))}
                      </select>
                      {user.email !== currentUser?.email && (
                        <button 
                          className="remove-user-button"
                          onClick={() => onRemoveUser(user.email)}
                          title="Remove user"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// General Settings Component
const GeneralSettings = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [currency, setCurrency] = useState('PHP');
  const [dateFormat, setDateFormat] = useState('MM/DD/YYYY');

  return (
    <div className="settings-section">
      <h3>🏠 General Settings</h3>
      <div className="settings-grid">
        <div className="setting-item">
          <label className="setting-label">Theme</label>
          <div className="setting-control">
            <select 
              value={darkMode ? 'dark' : 'light'} 
              onChange={(e) => setDarkMode(e.target.value === 'dark')}
              className="setting-select"
            >
              <option value="light">🌞 Light Mode</option>
              <option value="dark">🌙 Dark Mode</option>
            </select>
          </div>
          <p className="setting-description">Choose your preferred theme</p>
        </div>

        <div className="setting-item">
          <label className="setting-label">Currency</label>
          <div className="setting-control">
            <select 
              value={currency} 
              onChange={(e) => setCurrency(e.target.value)}
              className="setting-select"
            >
              <option value="PHP">🇵🇭 Philippine Peso (₱)</option>
              <option value="USD">🇺🇸 US Dollar ($)</option>
              <option value="EUR">🇪🇺 Euro (€)</option>
              <option value="GBP">🇬🇧 British Pound (£)</option>
            </select>
          </div>
          <p className="setting-description">Default currency for new expenses</p>
        </div>

        <div className="setting-item">
          <label className="setting-label">Date Format</label>
          <div className="setting-control">
            <select 
              value={dateFormat} 
              onChange={(e) => setDateFormat(e.target.value)}
              className="setting-select"
            >
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>
          <p className="setting-description">How dates are displayed throughout the app</p>
        </div>
      </div>
    </div>
  );
};

// Profile Settings Component
const ProfileSettings = ({ user }) => {
  return (
    <div className="settings-section">
      <h3>👤 Profile Settings</h3>
      <div className="profile-card">
        <div className="profile-info">
          <img src={user?.picture} alt={user?.name} className="profile-avatar" />
          <div className="profile-details">
            <h4>{user?.name}</h4>
            <p className="profile-email">{user?.email}</p>
            <span className={`profile-role-badge role-${user?.role}`}>
              {user?.role === 'owner' && '👑 Owner'}
              {user?.role === 'co_owner' && '🤝 Co-owner'}
              {user?.role === 'editor' && '✏️ Editor'}
              {user?.role === 'viewer' && '👁️ Viewer'}
            </span>
          </div>
        </div>
        
        <div className="profile-stats">
          <div className="stat-item">
            <span className="stat-label">Role</span>
            <span className="stat-value">{user?.role?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Member Since</span>
            <span className="stat-value">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</span>
          </div>
        </div>

        <div className="profile-permissions">
          <h5>Your Permissions</h5>
          <div className="permissions-list">
            <div className="permission-item">
              <span className="permission-icon">👁️</span>
              <span>View all expenses</span>
            </div>
            {(user?.role === 'editor' || user?.role === 'owner' || user?.role === 'co_owner') && (
              <div className="permission-item">
                <span className="permission-icon">✏️</span>
                <span>{user?.role === 'editor' ? 'Edit your own expenses' : 'Edit any expense'}</span>
              </div>
            )}
            {(user?.role === 'editor' || user?.role === 'owner' || user?.role === 'co_owner') && (
              <div className="permission-item">
                <span className="permission-icon">🗑️</span>
                <span>{user?.role === 'editor' ? 'Delete your own expenses' : 'Delete any expense'}</span>
              </div>
            )}
            {(user?.role === 'editor' || user?.role === 'owner') && (
              <div className="permission-item">
                <span className="permission-icon">👥</span>
                <span>{user?.role === 'editor' ? 'Share your own expenses' : 'Share any expense'}</span>
              </div>
            )}
            {(user?.role === 'owner' || user?.role === 'co_owner') && (
              <div className="permission-item">
                <span className="permission-icon">⚙️</span>
                <span>Manage users and system settings</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// About Settings Component
const AboutSettings = () => {
  return (
    <div className="settings-section">
      <h3>ℹ️ About SpendWise</h3>
      <div className="about-content">
        <div className="app-info">
          <div className="app-logo">
            <h2>SpendWise</h2>
            <p>Smart expense tracking</p>
          </div>
          
          <div className="app-details">
            <div className="detail-item">
              <span className="detail-label">Version</span>
              <span className="detail-value">2.0.0</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Build</span>
              <span className="detail-value">RBAC-2024</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Last Updated</span>
              <span className="detail-value">{new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        <div className="features-list">
          <h4>✨ Features</h4>
          <ul>
            <li>📊 Real-time expense tracking and analytics</li>
            <li>👥 Role-based access control (Owner, Co-owner, Editor, Viewer)</li>
            <li>🤝 Collaborative expense sharing</li>
            <li>📄 Spreadsheet import (CSV, Excel)</li>
            <li>🏷️ Custom categories with emoji picker</li>
            <li>📱 Mobile-responsive design</li>
            <li>🔒 Google OAuth authentication</li>
            <li>🌙 Dark/Light mode support</li>
          </ul>
        </div>

        <div className="tech-stack">
          <h4>🛠️ Tech Stack</h4>
          <div className="tech-badges">
            <span className="tech-badge">React</span>
            <span className="tech-badge">FastAPI</span>
            <span className="tech-badge">MongoDB</span>
            <span className="tech-badge">D3.js</span>
            <span className="tech-badge">Tailwind CSS</span>
          </div>
        </div>
      </div>
    </div>
  );
};

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