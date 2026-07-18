import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Plus, Trash2, Zap } from 'lucide-react';
import { automationSchema } from '../../config/automationSchema';
import AutomationTemplates from './AutomationTemplates';
import { api } from '../../api/client';

export default function AutomationForm({ onCancel, onSaved }) {
  const [name, setName] = useState('New Automation');
  const [eventType, setEventType] = useState('');
  const [conditions, setConditions] = useState([]);
  const [delayMinutes, setDelayMinutes] = useState(0);
  const [actionType, setActionType] = useState('');
  const [actionPayload, setActionPayload] = useState({});
  const [saving, setSaving] = useState(false);

  const selectedTrigger = automationSchema.triggers.find(t => t.id === eventType);
  const selectedAction = automationSchema.actions.find(a => a.id === actionType);

  const applyTemplate = (template) => {
    setName(template.name);
    setEventType(template.payload.event_type);
    setConditions(template.payload.conditions || []);
    setDelayMinutes(template.payload.delay_minutes);
    setActionType(template.payload.action_type);
    setActionPayload(template.payload.action_payload || {});
  };

  const addCondition = () => {
    if (!selectedTrigger?.fields?.length) return;
    setConditions([...conditions, { field: selectedTrigger.fields[0].id, operator: '=', value: '' }]);
  };

  const updateCondition = (index, key, val) => {
    const newConditions = [...conditions];
    newConditions[index][key] = val;
    setConditions(newConditions);
  };

  const removeCondition = (index) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!eventType || !actionType) return alert('Please select a trigger and an action.');
    setSaving(true);
    try {
      await api.automations.create({
        name,
        event_type: eventType,
        conditions,
        delay_minutes: delayMinutes,
        action_type: actionType,
        action_payload: actionPayload
      });
      onSaved();
    } catch (err) {
      console.error(err);
      alert('Failed to save automation');
    } finally {
      setSaving(false);
    }
  };

  const getSummary = () => {
    if (!selectedTrigger || !selectedAction) return "Select a trigger and an action to see the summary.";
    
    let summary = `When ${selectedTrigger.label.toLowerCase()} happens`;
    
    if (conditions.length > 0) {
      summary += ` and ${conditions.length} condition(s) are met`;
    }
    
    const delayObj = automationSchema.delays.find(d => d.id === parseInt(delayMinutes));
    const delayText = delayObj ? delayObj.label.toLowerCase() : `after ${delayMinutes} minutes`;
    
    summary += `, ${delayText}, automatically ${selectedAction.label.toLowerCase()}.`;
    return summary;
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-center space-x-4 mb-6">
        <button onClick={onCancel} className="p-2 hover:bg-panel2 dark:hover:bg-panel2-dark rounded-full transition"><ArrowLeft className="w-5 h-5 text-inkB dark:text-inkB-dark" /></button>
        <h2 className="text-2xl font-bold text-inkA dark:text-inkA-dark flex-1">Create Automation</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : 'Save & Activate'}</span>
        </button>
      </div>

      <AutomationTemplates onSelectTemplate={applyTemplate} />

      <div className="bg-panel dark:bg-panel-dark rounded-xl shadow-sm border border-edge dark:border-edge-dark overflow-hidden">
        
        {/* Name */}
        <div className="p-6 border-b border-edge dark:border-edge-dark">
          <label className="block text-sm font-semibold text-inkB dark:text-inkB-dark mb-2">Automation Name</label>
          <input 
            type="text" 
            value={name} 
            onChange={e => setName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Step 1: Trigger */}
        <div className="p-6 border-b border-edge dark:border-edge-dark bg-panel2/50 dark:bg-panel2-dark/50">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center font-bold">1</div>
            <h3 className="text-lg font-semibold text-inkA dark:text-inkA-dark">When...</h3>
          </div>
          <select 
            value={eventType} 
            onChange={e => { setEventType(e.target.value); setConditions([]); }}
            className="w-full md:w-1/2 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="">Select a trigger</option>
            {automationSchema.triggers.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Step 2: Conditions */}
        {selectedTrigger && (
          <div className="p-6 border-b border-edge dark:border-edge-dark">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center font-bold">2</div>
                <h3 className="text-lg font-semibold text-inkA dark:text-inkA-dark">And these conditions are met (Optional)</h3>
              </div>
              <button onClick={addCondition} className="text-sm text-blue-600 dark:text-blue-400 font-medium flex items-center hover:underline">
                <Plus className="w-4 h-4 mr-1" /> Add Condition
              </button>
            </div>
            
            {conditions.length === 0 ? (
              <p className="text-inkB dark:text-inkB-dark text-sm ml-11">No conditions. This will run every time.</p>
            ) : (
              <div className="space-y-3 ml-11">
                {conditions.map((cond, idx) => (
                  <div key={idx} className="flex items-center space-x-3 bg-panel2 dark:bg-panel2-dark p-3 rounded-lg border border-edge dark:border-edge-dark">
                    <select 
                      value={cond.field} 
                      onChange={e => updateCondition(idx, 'field', e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md flex-1 focus:ring-2 focus:ring-blue-500"
                    >
                      {selectedTrigger.fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                    <select 
                      value={cond.operator} 
                      onChange={e => updateCondition(idx, 'operator', e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md w-32 focus:ring-2 focus:ring-blue-500"
                    >
                      {automationSchema.operators.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <input 
                      type="text" 
                      placeholder="Value"
                      value={cond.value} 
                      onChange={e => updateCondition(idx, 'value', e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md flex-1 focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={() => removeCondition(idx)} className="p-2 text-gray-400 dark:text-slate-500 hover:text-red-500 transition">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Delay */}
        {selectedTrigger && (
          <div className="p-6 border-b border-edge dark:border-edge-dark bg-panel2/50 dark:bg-panel2-dark/50">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center font-bold">3</div>
              <h3 className="text-lg font-semibold text-inkA dark:text-inkA-dark">Delay</h3>
            </div>
            <select 
              value={delayMinutes} 
              onChange={e => setDelayMinutes(Number(e.target.value))}
              className="w-full md:w-1/3 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 ml-11"
            >
              {automationSchema.delays.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Step 4 & 5: Action */}
        {selectedTrigger && (
          <div className="p-6 border-b border-edge dark:border-edge-dark">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center font-bold">4</div>
              <h3 className="text-lg font-semibold text-inkA dark:text-inkA-dark">Then do this...</h3>
            </div>
            <select 
              value={actionType} 
              onChange={e => { setActionType(e.target.value); setActionPayload({}); }}
              className="w-full md:w-1/2 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium ml-11 mb-4"
            >
              <option value="">Select an action</option>
              {automationSchema.actions.map(a => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>

            {selectedAction && selectedAction.configFields && (
              <div className="ml-11 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 p-5 rounded-xl space-y-4">
                <h4 className="font-semibold text-blue-800">Configuration</h4>
                {selectedAction.configFields.map(field => (
                  <div key={field.id}>
                    <label className="block text-sm text-blue-900 mb-1">{field.label}</label>
                    {field.type === 'select' ? (
                      <select 
                        value={actionPayload[field.id] || ''} 
                        onChange={e => setActionPayload({...actionPayload, [field.id]: e.target.value})}
                        className="w-full md:w-1/2 px-3 py-2 border border-blue-200 dark:border-blue-500/25 rounded-md focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Choose...</option>
                        {field.options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                      </select>
                    ) : (
                      <input 
                        type={field.type}
                        value={actionPayload[field.id] || ''}
                        onChange={e => setActionPayload({...actionPayload, [field.id]: e.target.value})}
                        className="w-full md:w-1/2 px-3 py-2 border border-blue-200 dark:border-blue-500/25 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Summary Review */}
        {selectedTrigger && selectedAction && (
          <div className="p-6 bg-gray-800 text-white">
            <h3 className="text-sm font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2 flex items-center"><Zap className="w-4 h-4 mr-1 text-yellow-400"/> Automation Summary</h3>
            <p className="text-lg leading-relaxed">{getSummary()}</p>
          </div>
        )}
      </div>
    </div>
  );
}
