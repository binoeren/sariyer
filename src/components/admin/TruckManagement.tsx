import React, { useEffect, useState } from 'react';
import { ref, get, push, set, remove } from 'firebase/database';
import { db } from '../../firebase/config';
import { Truck, Product, Task } from '../../types';
import { Plus, Trash2, Truck as TruckIcon, Package, Eye, X } from 'lucide-react';
import { generateQRCode } from '../../utils/qrGenerator';

const TruckManagement: React.FC = () => {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [name, setName] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [capacity, setCapacity] = useState<number>(50);
  const [qrImages, setQrImages] = useState<{ [id: string]: string }>({});
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    fetchTrucks();
    fetchProducts();
    fetchTasks();
  }, []);

  useEffect(() => {
    const fetchQRCodes = async () => {
      const images: { [id: string]: string } = {};
      for (const truck of trucks) {
        if (truck.qrCode) {
          images[truck.id] = await generateQRCode(truck.qrCode);
        }
      }
      setQrImages(images);
    };
    fetchQRCodes();
  }, [trucks]);

  const fetchTrucks = async () => {
    try {
      const trucksRef = ref(db, 'trucks');
      const snapshot = await get(trucksRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        setTrucks(Object.keys(data).map(key => ({ id: key, ...data[key] })));
      } else {
        setTrucks([]);
      }
    } catch (error) {
      console.error('Error fetching trucks:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const productsRef = ref(db, 'products');
      const snapshot = await get(productsRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        setProducts(Object.keys(data).map(key => ({ id: key, ...data[key] })));
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchTasks = async () => {
    try {
      const tasksRef = ref(db, 'tasks');
      const snapshot = await get(tasksRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        setTasks(Object.keys(data).map(key => ({ id: key, ...data[key] })));
      } else {
        setTasks([]);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !qrCode || !capacity) return;
    
    try {
      const newRef = push(ref(db, 'trucks'));
      await set(newRef, { 
        name, 
        qrCode, 
        capacity: capacity 
      });
      setName('');
      setQrCode('');
      setCapacity(50);
      fetchTrucks();
      alert('Tır başarıyla eklendi!');
    } catch (error) {
      console.error('Error adding truck:', error);
      alert('Tır eklenirken bir hata oluştu.');
    }
  };

  const handleDelete = async (id: string, truckName: string) => {
    if (window.confirm(`"${truckName}" tırını silmek istediğinizden emin misiniz?`)) {
      try {
        await remove(ref(db, `trucks/${id}`));
        fetchTrucks();
        alert('Tır başarıyla silindi!');
      } catch (error) {
        console.error('Error deleting truck:', error);
        alert('Tır silinirken bir hata oluştu.');
      }
    }
  };

  const calculateTruckStats = (truck: Truck) => {
    let totalPallets = 0;
    let reservedPallets = 0;
    let loadedPallets = 0;
    const productBreakdown: { [productId: string]: { name: string; pallets: number; status: string } } = {};
    const activeTasks: Task[] = [];

    if (truck.inventory) {
      Object.keys(truck.inventory).forEach(productId => {
        const product = products.find(p => p.id === productId);
        const productName = product?.name || 'Bilinmeyen Ürün';
        const productInventory = truck.inventory![productId];
        let productPallets = 0;
        let productStatus = 'loaded';

        if (productInventory.batches) {
          Object.values(productInventory.batches).forEach(batch => {
            productPallets += batch.palletQuantity;
            totalPallets += batch.palletQuantity;
            
            if (batch.status === 'reserved') {
              reservedPallets += batch.palletQuantity;
              productStatus = 'reserved';
              // İlgili görevi bul
              const relatedTask = tasks.find(t => t.id === batch.taskId);
              if (relatedTask) activeTasks.push(relatedTask);
            } else {
              loadedPallets += batch.palletQuantity;
            }
          });
        }

        if (productPallets > 0) {
          productBreakdown[productId] = { name: productName, pallets: productPallets, status: productStatus };
        }
      });
    }

    const capacity = truck.capacity || 0;
    const available = capacity - totalPallets;
    const usagePercentage = capacity > 0 ? Math.round((totalPallets / capacity) * 100) : 0;

    return { totalPallets, reservedPallets, loadedPallets, capacity, available, usagePercentage, productBreakdown, activeTasks };
  };

  const showTruckDetail = (truck: Truck) => {
    setSelectedTruck(truck);
    setShowDetailModal(true);
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <TruckIcon className="w-8 h-8 text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-900">Tır Yönetimi</h2>
      </div>
      
      <div className="bg-gray-50 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Yeni Tır Ekle</h3>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tır Adı/Plaka *
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Örn: 34 ABC 123"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                QR Kodu *
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Örn: TIR_001"
                value={qrCode}
                onChange={e => setQrCode(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Kapasite (Palet) *
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Örn: 50"
                value={capacity}
                onChange={e => setCapacity(parseInt(e.target.value) || 50)}
                required
              />
            </div>
          </div>
          <div className="flex gap-4">
            <button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-md transition-colors"
            >
              Tır Ekle
            </button>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {trucks.map(truck => {
          const stats = calculateTruckStats(truck);
          return (
            <div key={truck.id} className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-3 rounded-full">
                    <TruckIcon className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{truck.name}</h3>
                    <p className="text-sm text-gray-500">QR: {truck.qrCode}</p>
                  </div>
                </div>
                <button
                  onClick={() => showTruckDetail(truck)}
                  className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full transition-colors mr-2"
                  title="Tır Detayı"
                >
                  <Eye className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleDelete(truck.id, truck.name)}
                  className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full transition-colors"
                  title="Tırı Sil"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Toplam Kapasite:</span>
                  <span className="text-lg font-bold text-blue-600">{stats.capacity} palet</span>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-orange-50 p-2 rounded">
                    <div className="text-sm font-bold text-orange-600">{stats.reservedPallets}</div>
                    <div className="text-xs text-gray-600">Rezerve</div>
                  </div>
                  <div className="bg-blue-50 p-2 rounded">
                    <div className="text-sm font-bold text-blue-600">{stats.loadedPallets}</div>
                    <div className="text-xs text-gray-600">Yüklü</div>
                  </div>
                  <div className="bg-green-50 p-2 rounded">
                    <div className="text-sm font-bold text-green-600">{stats.available}</div>
                    <div className="text-xs text-gray-600">Boş</div>
                  </div>
                </div>
                
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all duration-300 ${
                      stats.usagePercentage >= 90 ? 'bg-red-500' :
                      stats.usagePercentage >= 70 ? 'bg-yellow-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${stats.usagePercentage}%` }}
                  ></div>
                </div>
                <div className="text-center text-sm text-gray-600">
                  Doluluk: %{stats.usagePercentage}
                </div>
                
                {qrImages[truck.id] && (
                  <div className="text-center">
                    <p className="text-sm text-gray-500 mb-2">QR Kod:</p>
                    <img 
                      src={qrImages[truck.id]} 
                      alt={`${truck.name} QR`} 
                      className="w-20 h-20 mx-auto border border-gray-300 rounded"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {trucks.length === 0 && (
        <div className="text-center py-12">
          <TruckIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz tır yok</h3>
          <p className="text-gray-500">İlk tırınızı eklemek için yukarıdaki formu kullanın.</p>
        </div>
      )}

      {/* Tır Detay Modal */}
      {showDetailModal && selectedTruck && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {selectedTruck.name} - Tır Detayı
              </h3>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const stats = calculateTruckStats(selectedTruck);
              return (
                <div className="space-y-6">
                  {/* Genel İstatistikler */}
                  <div className="grid grid-cols-5 gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{stats.capacity}</div>
                      <div className="text-sm text-gray-500">Toplam Kapasite</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">{stats.reservedPallets}</div>
                      <div className="text-sm text-gray-500">Rezerve</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{stats.loadedPallets}</div>
                      <div className="text-sm text-gray-500">Yüklü</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{stats.available}</div>
                      <div className="text-sm text-gray-500">Boş</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-600">%{stats.usagePercentage}</div>
                      <div className="text-sm text-gray-500">Doluluk</div>
                    </div>
                  </div>

                  {/* Aktif Görevler */}
                  {stats.activeTasks.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-3">Aktif Görevler:</h4>
                      <div className="space-y-2">
                        {stats.activeTasks.map(task => (
                          <div key={task.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-yellow-50">
                            <div>
                              <span className="font-medium">{task.productName}</span>
                              <span className="text-sm text-gray-500 ml-2">({task.palletQuantity} palet)</span>
                            </div>
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              task.status === 'teslim_alma_dogrulama' ? 'bg-yellow-100 text-yellow-800' :
                              task.status === 'devam_ediyor' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                            }`}>
                              {task.status === 'teslim_alma_dogrulama' ? 'Bekliyor' :
                               task.status === 'devam_ediyor' ? 'Devam Ediyor' : 'Tamamlandı'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ürün Dağılımı */}
                  <div>
                    <h4 className="font-medium mb-3">Ürün Dağılımı:</h4>
                    {Object.keys(stats.productBreakdown).length > 0 ? (
                      <div className="space-y-2">
                        {Object.entries(stats.productBreakdown).map(([productId, data]) => (
                          <div key={productId} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                            <div className="flex items-center gap-3">
                              <Package className="w-5 h-5 text-gray-600" />
                              <span className="font-medium">{data.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm text-gray-500">{data.pallets} palet</span>
                              <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${
                                data.status === 'reserved' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {data.status === 'reserved' ? 'Rezerve' : 'Yüklü'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">Bu tırda henüz yük bulunmuyor.</p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default TruckManagement;