import React, { useState, useEffect } from 'react';
import './App.css';
import axios from 'axios';
import * as d3 from 'd3';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Philippine Peso formatter
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }).format(amount);
};

// Main App Component
function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [expenses, setExpenses] = useState([]);
  const [stats, setStats] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedYear]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load categories
      const categoriesRes = await axios.get(`${API}/categories`);
      setCategories(categoriesRes.data);

      // Load expenses
      const expensesRes = await axios.get(`${API}/expenses?month=${selectedMonth}&year=${selectedYear}`);
      setExpenses(expensesRes.data);

      // Load stats
      const statsRes = await axios.get(`${API}/expenses/stats?month=${selectedMonth}&year=${selectedYear}`);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
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
              <button 
                className="mode-toggle"
                onClick={toggleDarkMode}
                aria-label="Toggle dark mode"
              >
                {darkMode ? '☀️' : '🌙'}
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
                <AddExpense categories={categories} onExpenseAdded={loadData} />
              )}
              {currentView === 'expenses' && (
                <ExpensesList expenses={expenses} categories={categories} onExpenseDeleted={loadData} />
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

// Add Expense Component
const AddExpense = ({ categories, onExpenseAdded }) => {
  const [formData, setFormData] = useState({
    amount: '',
    category: 'Grocery',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/expenses`, formData);
      setFormData({
        amount: '',
        category: 'Grocery',
        description: '',
        date: new Date().toISOString().split('T')[0]
      });
      onExpenseAdded();
      alert('Expense added successfully!');
    } catch (error) {
      console.error('Error adding expense:', error);
      alert('Error adding expense');
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
        await axios.delete(`${API}/expenses/${expenseId}`);
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

export default App;