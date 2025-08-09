import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ProductManagement from './ProductManagement';
import TaskManagement from './TaskManagement';
import TaskMonitoring from './TaskMonitoring';
import ProductionLineManagement from './ProductionLineManagement';
import WarehouseManagement from './WarehouseManagement';
import DeliveryPointManagement from './DeliveryPointManagement';
import Reports from './Reports';
import LabelPrinting from './LabelPrinting';
import TruckManagement from './TruckManagement';
import { Package, Clipboard, Monitor, LogOut, BarChart3, Printer } from 'lucide-react';

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('products');
  const { logout, userData } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const tabs = [
    { id: 'products', label: 'Ürün Yönetimi', icon: Package },
    { id: 'tasks', label: 'Görev Atama', icon: Clipboard },
    { id: 'monitoring', label: 'Görev Takibi', icon: Monitor },
    { id: 'labels', label: 'Etiket Yazdırma', icon: Printer },
    { id: 'reports', label: 'Raporlar', icon: BarChart3 },
    { id: 'trucks', label: 'Tır Kontrol', icon: Package },
    { id: 'productionLines', label: 'Üretim Hattı', icon: Package },
    { id: 'warehouses', label: 'Depolar', icon: Package },
    { id: 'deliveryPoints', label: 'Teslimat Noktaları', icon: Package },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Admin Paneli</h1>
              <span className="ml-4 text-sm text-gray-500">
                Hoş geldiniz, {userData?.name || userData?.email}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Çıkış Yap
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-lg shadow">
          {activeTab === 'products' && <ProductManagement />}
          {activeTab === 'tasks' && <TaskManagement />}
          {activeTab === 'monitoring' && <TaskMonitoring />}
          {activeTab === 'labels' && <LabelPrinting />}
          {activeTab === 'reports' && <Reports />}
          {activeTab === 'trucks' && <TruckManagement />}
          {activeTab === 'productionLines' && <ProductionLineManagement />}
          {activeTab === 'warehouses' && <WarehouseManagement />}
          {activeTab === 'deliveryPoints' && <DeliveryPointManagement />}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
