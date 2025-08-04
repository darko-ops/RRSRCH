// Mock data for Bouncr dashboard

export const mockUsers = [
  {
    id: 'u001',
    email: 'alice.developer@company.com',
    firstName: 'Alice',
    lastName: 'Johnson',
    department: 'Engineering',
    title: 'Senior Developer',
    status: 'active',
    lastLogin: '2024-08-02T14:30:00Z',
    flaggedAccess: 2,
    riskLevel: 'medium',
    groups: ['engineering', 'github-admin'],
    apps: ['GitHub', 'AWS', 'Figma'],
    createdAt: '2023-01-15T10:00:00Z',
    reviewStatus: 'pending'
  },
  {
    id: 'u002', 
    email: 'bob.manager@company.com',
    firstName: 'Bob',
    lastName: 'Smith',
    department: 'Product',
    title: 'Product Manager',
    status: 'active',
    lastLogin: '2024-07-28T09:15:00Z',
    flaggedAccess: 0,
    riskLevel: 'low',
    groups: ['product', 'slack-admin'],
    apps: ['Slack', 'Notion', 'Salesforce'],
    createdAt: '2022-06-20T14:00:00Z',
    reviewStatus: 'approved'
  }
];

export const mockReviewers = [
  {
    email: 'john@company.com',
    name: 'John Smith',
    role: 'Engineering Lead'
  },
  {
    email: 'alice@company.com',
    name: 'Alice Johnson',
    role: 'Security Lead'
  }
];
