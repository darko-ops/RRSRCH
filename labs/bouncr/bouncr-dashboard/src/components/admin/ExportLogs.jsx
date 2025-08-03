


{activeTab === 'export' && (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-medium mb-4">Export & Logs</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium mb-3">Export Options</h4>
          <div className="space-y-2 text-sm text-gray-600">
            <p>• CSV/JSON/Excel export of review data</p>
            <p>• Configuration backup reports</p>
            <p>• Audit trail documentation</p>
            <p>• Compliance reporting</p>
          </div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium mb-3">System Logs</h4>
          <div className="space-y-2 text-sm text-gray-600">
            <p>• User access events</p>
            <p>• Review decisions audit</p>
            <p>• Configuration changes</p>
            <p>• System performance metrics</p>
          </div>
        </div>
      </div>
    </div>
  )}