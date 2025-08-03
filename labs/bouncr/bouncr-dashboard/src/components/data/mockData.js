// Mock data
const mockUsers = [
    { id: 1, email: 'alex@acme.com', app: 'GitHub', group: 'engineering', lastLogin: '2024-05-01', status: 'pending', reasons: 'Inactive for more than 45 days' },
    { id: 2, email: 'sam@acme.com', app: 'GitHub', group: 'marketing', lastLogin: '2024-07-25', status: 'approved', reasons: 'Privileged role: Admin' },
    { id: 3, email: 'jane@acme.com', app: 'Salesforce', group: 'sales', lastLogin: '2024-03-15', status: 'pending', reasons: 'Inactive for more than 45 days; Privileged role' },
    { id: 4, email: 'mike@acme.com', app: 'Slack', group: 'engineering', lastLogin: '2024-07-20', status: 'rejected', reasons: 'Orphaned account' },
    { id: 5, email: 'sarah@acme.com', app: 'Jira', group: 'product', lastLogin: '2024-06-10', status: 'pending', reasons: 'Privileged role: DevOps' },
    { id: 6, email: 'emma@acme.com', app: 'Asana', group: 'product', lastLogin: '2024-06-01', status: 'pending', reasons: 'Inactive for more than 45 days' },
    { id: 7, email: 'dan@acme.com', app: 'Notion', group: 'marketing', lastLogin: '2024-07-22', status: 'approved', reasons: 'Normal activity' },
    { id: 8, email: 'lisa@acme.com', app: 'Salesforce', group: 'sales', lastLogin: '2024-06-05', status: 'approved', reasons: 'Privileged role: Sales Manager' },
    { id: 9, email: 'steve@acme.com', app: 'GitHub', group: 'engineering', lastLogin: '2024-05-15', status: 'pending', reasons: 'Stale reviewer assignment' },
    { id: 10, email: 'brenda@acme.com', app: 'Slack', group: 'support', lastLogin: '2024-07-10', status: 'approved', reasons: 'Standard user' },
    { id: 11, email: 'raj@acme.com', app: 'Datadog', group: 'devops', lastLogin: '2024-04-18', status: 'pending', reasons: 'Orphaned account' },
    { id: 12, email: 'nina@acme.com', app: 'GitHub', group: 'design', lastLogin: '2024-07-30', status: 'approved', reasons: 'Privileged role: Design Lead' },
    { id: 13, email: 'omar@acme.com', app: 'Jira', group: 'qa', lastLogin: '2024-07-01', status: 'pending', reasons: 'Privileged role: Test Admin' },
    { id: 14, email: 'claire@acme.com', app: 'Salesforce', group: 'finance', lastLogin: '2024-07-15', status: 'approved', reasons: 'Normal usage' },
    { id: 15, email: 'kevin@acme.com', app: 'Confluence', group: 'product', lastLogin: '2024-06-18', status: 'pending', reasons: 'Privileged role' },
    { id: 16, email: 'george@acme.com', app: 'Slack', group: 'legal', lastLogin: '2024-05-30', status: 'rejected', reasons: 'Inactive for more than 60 days' },
    { id: 17, email: 'irene@acme.com', app: 'Okta', group: 'security', lastLogin: '2024-07-29', status: 'approved', reasons: 'Privileged role: IAM Admin' },
    { id: 18, email: 'leo@acme.com', app: 'Zoom', group: 'operations', lastLogin: '2024-07-19', status: 'pending', reasons: 'Privileged role: Scheduler' },
    { id: 19, email: 'ella@acme.com', app: 'GitHub', group: 'engineering', lastLogin: '2024-06-28', status: 'approved', reasons: 'Standard usage' },
    { id: 20, email: 'mark@acme.com', app: 'Salesforce', group: 'sales', lastLogin: '2024-03-01', status: 'rejected', reasons: 'Privileged role; Inactive for more than 90 days' },
  ];
  
  
  const mockReviewers = {
    apps: {
      'GitHub': 'alice@company.com',
      'Jira': 'eng-lead@company.com',
      'Salesforce': 'john@company.com',
      'Slack': 'ops-lead@company.com',
      'Okta': 'sec-lead@company.com',
      'Figma': 'design-head@company.com',
      'Confluence': 'product-head@company.com',
      'Zoom': 'ops-coordinator@company.com',
      'Asana': 'pm-lead@company.com',
      'Notion': 'marketing-lead@company.com',
    },
    groups: {
      'engineering': 'alice@company.com',
      'product': 'product-head@company.com',
      'marketing': 'marketing-lead@company.com',
      'sales': 'john@company.com',
      'support': 'ops-lead@company.com',
      'devops': 'eng-lead@company.com',
      'design': 'design-head@company.com',
      'qa': 'qa-lead@company.com',
      'finance': 'cfo@company.com',
      'security': 'sec-lead@company.com',
      'legal': 'compliance@company.com',
      'operations': 'ops-coordinator@company.com',
    },
    users: {
      'alex@acme.com': 'alice@company.com',
      'jane@acme.com': 'john@company.com',
      'sarah@acme.com': 'eng-lead@company.com',
      'emma@acme.com': 'pm-lead@company.com',
      'irene@acme.com': 'sec-lead@company.com',
    }
  };
  
  