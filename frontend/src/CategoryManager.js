import React, { useState } from 'react';
import './CategoryManager.css';

// Emoji categories for the emoji picker
const EMOJI_CATEGORIES = {
  'Food & Drink': ['🍔', '🍕', '🍝', '🍜', '🍲', '🥗', '🍱', '🍣', '🍤', '🥟', '🍚', '🍙', '🥙', '🌮', '🌯', '🥪', '🍖', '🥩', '🍗', '🥓', '🍟', '🍿', '🥨', '🥯', '🧀', '🥞', '🧇', '🍰', '🎂', '🧁', '🥧', '🍮', '🍭', '🍬', '🍫', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '☕', '🍵', '🧃', '🥤', '🍶', '🍾', '🍷', '🍸', '🍹', '🍺', '🍻', '🥂', '🥃'],
  'Activities': ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️', '🤺', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫', '🎟️', '🎪', '🤹', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼', '🎵', '🎶', '🥁', '🪘', '🎹', '🎷', '🎺', '🪗', '🎸', '🪕', '🎻'],
  'Travel & Places': ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🛰️', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓', '⛽', '🚧', '🚦', '🚥', '🗺️', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟️', '🎡', '🎢', '🎠', '⛲', '⛱️', '🏖️', '🏝️', '🏜️', '🌋', '⛰️', '🏔️', '🗻', '🏕️', '⛺', '🛖', '🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌', '🛕', '🕍', '⛩️', '🕋'],
  'Objects': ['⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🧰', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🔩', '⚙️', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '⚔️', '🛡️', '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🪣', '🧽', '🧴', '🛎️', '🔑', '🗝️', '🚪', '🪑', '🛋️', '🛏️', '🛌', '🧸', '🪆', '🖼️', '🪞', '🪟', '🛍️', '🛒', '🎁', '🎈', '🎏', '🎀', '🪄', '🪅'],
  'Symbols': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🛗', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '⚧️', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']
};

const CategoryManager = ({ user, categories, colorPalette, loading, onCreateCategory, onUpdateCategory, onDeleteCategory, onRefresh }) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    emoji: '📝',
    color: '#007AFF'
  });

  const handleCreateNew = () => {
    setFormData({ name: '', emoji: '📝', color: '#007AFF' });
    setEditingCategory(null);
    setShowCreateForm(true);
  };

  const handleEdit = (category) => {
    setFormData({
      name: category.name,
      emoji: category.emoji,
      color: category.color
    });
    setEditingCategory(category);
    setShowCreateForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Please enter a category name');
      return;
    }

    try {
      if (editingCategory) {
        await onUpdateCategory(editingCategory.id, formData);
      } else {
        await onCreateCategory(formData);
      }
      setShowCreateForm(false);
      setEditingCategory(null);
      setFormData({ name: '', emoji: '📝', color: '#007AFF' });
    } catch (error) {
      console.error('Error submitting category:', error);
    }
  };

  const handleCancel = () => {
    setShowCreateForm(false);
    setEditingCategory(null);
    setFormData({ name: '', emoji: '📝', color: '#007AFF' });
  };

  const handleEmojiSelect = (emoji) => {
    setFormData({ ...formData, emoji });
    setShowEmojiPicker(false);
  };

  const handleColorSelect = (color) => {
    setFormData({ ...formData, color });
  };

  if (loading) {
    return (
      <div className="category-manager">
        <div className="loading">Loading categories...</div>
      </div>
    );
  }

  const systemCategories = categories.filter(cat => cat.is_system);
  const customCategories = categories.filter(cat => !cat.is_system);

  return (
    <div className="category-manager">
      <div className="category-manager-header">
        <h2>🏷️ Category Management</h2>
        <div className="category-actions">
          <button onClick={onRefresh} className="refresh-btn" disabled={loading}>
            🔄 Refresh
          </button>
          {(user?.role === 'owner' || user?.role === 'co_owner') && (
            <button onClick={handleCreateNew} className="create-category-btn">
              ➕ New Category
            </button>
          )}
        </div>
      </div>

      {showCreateForm && (
        <div className="category-form-modal">
          <div className="category-form">
            <h3>{editingCategory ? 'Edit Category' : 'Create New Category'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Category Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter category name"
                  className="category-name-input"
                  required
                />
              </div>

              <div className="form-group">
                <label>Color</label>
                <div className="color-palette">
                  {colorPalette.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      className={`color-option ${formData.color === color.value ? 'selected' : ''}`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => handleColorSelect(color.value)}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Emoji</label>
                <div className="emoji-selector">
                  <button
                    type="button"
                    className="emoji-display"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  >
                    {formData.emoji}
                  </button>
                  {showEmojiPicker && (
                    <div className="emoji-picker">
                      {Object.entries(EMOJI_CATEGORIES).map(([categoryName, emojis]) => (
                        <div key={categoryName} className="emoji-category">
                          <h4>{categoryName}</h4>
                          <div className="emoji-grid">
                            {emojis.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                className="emoji-option"
                                onClick={() => handleEmojiSelect(emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="submit-btn">
                  {editingCategory ? 'Update Category' : 'Create Category'}
                </button>
                <button type="button" onClick={handleCancel} className="cancel-btn">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="categories-section">
        <h3>System Categories</h3>
        <div className="categories-grid">
          {systemCategories.map((category) => (
            <div key={category.id} className="category-card system">
              <div className="category-header">
                <div className="category-icon" style={{ backgroundColor: category.color }}>
                  {category.emoji}
                </div>
                <div className="category-info">
                  <h4>{category.name}</h4>
                  <span className="category-type">System Default</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="categories-section">
        <h3>Custom Categories ({customCategories.length})</h3>
        {customCategories.length === 0 ? (
          <div className="no-categories">
            <p>No custom categories created yet.</p>
            {(user?.role === 'owner' || user?.role === 'co_owner') && (
              <button onClick={handleCreateNew} className="create-first-category-btn">
                Create Your First Category
              </button>
            )}
          </div>
        ) : (
          <div className="categories-grid">
            {customCategories.map((category) => (
              <div key={category.id} className="category-card custom">
                <div className="category-header">
                  <div className="category-icon" style={{ backgroundColor: category.color }}>
                    {category.emoji}
                  </div>
                  <div className="category-info">
                    <h4>{category.name}</h4>
                    <span className="category-type">Custom</span>
                  </div>
                </div>
                {(user?.role === 'owner' || user?.role === 'co_owner') && (
                  <div className="category-actions">
                    <button 
                      onClick={() => handleEdit(category)}
                      className="edit-category-btn"
                      title="Edit category"
                    >
                      ✏️
                    </button>
                    <button 
                      onClick={() => onDeleteCategory(category.id)}
                      className="delete-category-btn"
                      title="Delete category"
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryManager;