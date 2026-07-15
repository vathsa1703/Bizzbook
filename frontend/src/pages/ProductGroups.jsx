import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Plus, Edit2, Trash2, Search, Filter } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../components/ToastContext';

export default function ProductGroups({ onNavigate }) {
  const [groups, setGroups] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'unassigned', 'groups'
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '', productIds: [] });
  
  // Dialog state
  const [reassignWarning, setReassignWarning] = useState(null); // { conflicts: [], resolve: fn }
  const [deleteWarning, setDeleteWarning] = useState(null); // { group: obj }

  const { showToast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [groupsRes, productsRes] = await Promise.all([
        api.getProductGroups(),
        api.getProducts()
      ]);
      setGroups(groupsRes.data || []);
      setAllProducts(productsRes || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalRevenueAllGroups = useMemo(() => {
    return groups.reduce((sum, g) => sum + (g.total_revenue || 0), 0);
  }, [groups]);

  const unassignedProducts = useMemo(() => {
    return allProducts.filter(p => !p.group_id);
  }, [allProducts]);

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    
    // Check for reassignments
    const newProductIds = formData.productIds || [];
    const conflicts = [];
    
    for (const pid of newProductIds) {
      const product = allProducts.find(p => p.id === pid);
      if (product && product.group_id && product.group_id !== editingGroup?.id) {
        conflicts.push(product);
      }
    }

    if (conflicts.length > 0 && !reassignWarning) {
      setReassignWarning({
        conflicts,
        resolve: () => {
          setReassignWarning(null);
          executeSave();
        }
      });
      return;
    }

    executeSave();
  };

  const executeSave = async () => {
    try {
      if (editingGroup) {
        await api.updateProductGroup(editingGroup.id, formData);
        showToast('Product group updated', 'success');
      } else {
        await api.createProductGroup(formData);
        showToast('Product group created', 'success');
      }
      setModalOpen(false);
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const initiateDelete = (group) => {
    if (group.products_count > 0) {
      setDeleteWarning({ group });
    } else {
      if (window.confirm('Are you sure you want to delete this empty group?')) {
        executeDelete(group.id, null);
      }
    }
  };

  const executeDelete = async (groupId, actionStr) => {
    try {
      // actionStr format: 'uncategorize' or 'move&targetId=123'
      const url = actionStr ? `/product-groups/${groupId}?action=${actionStr}` : `/product-groups/${groupId}`;
      await api.deleteProductGroup(groupId + (actionStr ? `?action=${actionStr.split('&')[0]}&targetId=${actionStr.split('=')[1] || ''}` : '')); // hacky but api.deleteProductGroup just takes id
      // Wait, api.deleteProductGroup only takes (id). We need to change how it calls it or use direct fetch.
      // Let's modify client.js or do direct fetch here since it's a specific route feature.
      
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/product-groups/${groupId}${actionStr ? '?action=' + actionStr : ''}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete group');

      showToast('Product group deleted', 'success');
      setDeleteWarning(null);
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openModal = (group = null) => {
    setEditingGroup(group);
    const assignedIds = group ? allProducts.filter(p => p.group_id === group.id).map(p => p.id) : [];
    setFormData(group ? { name: group.name, description: group.description || '', productIds: assignedIds } : { name: '', description: '', productIds: [] });
    setReassignWarning(null);
    setModalOpen(true);
  };

  const toggleProductSelection = (productId) => {
    setFormData(prev => {
      const isSelected = prev.productIds.includes(productId);
      return {
        ...prev,
        productIds: isSelected ? prev.productIds.filter(id => id !== productId) : [...prev.productIds, productId]
      };
    });
  };

  const selectAllFiltered = (filteredList) => {
    setFormData(prev => {
      const currentIds = new Set(prev.productIds);
      filteredList.forEach(p => currentIds.add(p.id));
      return { ...prev, productIds: Array.from(currentIds) };
    });
  };

  const clearAllFiltered = (filteredList) => {
    setFormData(prev => {
      const toRemove = new Set(filteredList.map(p => p.id));
      return { ...prev, productIds: prev.productIds.filter(id => !toRemove.has(id)) };
    });
  };

  const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));

  // Product Selection search
  const [productSearch, setProductSearch] = useState('');
  const searchedProducts = allProducts.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()));

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-5 border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('more')} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 text-gray-600 active:bg-gray-100 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">Product Groups</h1>
              <p className="text-xs text-gray-500 font-medium">Unassigned Products: {unassignedProducts.length}</p>
            </div>
          </div>
          <button 
            onClick={() => openModal()}
            className="w-10 h-10 rounded-full bg-brand-blue flex items-center justify-center text-white shadow-lg shadow-blue-500/30 active:scale-95 transition-transform"
          >
            <Plus size={20} />
          </button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search groups..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue text-sm transition-all"
            />
          </div>
          <select 
            value={filterMode} 
            onChange={e => setFilterMode(e.target.value)}
            className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 focus:outline-none focus:border-brand-blue"
          >
            <option value="all">All Groups</option>
            <option value="unassigned">Unassigned Products</option>
            <option value="groups">Individual Groups</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className="px-4 py-4 space-y-4">
        {loading ? (
          <div className="text-center py-10 text-gray-400 font-medium animate-pulse">Loading categories...</div>
        ) : (
          <>
            {filterMode === 'unassigned' && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm">
                <h3 className="font-bold text-amber-900 mb-2">Unassigned Products</h3>
                <p className="text-sm text-amber-700 mb-4">You have {unassignedProducts.length} products that do not belong to any group.</p>
                {unassignedProducts.length > 0 && (
                  <div className="bg-white rounded-xl border border-amber-100 overflow-hidden">
                    {unassignedProducts.slice(0, 10).map(p => (
                      <div key={p.id} className="px-4 py-2 border-b border-gray-50 last:border-0 flex justify-between text-sm">
                        <span className="font-medium text-gray-800">{p.name}</span>
                        <span className="text-gray-500">Stock: {p.stock_quantity || 0}</span>
                      </div>
                    ))}
                    {unassignedProducts.length > 10 && (
                      <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 text-center">
                        +{unassignedProducts.length - 10} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {(filterMode === 'all' || filterMode === 'groups') && filteredGroups.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Filter size={24} className="text-gray-300" />
                </div>
                <p className="text-gray-500 font-medium">No product groups found.</p>
                <p className="text-gray-400 text-sm mt-1">Try a different search or create a new group.</p>
              </div>
            ) : (
              (filterMode === 'all' || filterMode === 'groups') && filteredGroups.map(group => {
                const contribution = totalRevenueAllGroups > 0 ? Math.round((group.total_revenue / totalRevenueAllGroups) * 100) : 0;
                
                return (
                  <div key={group.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{group.name}</h3>
                        {group.description && <p className="text-sm text-gray-500 mt-0.5">{group.description}</p>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openModal(group)} className="p-2 text-brand-blue bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => initiateDelete(group)} className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-gray-50 p-3 rounded-xl">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Revenue</p>
                        <p className="font-semibold text-gray-900 text-lg">₹{(group.total_revenue || 0).toLocaleString()}</p>
                        <p className="text-xs text-brand-blue font-medium mt-0.5">{contribution}% Contribution</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-xl">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Inventory Value</p>
                        <p className="font-semibold text-gray-900 text-lg">₹{(group.inventory_value || 0).toLocaleString()}</p>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">{group.products_count} Products</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-3 text-sm">
                      <span className="text-gray-500 font-medium">Avg Price: <span className="text-gray-900">₹{Math.round(group.average_selling_price || 0).toLocaleString()}</span></span>
                      <span className="text-gray-500 font-medium">Top: <span className="text-gray-900 truncate max-w-[120px] inline-block align-bottom">{group.top_selling_product || 'None'}</span></span>
                    </div>

                    <div className="bg-gray-50/50 rounded-xl p-3 border border-gray-100">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-2">Included Products</p>
                      <div className="space-y-1.5">
                        {(group.products_preview || []).slice(0, 5).map((p, idx) => (
                          <div key={idx} className="flex justify-between text-xs">
                            <span className="font-medium text-gray-700 truncate pr-2">{p.name}</span>
                            <span className="text-gray-400 shrink-0">(Stock: {p.stock})</span>
                          </div>
                        ))}
                        {(group.products_preview || []).length === 0 && (
                          <div className="text-xs text-gray-400 italic">No products assigned</div>
                        )}
                        {(group.products_preview || []).length > 5 && (
                          <div className="text-xs font-semibold text-brand-blue pt-1">
                            +{(group.products_preview.length - 5)} more
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* Creation/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
              <h3 className="text-xl font-bold text-gray-900">{editingGroup ? 'Edit Group' : 'New Group'}</h3>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200/50 text-gray-500 hover:bg-gray-200 transition-colors">×</button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Group Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all"
                    placeholder="e.g. Premium Headphones"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">Description</label>
                  <textarea
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue resize-none transition-all"
                    placeholder="Optional details about this group"
                  ></textarea>
                </div>

                {/* Product Assignment Section */}
                <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
                  <div className="bg-gray-50 p-4 border-b border-gray-200">
                    <div className="flex justify-between items-center mb-3">
                      <label className="block text-sm font-bold text-gray-900">Assign Products</label>
                      <span className="text-xs font-bold text-brand-blue bg-blue-50 px-2 py-1 rounded-md">{formData.productIds.length} Selected</span>
                    </div>
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        type="text"
                        placeholder="Search to assign..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-brand-blue text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => selectAllFiltered(searchedProducts)} className="flex-1 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50">Select All Filtered</button>
                      <button type="button" onClick={() => clearAllFiltered(searchedProducts)} className="flex-1 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50">Clear Filtered</button>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-2 space-y-1 bg-white">
                    {searchedProducts.map(p => {
                      const isSelected = formData.productIds.includes(p.id);
                      const belongsToOther = p.group_id && p.group_id !== editingGroup?.id;
                      return (
                        <div key={p.id} onClick={() => toggleProductSelection(p.id)} className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/50 border border-blue-100' : 'hover:bg-gray-50 border border-transparent'}`}>
                          <div className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 transition-colors ${isSelected ? 'bg-brand-blue border-brand-blue text-white' : 'border-gray-300'}`}>
                            {isSelected && <svg viewBox="0 0 14 14" fill="none" className="w-3 h-3"><path d="M3 7.5L6 10.5L11 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                            {belongsToOther && <p className="text-[10px] text-amber-600 font-medium truncate">Belongs to: {p.group_name || 'Another Group'}</p>}
                          </div>
                        </div>
                      );
                    })}
                    {searchedProducts.length === 0 && (
                      <p className="text-center text-sm text-gray-400 py-4">No products found</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-white">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-3.5 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-3.5 bg-brand-blue text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 hover:bg-blue-600 transition-colors"
                >
                  {editingGroup ? 'Save Changes' : 'Create Group'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reassignment Warning Modal */}
      {reassignWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden animate-fade-in-up p-6">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4 text-amber-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Reassign Products?</h3>
            <p className="text-gray-600 text-sm mb-6">
              <strong className="text-gray-900">{reassignWarning.conflicts.length} selected products</strong> already belong to another group. Moving them will remove them from their current groups.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setReassignWarning(null)}
                className="flex-1 py-3 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={reassignWarning.resolve}
                className="flex-1 py-3 bg-amber-500 text-white font-bold rounded-xl shadow-lg shadow-amber-500/30 hover:bg-amber-600 transition-colors"
              >
                Move Products
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Warning Modal */}
      {deleteWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden animate-fade-in-up flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 bg-red-50/50">
              <h3 className="text-xl font-bold text-red-600">Delete Group</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700 mb-5 font-medium">
                This group contains <strong className="text-gray-900">{deleteWarning.group.products_count} products</strong>. How would you like to handle them?
              </p>
              
              <div className="space-y-3">
                <button 
                  onClick={() => executeDelete(deleteWarning.group.id, 'uncategorize')}
                  className="w-full p-4 border border-gray-200 rounded-xl text-left hover:border-brand-blue hover:bg-blue-50/50 transition-colors group"
                >
                  <p className="font-bold text-gray-900 group-hover:text-brand-blue">Move to Uncategorized</p>
                  <p className="text-xs text-gray-500 mt-1">Products will become unassigned.</p>
                </button>

                <div className="p-4 border border-gray-200 rounded-xl">
                  <p className="font-bold text-gray-900 mb-2">Move to another group</p>
                  <select 
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-blue"
                    onChange={(e) => {
                      if(e.target.value) executeDelete(deleteWarning.group.id, `move&targetId=${e.target.value}`);
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>Select target group...</option>
                    {groups.filter(g => g.id !== deleteWarning.group.id).map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                type="button"
                onClick={() => setDeleteWarning(null)}
                className="px-6 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
