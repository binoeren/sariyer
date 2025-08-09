import React, { useState, useEffect } from 'react';
import { ref, get } from 'firebase/database';
import { db } from '../../firebase/config';
import { Task, Product, User } from '../../types';
import { 
  BarChart3, 
  Package, 
  Users, 
  CheckCircle, 
  Clock, 
  Truck, 
  Calendar,
  TrendingUp,
  Activity,
  Target,
  Download,
  FileSpreadsheet,
  AlertTriangle
} from 'lucide-react';
import { generateExcelReport } from '../../utils/excelReportGenerator';

interface ReportData {
  totalProducts: number;
  totalTasks: number;
  completedTasks: number;
  ongoingTasks: number;
  pendingTasks: number;
  todayTasks: number;
  todayCompleted: number;
  todayOngoing: number;
  todayPending: number;
  totalDrivers: number;
  totalPallets: number;
  driverStats: {
    [driverId: string]: {
      name: string;
      totalTasks: number;
      completedTasks: number;
      ongoingTasks: number;
      pendingTasks: number;
      todayTasks: number;
      todayCompleted: number;
      todayOngoing: number;
      todayPending: number;
      totalPallets: number;
    };
  };
  productStats: {
    [productId: string]: {
      name: string;
      totalTasks: number;
      totalPallets: number;
      stock: number;
    };
  };
  monthlyStats: {
    [month: string]: {
      totalTasks: number;
      completedTasks: number;
      totalPallets: number;
    };
  };
  truckStats: {
    [truckId: string]: {
      name: string;
      capacity: number;
      totalPallets: number;
      reservedPallets: number;
      loadedPallets: number;
      available: number;
      usagePercentage: number;
      activeTasks: number;
      productCount: number;
    };
  };
}

const Reports: React.FC = () => {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [excelLoading, setExcelLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'all'>('today');

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      
      // Tüm verileri paralel olarak çek
      const [tasksSnapshot, productsSnapshot, usersSnapshot, trucksSnapshot] = await Promise.all([
        get(ref(db, 'tasks')),
        get(ref(db, 'products')),
        get(ref(db, 'users')),
        get(ref(db, 'trucks'))
      ]);

      const tasks: Task[] = tasksSnapshot.exists() 
        ? Object.keys(tasksSnapshot.val()).map(key => ({
            id: key,
            ...tasksSnapshot.val()[key]
          }))
        : [];

      const products: Product[] = productsSnapshot.exists()
        ? Object.keys(productsSnapshot.val()).map(key => ({
            id: key,
            ...productsSnapshot.val()[key]
          }))
        : [];

      const users: User[] = usersSnapshot.exists()
        ? Object.keys(usersSnapshot.val()).map(key => ({
            id: key,
            ...usersSnapshot.val()[key]
          }))
        : [];

      const trucks: Truck[] = trucksSnapshot.exists()
        ? Object.keys(trucksSnapshot.val()).map(key => ({
            id: key,
            ...trucksSnapshot.val()[key]
          }))
        : [];

      const drivers = users.filter(user => user.role === 'sofor');
      const today = new Date().toDateString();

      // Genel istatistikler
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'tamamlandı').length;
      const ongoingTasks = tasks.filter(t => t.status === 'devam_ediyor').length;
      const pendingTasks = tasks.filter(t => t.status === 'teslim_alma_dogrulama').length;
      
      const todayTasks = tasks.filter(t => 
        new Date(t.createdAt).toDateString() === today
      );
      const todayCompleted = todayTasks.filter(t => t.status === 'tamamlandı').length;
      const todayOngoing = todayTasks.filter(t => t.status === 'devam_ediyor').length;
      const todayPending = todayTasks.filter(t => t.status === 'teslim_alma_dogrulama').length;

      const totalPallets = tasks.reduce((sum, task) => sum + task.palletQuantity, 0);

      // Şöför istatistikleri
      const driverStats: ReportData['driverStats'] = {};
      drivers.forEach(driver => {
        const driverTasks = tasks.filter(t => t.assignedTo === driver.id);
        const driverTodayTasks = driverTasks.filter(t => 
          new Date(t.createdAt).toDateString() === today
        );

        driverStats[driver.id] = {
          name: driver.name,
          totalTasks: driverTasks.length,
          completedTasks: driverTasks.filter(t => t.status === 'tamamlandı').length,
          ongoingTasks: driverTasks.filter(t => t.status === 'devam_ediyor').length,
          pendingTasks: driverTasks.filter(t => t.status === 'teslim_alma_dogrulama').length,
          todayTasks: driverTodayTasks.length,
          todayCompleted: driverTodayTasks.filter(t => t.status === 'tamamlandı').length,
          todayOngoing: driverTodayTasks.filter(t => t.status === 'devam_ediyor').length,
          todayPending: driverTodayTasks.filter(t => t.status === 'teslim_alma_dogrulama').length,
          totalPallets: driverTasks.reduce((sum, task) => sum + task.palletQuantity, 0)
        };
      });

      // Ürün istatistikleri
      const productStats: ReportData['productStats'] = {};
      products.forEach(product => {
        const productTasks = tasks.filter(t => t.productQrCode === product.qrCode);
        
        productStats[product.id] = {
          name: product.name,
          totalTasks: productTasks.length,
          totalPallets: productTasks.reduce((sum, task) => sum + task.palletQuantity, 0),
          stock: product.stock || 0
        };
      });

      // Aylık istatistikler
      const monthlyStats: ReportData['monthlyStats'] = {};
      tasks.forEach(task => {
        const month = new Date(task.createdAt).toLocaleDateString('tr-TR', { 
          year: 'numeric', 
          month: 'long' 
        });
        
        if (!monthlyStats[month]) {
          monthlyStats[month] = {
            totalTasks: 0,
            completedTasks: 0,
            totalPallets: 0
          };
        }
        
        monthlyStats[month].totalTasks++;
        monthlyStats[month].totalPallets += task.palletQuantity;
        if (task.status === 'tamamlandı') {
          monthlyStats[month].completedTasks++;
        }
      });

      // Tır istatistikleri
      const truckStats: ReportData['truckStats'] = {};
      trucks.forEach(truck => {
        let totalPallets = 0;
        let reservedPallets = 0;
        let loadedPallets = 0;
        let productCount = 0;
        let activeTasks = 0;

        if (truck.inventory) {
          Object.keys(truck.inventory).forEach(productId => {
            const productInventory = truck.inventory![productId];
            if (productInventory.totalPallets > 0) {
              productCount++;
              totalPallets += productInventory.totalPallets;
              
              if (productInventory.batches) {
                Object.values(productInventory.batches).forEach(batch => {
                  if (batch.status === 'reserved') {
                    reservedPallets += batch.palletQuantity;
                    activeTasks++;
                  } else {
                    loadedPallets += batch.palletQuantity;
                  }
                });
              }
            }
          });
        }

        const capacity = truck.capacity || 0;
        const available = capacity - totalPallets;
        const usagePercentage = capacity > 0 ? Math.round((totalPallets / capacity) * 100) : 0;

        truckStats[truck.id] = {
          name: truck.name,
          capacity,
          totalPallets,
          reservedPallets,
          loadedPallets,
          available,
          usagePercentage,
          activeTasks,
          productCount
        };
      });

      setReportData({
        totalProducts: products.length,
        totalTasks,
        completedTasks,
        ongoingTasks,
        pendingTasks,
        todayTasks: todayTasks.length,
        todayCompleted,
        todayOngoing,
        todayPending,
        totalDrivers: drivers.length,
        totalPallets,
        driverStats,
        productStats,
        monthlyStats,
        truckStats
      });

    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExcelDownload = async (period: 'daily' | 'weekly' | 'monthly' | 'yearly') => {
    try {
      setExcelLoading(true);
      await generateExcelReport(period);
    } catch (error) {
      console.error('Excel raporu indirme hatası:', error);
      alert('Rapor indirilemedi. Lütfen tekrar deneyin.');
    } finally {
      setExcelLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Raporlar yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">Rapor verileri yüklenemedi.</p>
      </div>
    );
  }

  const getCompletionRate = (completed: number, total: number) => {
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">Raporlar</h2>
        </div>
        <div className="flex items-center gap-4">
          {/* Excel İndirme Butonları */}
          <div className="flex items-center gap-2 bg-green-50 rounded-lg p-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-800">Excel Raporu:</span>
            <div className="flex gap-1">
              <button
                onClick={() => handleExcelDownload('daily')}
                disabled={excelLoading}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs rounded transition-colors flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                Günlük
              </button>
              <button
                onClick={() => handleExcelDownload('weekly')}
                disabled={excelLoading}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs rounded transition-colors flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                Haftalık
              </button>
              <button
                onClick={() => handleExcelDownload('monthly')}
                disabled={excelLoading}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs rounded transition-colors flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                Aylık
              </button>
              <button
                onClick={() => handleExcelDownload('yearly')}
                disabled={excelLoading}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs rounded transition-colors flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                Yıllık
              </button>
            </div>
          </div>
          
          {/* Mevcut Dönem Seçici */}
          <div className="flex gap-2">
          {(['today', 'week', 'month', 'all'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedPeriod === period
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {period === 'today' ? 'Bugün' : 
               period === 'week' ? 'Bu Hafta' :
               period === 'month' ? 'Bu Ay' : 'Tümü'}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* Excel İndirme Durumu */}
      {excelLoading && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-blue-600 animate-spin" />
            <span className="text-blue-800 font-medium">Excel raporu hazırlanıyor...</span>
          </div>
        </div>
      )}

      {/* Genel İstatistikler */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Toplam Görev</p>
              <p className="text-3xl font-bold">{reportData.totalTasks}</p>
            </div>
            <Target className="w-8 h-8 text-blue-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Tamamlanan</p>
              <p className="text-3xl font-bold">{reportData.completedTasks}</p>
              <p className="text-green-100 text-xs">
                %{getCompletionRate(reportData.completedTasks, reportData.totalTasks)} başarı
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm">Devam Eden</p>
              <p className="text-3xl font-bold">{reportData.ongoingTasks}</p>
            </div>
            <Truck className="w-8 h-8 text-orange-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-100 text-sm">Beklemede</p>
              <p className="text-3xl font-bold">{reportData.pendingTasks}</p>
            </div>
            <Clock className="w-8 h-8 text-yellow-200" />
          </div>
        </div>
      </div>

      {/* Bugünkü İstatistikler */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-semibold">Bugünkü Performans</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">{reportData.todayTasks}</div>
            <div className="text-sm text-gray-600">Bugün Atanan</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{reportData.todayCompleted}</div>
            <div className="text-sm text-gray-600">Bugün Tamamlanan</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{reportData.todayOngoing}</div>
            <div className="text-sm text-gray-600">Bugün Devam Eden</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{reportData.todayPending}</div>
            <div className="text-sm text-gray-600">Bugün Bekleyen</div>
          </div>
        </div>
      </div>

      {/* Tır Durumu */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Truck className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-semibold">Tır Durumu</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Tır Adı</th>
                <th className="text-center py-2">Kapasite</th>
                <th className="text-center py-2">Rezerve</th>
                <th className="text-center py-2">Yüklü</th>
                <th className="text-center py-2">Boş</th>
                <th className="text-center py-2">Doluluk</th>
                <th className="text-center py-2">Aktif Görev</th>
                <th className="text-center py-2">Ürün Çeşidi</th>
                <th className="text-center py-2">Durum</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(reportData.truckStats).map(([truckId, stats]) => (
                <tr key={truckId} className="border-b hover:bg-gray-50">
                  <td className="py-3 font-medium">{stats.name}</td>
                  <td className="text-center py-3">{stats.capacity}</td>
                  <td className="text-center py-3 text-orange-600">{stats.reservedPallets}</td>
                  <td className="text-center py-3 text-blue-600">{stats.loadedPallets}</td>
                  <td className="text-center py-3 text-green-600">{stats.available}</td>
                  <td className="text-center py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      stats.usagePercentage >= 90 ? 'bg-red-100 text-red-800' :
                      stats.usagePercentage >= 70 ? 'bg-yellow-100 text-yellow-800' :
                      stats.usagePercentage >= 50 ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                    }`}>
                      %{stats.usagePercentage}
                    </span>
                  </td>
                  <td className="text-center py-3">{stats.activeTasks}</td>
                  <td className="text-center py-3">{stats.productCount}</td>
                  <td className="text-center py-3">
                    {stats.usagePercentage >= 90 ? (
                      <AlertTriangle className="w-4 h-4 text-red-500 mx-auto" title="Dolu" />
                    ) : stats.activeTasks > 0 ? (
                      <Clock className="w-4 h-4 text-orange-500 mx-auto" title="Aktif Görev Var" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-green-500 mx-auto" title="Müsait" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Şöför Performansı */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-semibold">Şöför Performansı</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Şöför</th>
                <th className="text-center py-2">Toplam Görev</th>
                <th className="text-center py-2">Tamamlanan</th>
                <th className="text-center py-2">Devam Eden</th>
                <th className="text-center py-2">Bekleyen</th>
                <th className="text-center py-2">Bugün</th>
                <th className="text-center py-2">Toplam Palet</th>
                <th className="text-center py-2">Başarı Oranı</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(reportData.driverStats).map(([driverId, stats]) => (
                <tr key={driverId} className="border-b hover:bg-gray-50">
                  <td className="py-3 font-medium">{stats.name}</td>
                  <td className="text-center py-3">{stats.totalTasks}</td>
                  <td className="text-center py-3 text-green-600">{stats.completedTasks}</td>
                  <td className="text-center py-3 text-blue-600">{stats.ongoingTasks}</td>
                  <td className="text-center py-3 text-yellow-600">{stats.pendingTasks}</td>
                  <td className="text-center py-3">{stats.todayTasks}</td>
                  <td className="text-center py-3">{stats.totalPallets}</td>
                  <td className="text-center py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      getCompletionRate(stats.completedTasks, stats.totalTasks) >= 80
                        ? 'bg-green-100 text-green-800'
                        : getCompletionRate(stats.completedTasks, stats.totalTasks) >= 60
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      %{getCompletionRate(stats.completedTasks, stats.totalTasks)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ürün İstatistikleri */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-semibold">Ürün İstatistikleri</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(reportData.productStats).map(([productId, stats]) => (
            <div key={productId} className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">{stats.name}</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Toplam Görev:</span>
                  <span className="font-medium">{stats.totalTasks}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Toplam Palet:</span>
                  <span className="font-medium">{stats.totalPallets}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Mevcut Stok:</span>
                  <span className="font-medium">{stats.stock}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Aylık Trend */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-semibold">Aylık Trend</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Ay</th>
                <th className="text-center py-2">Toplam Görev</th>
                <th className="text-center py-2">Tamamlanan</th>
                <th className="text-center py-2">Toplam Palet</th>
                <th className="text-center py-2">Başarı Oranı</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(reportData.monthlyStats)
                .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
                .map(([month, stats]) => (
                <tr key={month} className="border-b hover:bg-gray-50">
                  <td className="py-3 font-medium">{month}</td>
                  <td className="text-center py-3">{stats.totalTasks}</td>
                  <td className="text-center py-3 text-green-600">{stats.completedTasks}</td>
                  <td className="text-center py-3">{stats.totalPallets}</td>
                  <td className="text-center py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      getCompletionRate(stats.completedTasks, stats.totalTasks) >= 80
                        ? 'bg-green-100 text-green-800'
                        : getCompletionRate(stats.completedTasks, stats.totalTasks) >= 60
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      %{getCompletionRate(stats.completedTasks, stats.totalTasks)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;
