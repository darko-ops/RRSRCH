import React, { useState, useEffect } from 'react';
import { Save, AlertTriangle, Clock, Shield, Mail, Slack, Bell, Database, Users, Eye, Settings } from 'lucide-react';

const ConfigEditor = ({ config = {}, reviewers = {}, onSave }) => {
  // Initialize state with default values
  const [formData, setFormData] = useState({
    // Access Review Cadence
    defaultReviewCadence: 'quarterly', // monthly, quarterly, biannual, annual
    
    // Auto Temporary Access Groups
    autoTempAccessGroups: ['contractors', 'interns'],
    tempAccessDuration: 90, // days
    
    // Ignored Apps (pulled from all user access)
    ignoredApps: ['Microsoft Teams', 'Microsoft 365', 'Zoom', 'Slack'],
    
    // Inactivity Settings
    inactivityDays: 45,
    autoRemovalEnabled: false,
    
    // Orphaned Account Detection
    orphanedAccountDetection: true,
    orphanedAccountGracePeriod: 30, // days
    
    // Backup Settings
    backupCadence: 'daily', // daily, weekly, monthly
    backupRetention: 90, // days
    backupFailureAlerts: true,
    backupAlertRecipients: ['admin@company.com'],
    
    // Notification Settings
    primaryNotificationMethod: 'email', // email, slack, teams
    slackWebhook: '',
    emailSmtpHost: '',
    emailSmtpPort: 587,
    emailUsername: '',
    notificationRetryLimit: 3,
    escalationEnabled: true,
    escalationAfterDays: 5,
    escalationRecipients: ['security@company.com']
  });

  const [availableApps, setAvailableApps] = useState([]);
  const [isDirty, setIsDirty] = useState(false);

  // Extract unique apps from mock data or API
  useEffect(() => {
    // This would normally come from your API
    const mockApps = [
      'Salesforce', 'GitHub', 'Okta', 'Slack', 'Zoom', 'Jira', 'Asana',
      'Microsoft Teams', 'Microsoft 365', 'Microsoft Azure', 'Microsoft Intune',
      'Google Workspace', 'Dropbox', 'Box', 'Adobe Creative Suite',
      'AWS', 'Azure', 'GCP', 'Figma', 'Notion', 'Monday.com'
    ];
    setAvailableApps(mockApps);
  }, []);

  useEffect(() => {
    // Load existing config if provided
    if (config && Object.keys(config).length > 0) {
      setFormData(prev => ({ ...prev, ...config }));
    }
  }, [config]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleArrayInputChange = (field, value, action = 'toggle') => {
    setFormData(prev => {
      const currentArray = prev[field] || [];
      let newArray;
      
      if (action === 'toggle') {
        newArray = currentArray.includes(value)
          ? currentArray.filter(item => item !== value)
          : [...currentArray, value];
      } else if (action === 'add' && !currentArray.includes(value)) {
        newArray = [...currentArray, value];
      } else if (action === 'remove') {
        newArray = currentArray.filter(item => item !== value);
      } else {
        newArray = currentArray;
      }
      
      return { ...prev, [field]: newArray };
    });
    setIsDirty(true);
  };

  const handleSave = () => {
    if (onSave) {
      onSave(formData);
    }
    setIsDirty(false);
    alert('Configuration saved successfully!');
  };

  const addCustomApp = () => {
    const appName = prompt('Enter custom app name:');
    if (appName && !availableApps.includes(appName)) {
      setAvailableApps(prev => [...prev, appName]);
    }
  };

  const addEmailRecipient = (field) => {
    const email = prompt('Enter email address:');
    if (email && email.includes('@')) {
      handleArrayInputChange(field, email, 'add');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-7 h-7 text-blue-600" />
            Configuration Editor
          </h1>
          <p className="text-gray-600 mt-1">Configure Bouncr's access review and governance settings</p>
        </div>
        
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium ${
            isDirty 
              ? 'bg-blue-600 text-white hover:bg-blue-700' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          <Save className="w-4 h-4" />
          {isDirty ? 'Save Changes' : 'No Changes'}
        </button>
      </div>

      {isDirty && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            <span className="text-yellow-800 font-medium">Unsaved Changes</span>
          </div>
          <p className="text-yellow-700 text-sm mt-1">You have unsaved configuration changes.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Access Review Settings */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            Access Review Settings
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Review Cadence
              </label>
              <select
                value={formData.defaultReviewCadence}
                onChange={(e) => handleInputChange('defaultReviewCadence', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="biannual">Bi-annual</option>
                <option value="annual">Annual</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Inactivity Days (Auto-flag for review)
              </label>
              <input
                type="number"
                value={formData.inactivityDays}
                onChange={(e) => handleInputChange('inactivityDays', parseInt(e.target.value))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                min="1"
                max="365"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoRemoval"
                checked={formData.autoRemovalEnabled}
                onChange={(e) => handleInputChange('autoRemovalEnabled', e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="autoRemoval" className="text-sm text-gray-700">
                Enable auto-removal after inactivity period
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="orphanedDetection"
                checked={formData.orphanedAccountDetection}
                onChange={(e) => handleInputChange('orphanedAccountDetection', e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="orphanedDetection" className="text-sm text-gray-700">
                Detect orphaned accounts
              </label>
            </div>

            {formData.orphanedAccountDetection && (
              <div className="ml-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Grace Period (days)
                </label>
                <input
                  type="number"
                  value={formData.orphanedAccountGracePeriod}
                  onChange={(e) => handleInputChange('orphanedAccountGracePeriod', parseInt(e.target.value))}
                  className="w-32 border border-gray-300 rounded-md px-3 py-2"
                  min="1"
                  max="90"
                />
              </div>
            )}
          </div>
        </div>

        {/* Auto Temporary Access */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-green-600" />
            Auto Temporary Access
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Groups with Auto Temporary Access
              </label>
              <div className="space-y-2">
                {['contractors', 'interns', 'consultants', 'temps'].map(group => (
                  <div key={group} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={group}
                      checked={formData.autoTempAccessGroups.includes(group)}
                      onChange={() => handleArrayInputChange('autoTempAccessGroups', group)}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor={group} className="text-sm text-gray-700 capitalize">
                      {group}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Temporary Access Duration (days)
              </label>
              <input
                type="number"
                value={formData.tempAccessDuration}
                onChange={(e) => handleInputChange('tempAccessDuration', parseInt(e.target.value))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                min="1"
                max="365"
              />
            </div>
          </div>
        </div>

        {/* Ignored Apps */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5 text-purple-600" />
            Ignored Applications
          </h2>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Select apps to exclude from access reviews (e.g., basic productivity tools)
            </p>
            
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md p-3">
              <div className="grid grid-cols-1 gap-2">
                {availableApps.map(app => (
                  <div key={app} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`app-${app}`}
                      checked={formData.ignoredApps.includes(app)}
                      onChange={() => handleArrayInputChange('ignoredApps', app)}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor={`app-${app}`} className="text-sm text-gray-700">
                      {app}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            
            <button
              onClick={addCustomApp}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              + Add custom application
            </button>
          </div>
        </div>

        {/* Backup Settings */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-orange-600" />
            Backup & Recovery
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Backup Cadence
              </label>
              <select
                value={formData.backupCadence}
                onChange={(e) => handleInputChange('backupCadence', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Backup Retention (days)
              </label>
              <input
                type="number"
                value={formData.backupRetention}
                onChange={(e) => handleInputChange('backupRetention', parseInt(e.target.value))}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                min="7"
                max="365"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="backupAlerts"
                checked={formData.backupFailureAlerts}
                onChange={(e) => handleInputChange('backupFailureAlerts', e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="backupAlerts" className="text-sm text-gray-700">
                Alert on backup failures
              </label>
            </div>

            {formData.backupFailureAlerts && (
              <div className="ml-6 space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Alert Recipients
                </label>
                {formData.backupAlertRecipients.map((email, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-sm text-gray-700">{email}</span>
                    <button
                      onClick={() => handleArrayInputChange('backupAlertRecipients', email, 'remove')}
                      className="text-red-600 hover:text-red-800 text-xs"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addEmailRecipient('backupAlertRecipients')}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  + Add recipient
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-white rounded-lg shadow-sm border p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-red-600" />
            Notification Settings
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Primary Notification Method
                </label>
                <select
                  value={formData.primaryNotificationMethod}
                  onChange={(e) => handleInputChange('primaryNotificationMethod', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="email">Email</option>
                  <option value="slack">Slack</option>
                  <option value="teams">Microsoft Teams</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Retry Limit
                </label>
                <input
                  type="number"
                  value={formData.notificationRetryLimit}
                  onChange={(e) => handleInputChange('notificationRetryLimit', parseInt(e.target.value))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  min="1"
                  max="10"
                />
              </div>

              {formData.primaryNotificationMethod === 'slack' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Slack Webhook URL
                  </label>
                  <input
                    type="url"
                    value={formData.slackWebhook}
                    onChange={(e) => handleInputChange('slackWebhook', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="https://hooks.slack.com/services/..."
                  />
                </div>
              )}

              {formData.primaryNotificationMethod === 'email' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      SMTP Host
                    </label>
                    <input
                      type="text"
                      value={formData.emailSmtpHost}
                      onChange={(e) => handleInputChange('emailSmtpHost', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                      placeholder="smtp.gmail.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      SMTP Port
                    </label>
                    <input
                      type="number"
                      value={formData.emailSmtpPort}
                      onChange={(e) => handleInputChange('emailSmtpPort', parseInt(e.target.value))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="escalation"
                  checked={formData.escalationEnabled}
                  onChange={(e) => handleInputChange('escalationEnabled', e.target.checked)}
                  className="rounded border-gray-300"
                />
                <label htmlFor="escalation" className="text-sm text-gray-700">
                  Enable escalation for overdue reviews
                </label>
              </div>

              {formData.escalationEnabled && (
                <div className="ml-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Escalate after (days)
                    </label>
                    <input
                      type="number"
                      value={formData.escalationAfterDays}
                      onChange={(e) => handleInputChange('escalationAfterDays', parseInt(e.target.value))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                      min="1"
                      max="30"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Escalation Recipients
                    </label>
                    {formData.escalationRecipients.map((email, index) => (
                      <div key={index} className="flex items-center gap-2 mb-2">
                        <span className="text-sm text-gray-700">{email}</span>
                        <button
                          onClick={() => handleArrayInputChange('escalationRecipients', email, 'remove')}
                          className="text-red-600 hover:text-red-800 text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addEmailRecipient('escalationRecipients')}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      + Add recipient
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Save Section */}
      <div className="bg-gray-50 rounded-lg p-6 border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Configuration Status</h3>
            <p className="text-sm text-gray-600 mt-1">
              {isDirty ? 'You have unsaved changes.' : 'All changes are saved.'}
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={!isDirty}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium ${
              isDirty 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Save className="w-4 h-4" />
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigEditor;