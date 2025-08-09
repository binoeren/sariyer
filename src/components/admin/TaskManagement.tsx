import React, { useState, useEffect } from 'react';
import { ref, push, get, set, remove, update } from 'firebase/database';
import { db } from '../../firebase/config';
import { Task, Product, User, ProductionLine, Warehouse, DeliveryPoint, Truck } from '../../types';
import { Plus, Package, Users, MapPin, Calendar, Trash2, Edit, CheckCircle, X, AlertTriangle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const TaskManagement: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [productionLines, setProductionLines] = useState<ProductionLine[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [deliveryPoints, setDeliveryPoints] = useState<DeliveryPoint[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState({
    productId: '',
    fromType: 'production' as 'production' | 'warehouse',
    fromId: '',
    toType: 'warehouse' as 'warehouse' | 'delivery' | 'truck',
    toId: '',
    assignedTo: '',
    palletQuantity: 1,
    expirationDays: 30
  });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [tasksSnapshot, productsSnapshot, usersSnapshot, productionLinesSnapshot, warehousesSnapshot, deliveryPointsSnapshot, trucksSnapshot] = await Promise.all([
        get(ref(db, 'tasks')),
        get(ref(db, 'products')),
        get(ref(db, 'users')),
        get(ref(db, 'productionLines')),
        get(ref(db, 'warehouses')),
        get(ref(db, 'deliveryPoints')),
        get(ref(db, 'trucks'))
      ]);

      const tasksData = tasksSnapshot.exists() 
        ? Object.keys(tasksSnapshot.val()).map(key => ({ id: key, ...tasksSnapshot.val()[key] }))
        : [];

      const productsData = productsSnapshot.exists()
        ? Object.keys(productsSnapshot.val()).map(key => ({ id: key, ...productsSnapshot.val()[key] }))
        : [];

      const usersData = usersSnapshot.exists()
        ? Object.keys(usersSnapshot.val()).map(key => ({ id: key, ...usersSnapshot.val()[key] }))
        : [];

      const productionLinesData = productionLinesSnapshot.exists()
        ? Object.keys(productionLinesSnapshot.val()).map(key => ({ id: key, ...productionLinesSnapshot.val()[key] }))
        : [];

      const warehousesData = warehousesSnapshot.exists()
        ? Object.keys(warehousesSnapshot.val()).map(key => ({ id: key, ...warehousesSnapshot.val()[key] }))
        : [];

      const deliveryPointsData = deliveryPointsSnapshot.exists()
        ? Object.keys(deliveryPointsSnapshot.val()).map(key => ({ id: key, ...deliveryPointsSnapshot.val()[key] }))
        : [];

      const trucksData = trucksSnapshot.exists()
        ? Object.keys(trucksSnapshot.val()).map(key => ({ id: key, ...trucksSnapshot.val()[key] }))
        : [];

      setTasks(tasksData);
      setProducts(productsData);
      setUsers(usersData.filter(user => user.role === 'sofor'));
      setProductionLines(productionLinesData);
      setWarehouses(warehousesData);
      setDeliveryPoints(deliveryPointsData);
      setTrucks(trucksData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generatePalletQRCodes = (productQrCode: string, productionNumber: number, palletQuantity: number, destination: string): string[] => {
    const timestamp = Date.now();
    const qrCodes: string[] = [];
    
    for (let i = 1; i <= palletQuantity; i++) {
      const uniqueId = uuidv4().substring(0, 8);
      const qrCode = `${productQrCode}_${productionNumber}_${i}_${destination}_${timestamp}_${uniqueId}`;
      qrCodes.push(qrCode);
    }
    
    return qrCodes;
  };

  const getNextProductionNumber = async (): Promise<number> => {
    try {
      const settingsRef = ref(db, 'settings/lastProductionNumber');
      const snapshot = await get(settingsRef);
      const lastNumber = snapshot.exists() ? snapshot.val() : 0;
      const nextNumber = lastNumber + 1;
      await set(settingsRef, nextNumber);
      return nextNumber;
    } catch (error) {
      console.error('Error getting production number:', error);
      return Date.now();
    }
  };

  const updateTruckInventory = async (taskId: string, productId: string, productionNumber: number, palletQuantity: number, truckId: string, status: 'reserved' | 'loaded', expirationDate: string) => {
    try {
      const truckRef = ref(db, `trucks/${truckId}`);
      const truckSnapshot = await get(truckRef);
      
      if (!truckSnapshot.exists()) {
        throw new Error('Tır bulunamadı');
      }

      const truck = truckSnapshot.val();
      const inventory = truck.inventory || {};
      
      if (!inventory[productId]) {
        inventory[productId] = {
          batches: {},
          totalPallets: 0
        };
      }

      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      inventory[productId].batches[batchId] = {
        expirationDate,
        palletQuantity,
        productionNumber,
        taskId,
        status
      };

      // Toplam palet sayısını güncelle
      inventory[productId].totalPallets = Object.values(inventory[productId].batches)
        .reduce((total: number, batch: any) => total + batch.palletQuantity, 0);

      await update(truckRef, { inventory });
    } catch (error) {
      console.error('Error updating truck inventory:', error);
      throw error;
    }
  };

  const removeTruckInventory = async (taskId: string, truckId: string) => {
    try {
      const truckRef = ref(db, `trucks/${truckId}`);
      const truckSnapshot = await get(truckRef);
      
      if (!truckSnapshot.exists()) {
        return;
      }

      const truck = truckSnapshot.val();
      const inventory = truck.inventory || {};
      
      // Görevle ilişkili batch'leri bul ve sil
      Object.keys(inventory).forEach(productId => {
        const productInventory = inventory[productId];
        if (productInventory.batches) {
          Object.keys(productInventory.batches).forEach(batchId => {
            const batch = productInventory.batches[batchId];
            if (batch.taskId === taskId) {
              delete productInventory.batches[batchId];
            }
          });
          
          // Toplam palet sayısını güncelle
          productInventory.totalPallets = Object.values(productInventory.batches)
            .reduce((total: number, batch: any) => total + batch.palletQuantity, 0);
          
          // Eğer hiç batch kalmadıysa ürünü sil
          if (Object.keys(productInventory.batches).length === 0) {
            delete inventory[productId];
          }
        }
      });

      await update(truckRef, { inventory });
    } catch (error) {
      console.error('Error removing truck inventory:', error);
      throw error;
    }
  };

  const updateTruckBatchStatus = async (taskId: string, truckId: string, newStatus: 'reserved' | 'loaded') => {
    try {
      const truckRef = ref(db, `trucks/${truckId}`);
      const truckSnapshot = await get(truckRef);
      
      if (!truckSnapshot.exists()) {
        return;
      }

      const truck = truckSnapshot.val();
      const inventory = truck.inventory || {};
      
      // Görevle ilişkili batch'lerin durumunu güncelle
      Object.keys(inventory).forEach(productId => {
        const productInventory = inventory[productId];
        if (productInventory.batches) {
          Object.keys(productInventory.batches).forEach(batchId => {
            const batch = productInventory.batches[batchId];
            if (batch.taskId === taskId) {
              batch.status = newStatus;
            }
          });
        }
      });

      await update(truckRef, { inventory });
    } catch (error) {
      console.error('Error updating truck batch status:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const product = products.find(p => p.id === formData.productId);
      if (!product) {
        alert('Ürün bulunamadı');
        return;
      }

      const driver = users.find(u => u.id === formData.assignedTo);
      if (!driver) {
        alert('Şöför bulunamadı');
        return;
      }

      let fromLocation = '';
      let fromQrCode = '';
      let toLocation = '';
      let toQrCode = '';
      let taskType: 'productionToWarehouse' | 'productionToTruck' | 'warehouseToTruck' = 'productionToWarehouse';

      // Kaynak bilgilerini al
      if (formData.fromType === 'production') {
        const productionLine = productionLines.find(pl => pl.id === formData.fromId);
        if (!productionLine) {
          alert('Üretim hattı bulunamadı');
          return;
        }
        fromLocation = productionLine.name;
        fromQrCode = productionLine.qrCode;
      } else {
        const warehouse = warehouses.find(w => w.id === formData.fromId);
        if (!warehouse) {
          alert('Kaynak depo bulunamadı');
          return;
        }
        fromLocation = warehouse.name;
        fromQrCode = warehouse.qrCode;
      }

      // Hedef bilgilerini al
      if (formData.toType === 'warehouse') {
        const warehouse = warehouses.find(w => w.id === formData.toId);
        if (!warehouse) {
          alert('Hedef depo bulunamadı');
          return;
        }
        toLocation = warehouse.name;
        toQrCode = warehouse.qrCode;
        taskType = formData.fromType === 'production' ? 'productionToWarehouse' : 'warehouseToTruck';
      } else if (formData.toType === 'delivery') {
        const deliveryPoint = deliveryPoints.find(dp => dp.id === formData.toId);
        if (!deliveryPoint) {
          alert('Teslimat noktası bulunamadı');
          return;
        }
        toLocation = deliveryPoint.name;
        toQrCode = deliveryPoint.qrCode;
        taskType = 'warehouseToTruck';
      } else if (formData.toType === 'truck') {
        const truck = trucks.find(t => t.id === formData.toId);
        if (!truck) {
          alert('Tır bulunamadı');
          return;
        }
        toLocation = truck.name;
        toQrCode = truck.qrCode;
        taskType = formData.fromType === 'production' ? 'productionToTruck' : 'warehouseToTruck';
      }

      const productionNumber = await getNextProductionNumber();
      const palletQRCodes = generatePalletQRCodes(product.qrCode, productionNumber, formData.palletQuantity, toLocation);
      
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + (product.expiryDays || formData.expirationDays));

      const taskData: Omit<Task, 'id'> = {
        assignedTo: formData.assignedTo,
        createdAt: new Date().toISOString(),
        expirationDate: expirationDate.toISOString(),
        from: fromLocation,
        fromQrCode: fromQrCode,
        palletQRCodes: palletQRCodes,
        palletQuantity: formData.palletQuantity,
        productName: product.name,
        productQrCode: product.qrCode,
        productionNumber: productionNumber,
        status: 'teslim_alma_dogrulama',
        taskType: taskType,
        to: toLocation,
        toQrCode: toQrCode,
        palletStatuses: palletQRCodes.map(code => ({ code, status: 'beklemede' as const })),
        productId: formData.productId,
        toId: formData.toId,
        fromId: formData.fromId
      };

      if (editingTask) {
        // Görev güncelleme
        await update(ref(db, `tasks/${editingTask.id}`), taskData);
        alert('Görev başarıyla güncellendi!');
      } else {
        // Yeni görev oluşturma
        const newTaskRef = push(ref(db, 'tasks'));
        await set(newTaskRef, taskData);

        // Eğer hedef tır ise, tır envanterini rezerve et
        if (formData.toType === 'truck') {
          await updateTruckInventory(
            newTaskRef.key!,
            formData.productId,
            productionNumber,
            formData.palletQuantity,
            formData.toId,
            'reserved',
            expirationDate.toISOString()
          );
        }

        alert('Görev başarıyla oluşturuldu!');
      }

      // Formu temizle
      setFormData({
        productId: '',
        fromType: 'production',
        fromId: '',
        toType: 'warehouse',
        toId: '',
        assignedTo: '',
        palletQuantity: 1,
        expirationDays: 30
      });
      setShowForm(false);
      setEditingTask(null);
      fetchAllData();
    } catch (error) {
      console.error('Error creating/updating task:', error);
      alert('Görev oluşturulurken/güncellenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: 'teslim_alma_dogrulama' | 'devam_ediyor' | 'tamamlandı') => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) {
        alert('Görev bulunamadı');
        return;
      }

      // Görev durumunu güncelle
      await update(ref(db, `tasks/${taskId}`), { status: newStatus });

      // Eğer görev tıra yönelikse ve tamamlandı durumuna geçiyorsa
      if (task.toType === 'truck' && newStatus === 'tamamlandı') {
        await updateTruckBatchStatus(taskId, task.toId, 'loaded');
      }

      alert('Görev durumu başarıyla güncellendi!');
      fetchAllData();
    } catch (error) {
      console.error('Error updating task status:', error);
      alert('Görev durumu güncellenirken bir hata oluştu.');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('Bu görevi silmek istediğinizden emin misiniz?')) {
      return;
    }

    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) {
        alert('Görev bulunamadı');
        return;
      }

      // Eğer görev tıra yönelikse, tır envanterinden sil
      if (task.toType === 'truck') {
        await removeTruckInventory(taskId, task.toId);
      }

      // Görevi sil
      await remove(ref(db, `tasks/${taskId}`));
      
      alert('Görev başarıyla silindi!');
      fetchAllData();
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Görev silinirken bir hata oluştu.');
    }
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setFormData({
      productId: task.productId || '',
      fromType: task.taskType.includes('production') ? 'production' : 'warehouse',
      fromId: task.fromId || '',
      toType: task.toType || 'warehouse',
      toId: task.toId || '',
      assignedTo: task.assignedTo,
      palletQuantity: task.palletQuantity,
      expirationDays: 30
    });
    setShowForm(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'teslim_alma_dogrulama':
        return 'bg-yellow-100 text-yellow-800';
      case 'devam_ediyor':
        return 'bg-blue-100 text-blue-800';
      case 'tamamlandı':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'teslim_alma_dogrulama':
        return 'Teslim Alma Bekliyor';
      case 'devam_ediyor':
        return 'Devam Ediyor';
      case 'tamamlandı':
        return 'Tamamlandı';
      default:
        return 'Bilinmiyor';
    }
  };

  const getTaskTypeText = (taskType: string) => {
    switch (taskType) {
      case 'productionToWarehouse':
        return 'Üretimden Depoya';
      case 'productionToTruck':
        return 'Üretimden Tıra';
      case 'warehouseToTruck':
        return 'Depodan Tıra';
      default:
        return 'Bilinmiyor';
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Veriler yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Görev Yönetimi</h2>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingTask(null);
            setFormData({
              productId: '',
              fromType: 'production',
              fromId: '',
              toType: 'warehouse',
              toId: '',
              assignedTo: '',
              palletQuantity: 1,
              expirationDays: 30
            });
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Yeni Görev Oluştur
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">
            {editingTask ? 'Görev Düzenle' : 'Yeni Görev Oluştur'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ürün *
                </label>
                <select
                  value={formData.productId}
                  onChange={(e) => setFormData({...formData, productId: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Ürün Seçin</option>
                  {products.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.qrCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kaynak Tipi *
                </label>
                <select
                  value={formData.fromType}
                  onChange={(e) => setFormData({...formData, fromType: e.target.value as 'production' | 'warehouse', fromId: ''})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="production">Üretim Hattı</option>
                  <option value="warehouse">Depo</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kaynak *
                </label>
                <select
                  value={formData.fromId}
                  onChange={(e) => setFormData({...formData, fromId: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">
                    {formData.fromType === 'production' ? 'Üretim Hattı Seçin' : 'Depo Seçin'}
                  </option>
                  {formData.fromType === 'production' 
                    ? productionLines.map(line => (
                        <option key={line.id} value={line.id}>
                          {line.name} ({line.qrCode})
                        </option>
                      ))
                    : warehouses.map(warehouse => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name} ({warehouse.qrCode})
                        </option>
                      ))
                  }
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hedef Tipi *
                </label>
                <select
                  value={formData.toType}
                  onChange={(e) => setFormData({...formData, toType: e.target.value as 'warehouse' | 'delivery' | 'truck', toId: ''})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="warehouse">Depo</option>
                  <option value="delivery">Teslimat Noktası</option>
                  <option value="truck">Tır</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hedef *
                </label>
                <select
                  value={formData.toId}
                  onChange={(e) => setFormData({...formData, toId: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">
                    {formData.toType === 'warehouse' ? 'Depo Seçin' : 
                     formData.toType === 'delivery' ? 'Teslimat Noktası Seçin' : 'Tır Seçin'}
                  </option>
                  {formData.toType === 'warehouse' 
                    ? warehouses.map(warehouse => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name} ({warehouse.qrCode})
                        </option>
                      ))
                    : formData.toType === 'delivery'
                    ? deliveryPoints.map(point => (
                        <option key={point.id} value={point.id}>
                          {point.name} ({point.qrCode})
                        </option>
                      ))
                    : trucks.map(truck => (
                        <option key={truck.id} value={truck.id}>
                          {truck.name} ({truck.qrCode})
                        </option>
                      ))
                  }
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Atanan Şöför *
                </label>
                <select
                  value={formData.assignedTo}
                  onChange={(e) => setFormData({...formData, assignedTo: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Şöför Seçin</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Palet Sayısı *
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formData.palletQuantity}
                  onChange={(e) => setFormData({...formData, palletQuantity: parseInt(e.target.value) || 1})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Son Kullanıma Kalan Gün
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={formData.expirationDays}
                  onChange={(e) => setFormData({...formData, expirationDays: parseInt(e.target.value) || 30})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-6 py-2 rounded-md transition-colors"
              >
                {loading ? 'İşleniyor...' : editingTask ? 'Görevi Güncelle' : 'Görev Oluştur'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingTask(null);
                }}
                className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-md transition-colors"
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {tasks.map((task) => {
          const product = products.find(p => p.id === task.productId);
          const driver = users.find(u => u.id === task.assignedTo);
          const isExpiringSoon = new Date(task.expirationDate) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          const isExpired = new Date(task.expirationDate) < new Date();

          return (
            <div key={task.id} className={`bg-white border rounded-lg p-6 ${isExpired ? 'border-red-300 bg-red-50' : isExpiringSoon ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{task.productName}</h3>
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(task.status)}`}>
                      {getStatusText(task.status)}
                    </span>
                    {isExpired && (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Süresi Geçmiş
                      </span>
                    )}
                    {isExpiringSoon && !isExpired && (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Yakında Sona Eriyor
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mb-2">
                    Görev ID: {task.id} | Üretim No: {task.productionNumber} | Tip: {getTaskTypeText(task.taskType)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={task.status}
                    onChange={(e) => handleStatusChange(task.id, e.target.value as any)}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="teslim_alma_dogrulama">Teslim Alma Bekliyor</option>
                    <option value="devam_ediyor">Devam Ediyor</option>
                    <option value="tamamlandı">Tamamlandı</option>
                  </select>
                  <button
                    onClick={() => handleEditTask(task)}
                    className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full transition-colors"
                    title="Görevi Düzenle"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full transition-colors"
                    title="Görevi Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-xs text-gray-500">Kaynak</p>
                    <p className="text-sm font-medium">{task.from}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-xs text-gray-500">Hedef</p>
                    <p className="text-sm font-medium">{task.to}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-xs text-gray-500">Şöför</p>
                    <p className="text-sm font-medium">{driver?.name || 'Bilinmiyor'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-xs text-gray-500">Palet Sayısı</p>
                    <p className="text-sm font-medium">{task.palletQuantity}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Oluşturulma Tarihi:</p>
                  <p className="font-medium">{new Date(task.createdAt).toLocaleDateString('tr-TR')}</p>
                </div>
                <div>
                  <p className="text-gray-500">Son Kullanma Tarihi:</p>
                  <p className={`font-medium ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-yellow-600' : ''}`}>
                    {new Date(task.expirationDate).toLocaleDateString('tr-TR')}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {tasks.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz görev yok</h3>
          <p className="text-gray-500">İlk görevinizi oluşturmak için yukarıdaki butona tıklayın.</p>
        </div>
      )}
    </div>
  );
};

export default TaskManagement;