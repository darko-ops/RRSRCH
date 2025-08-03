// components/admin/ConfigEditor.jsx
import React, { useState } from 'react';
import { 
  Settings, 
  Users, 
  AlertTriangle, 
  Save, 
  Plus, 
  Trash2, 
  Download,
  Upload
} from 'lucide-react';

function ConfigEditor({ config: initialConfig, reviewers: initialReviewers, onSave }) {
  const [activeTab, setActiveTab] = useState('global');
  const [config, setConfig] = useState(initialConfig || {
    ttl_days: 90,
    inactivity_days: 45,
    backup_cadence: 'monthly',
    orphaned_account: true,
    ignore_groups: ['contractors', 'interns'],
    risky_roles: ['Admin', 'SuperUser', 'DevOps', 'Security', 'IAM'],
    ignore_apps: ['Zoom', 'Slack', 'Microsoft Teams', 'Microsoft 365'],
    notify_method: 'slack',
    retry_limit: 3,
    escalate_days: 5
  });

  const [reviewers, setReviewers] = useState(initialReviewers || {
    apps: { 
      'Salesforce': 'john@company.com', 
      'GitHub': 'alice@company.com',
      'Jira': 'eng-lead@company.com'
    },
    groups: { 
      'engineering': 'alice@company.com', 
      'finance': 'cfo@company.com',
      'marketing': 'marketing-lead@company.com'
    },
    users: { 
      'vipuser@company.com': 'ceo@company.com',
      'alex@acme.com': 'alice@company.com' 
    }
  });

  const [overrides, setOverrides] = useState({});
  const [hasChanges, setHasChanges] = useState(false);

  const tabs = [
    { id: 'global', name: 'Global Config', icon: Settings },
    { id: 'reviewers', name: 'Reviewers', icon: Users },
    { id: 'overrides', name: 'Overrides', icon: AlertTriangle }
  ];

  function handleConfigChange(field, value) {
    setConfig(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  }

  function handleArrayChange(field, value) {
    const arrayValue = value.split('\n').filter(item => item.trim());
    setConfig(prev => ({ ...prev, [field]: arrayValue }));
    setHasChanges(true);
  }

  function handleSave() {
    const configData = {
      config,
      reviewers,
      overrides
    };
    
    if (onSave) {
      onSave(configData);
    }
    
    console.log('Saving configuration:', configData);
    alert('Configuration saved successfully!');
    setHasChanges(false);
  }

  function addAppReviewer() {
    const app = prompt('Enter application name:');
    const reviewer = prompt('Enter reviewer email:');
    
    if (app && reviewer) {
      setReviewers(prev => ({
        ...prev,
        apps: { ...prev.apps, [app]: reviewer }
      }));
      setHasChanges(true);
    }
  }

  function removeAppReviewer(app) {
    if (window.confirm(`Remove reviewer assignment for ${app}?`)) {
      setReviewers(prev => {
        const newApps = { ...prev.apps };
        delete newApps[app];
        return { ...prev, apps: newApps };
      });
      setHasChanges(true);
    }
  }

  function addGroupReviewer() {
    const group = prompt('Enter group name:');
    const reviewer = prompt('Enter reviewer email:');
    
    if (group && reviewer) {
      setReviewers(prev => ({
        ...prev,
        groups: { ...prev.groups, [group]: reviewer }
      }));
      setHasChanges(true);
    }
  }

  function removeGroupReviewer(group) {
    if (window.confirm(`Remove reviewer assignment for ${group} group?`)) {
      setReviewers(prev => {
        const newGroups = { ...prev.groups };
        delete newGroups[group];
        return { ...prev, groups: newGroups };
      });
      setHasChanges(true);
    }
  }

  function addUserReviewer() {
    const user = prompt('Enter user email:');
    const reviewer = prompt('Enter reviewer email:');
    
    if (user && reviewer) {
      setReviewers(prev => ({
        ...prev,
        users: { ...prev.users, [user]: reviewer }
      }));
      setHasChanges(true);
    }
  }

  function removeUserReviewer(user) {
    if (window.confirm(`Remove reviewer assignment for ${user}?`)) {
      setReviewers(prev => {
        const newUsers = { ...prev.users };
        delete newUsers[user];
        return { ...prev, users: newUsers };
      });
      setHasChanges(true);
    }
  }

  function exportConfig() {
    const configData = { config, reviewers, overrides };
    const dataStr = JSON.stringify(configData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `bouncr-config-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
  }

  function importConfig(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (imported.config) setConfig(imported.config);
        if (imported.reviewers) setReviewers(imported.reviewers);
        if (imported.overrides) setOverrides(imported.overrides);
        setHasChanges(true);
        alert('Configuration imported successfully!');
      } catch (error) {
        alert('Invalid configuration file');
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-6">
      {/* Header with Save Button */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">Configuration Editor</h2>
          <div className="flex items-center gap-3">
            {hasChanges && (
              <span className="text-sm text-orange-600 font-medium">Unsaved changes</span>
            )}
            <div className="flex gap-2">
              <label className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                Import
                <input
                  type="file"
                  accept=".json"
                  onChange={importConfig}
                  className="hidden"
                />
              </label>
              <button
                onClick={exportConfig}
                className="flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </button>
              <button
                onClick={handleSave}
                className={`flex items-center px-4 py-2 rounded-md ${
                  hasChanges 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                disabled={!hasChanges}
              >
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Global Config Tab */}
      {activeTab === 'global' && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-6">Global Configuration</h3>
          
          <div className="space-y-6">
            {/* Basic Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  TTL Days
                </label>
                <input
                  type="number"
                  value={config.ttl_days}
                  onChange={(e) => handleConfigChange('ttl_days', parseInt(e.target.value))}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                />
                <p className="text-xs text-gray-500 mt-1">Days before access expires</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Inactivity Threshold (Days)
                </label>
                <input
                  type="number"
                  value={config.inactivity_days}
                  onChange={(e) => handleConfigChange('inactivity_days', parseInt(e.target.value))}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                />
                <p className="text-xs text-gray-500 mt-1">Flag users inactive for this many days</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Backup Frequency
                </label>
                <select
                  value={config.backup_cadence}
                  onChange={(e) => handleConfigChange('backup_cadence', e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="6months">6 Months</option>
                  <option value="annual">Annual</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notification Method
                </label>
                <select
                  value={config.notify_method}
                  onChange={(e) => handleConfigChange('notify_method', e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                >
                  <option value="slack">Slack</option>
                  <option value="email">Email</option>
                  <option value="teams">Microsoft Teams</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Retry Limit
                </label>
                <input
                  type="number"
                  value={config.retry_limit}
                  onChange={(e) => handleConfigChange('retry_limit', parseInt(e.target.value))}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                />
                <p className="text-xs text-gray-500 mt-1">Number of notification retries</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Escalation Days
                </label>
                <input
                  type="number"
                  value={config.escalate_days}
                  onChange={(e) => handleConfigChange('escalate_days', parseInt(e.target.value))}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                />
                <p className="text-xs text-gray-500 mt-1">Days before escalating unreviewed items</p>
              </div>
            </div>

            {/* Toggle Settings */}
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.orphaned_account}
                  onChange={(e) => handleConfigChange('orphaned_account', e.target.checked)}
                  className="mr-3"
                />
                <span className="text-sm font-medium text-gray-700">Enable Orphaned Account Detection</span>
              </label>
              <p className="text-xs text-gray-500 mt-1">Automatically flag accounts that appear orphaned</p>
            </div>

            {/* Array Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ignore Groups (one per line)
                </label>
                <textarea
                  value={config.ignore_groups.join('\n')}
                  onChange={(e) => handleArrayChange('ignore_groups', e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full h-24"
                  placeholder="contractors&#10;interns"
                />
                <p className="text-xs text-gray-500 mt-1">Groups to exclude from reviews</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Risky Roles (one per line)
                </label>
                <textarea
                  value={config.risky_roles.join('\n')}
                  onChange={(e) => handleArrayChange('risky_roles', e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full h-24"
                  placeholder="Admin&#10;SuperUser&#10;Security"
                />
                <p className="text-xs text-gray-500 mt-1">Roles that require special attention</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ignore Applications (one per line)
              </label>
              <textarea
                value={config.ignore_apps.join('\n')}
                onChange={(e) => handleArrayChange('ignore_apps', e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 w-full h-32"
                placeholder="Zoom&#10;Slack&#10;Microsoft Teams"
              />
              <p className="text-xs text-gray-500 mt-1">Applications to exclude from reviews</p>
            </div>
          </div>
        </div>
      )}

      {/* Reviewers Tab */}
      {activeTab === 'reviewers' && (
        <div className="space-y-6">
          {/* App Reviewers */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Application Reviewers</h3>
              <button
                onClick={addAppReviewer}
                className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add App Reviewer
              </button>
            </div>
            <div className="space-y-3">
              {Object.entries(reviewers.apps).map(([app, reviewer]) => (
                <div key={app} className="flex items-center justify-between p-3 border border-gray-200 rounded-md">
                  <div>
                    <span className="font-medium">{app}</span>
                    <span className="text-gray-500 ml-2">→ {reviewer}</span>
                  </div>
                  <button
                    onClick={() => removeAppReviewer(app)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Group Reviewers */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Group Reviewers</h3>
              <button
                onClick={addGroupReviewer}
                className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Group Reviewer
              </button>
            </div>
            <div className="space-y-3">
              {Object.entries(reviewers.groups).map(([group, reviewer]) => (
                <div key={group} className="flex items-center justify-between p-3 border border-gray-200 rounded-md">
                  <div>
                    <span className="font-medium">{group}</span>
                    <span className="text-gray-500 ml-2">→ {reviewer}</span>
                  </div>
                  <button
                    onClick={() => removeGroupReviewer(group)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* User Reviewers */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Specific User Reviewers</h3>
              <button
                onClick={addUserReviewer}
                className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add User Reviewer
              </button>
            </div>
            <div className="space-y-3">
              {Object.entries(reviewers.users).map(([user, reviewer]) => (
                <div key={user} className="flex items-center justify-between p-3 border border-gray-200 rounded-md">
                  <div>
                    <span className="font-medium">{user}</span>
                    <span className="text-gray-500 ml-2">→ {reviewer}</span>
                  </div>
                  <button
                    onClick={() => removeUserReviewer(user)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Overrides Tab */}
      {activeTab === 'overrides' && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-4">Review Overrides</h3>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-blue-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">Coming Soon</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>Override configuration will allow you to set special exceptions for specific users or scenarios.</p>
                  <p className="mt-2">Features will include:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Skip reviews for specific users</li>
                    <li>Custom review cycles for certain roles</li>
                    <li>Temporary access exceptions</li>
                    <li>Emergency access overrides</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConfigEditor;