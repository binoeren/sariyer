import React, { useState, useEffect } from 'react';
import { ref, get, update, onValue, off } from 'firebase/database';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { Task } from '../../types';
import QRScanner from './QRScanner';
import { Truck, Package, QrCode, CheckCircle, LogOut } from 'lucide-react';

const DriverDashboard: React.FC = () => {
  const { userData, logout } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanMode, setScanMode] = useState<'pickup' | 'pallet' | 'delivery'>('pickup');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!userData?.id) return;

    const tasksRef = ref(db, 'tasks');
    const unsubscribe = onValue(tasksRef, (snapshot) => {
      if (snapshot.exists()) {
        const tasksData = snapshot.val();
        const taskList = Object.keys(tasksData)
          .map(key => ({
            id: key,
            ...tasksData[key]
          }))
          .filter((task: Task) => task.assignedTo === userData.id) as Task[];
        
        // Görevleri öncelik sırasına göre sırala
        taskList.sort((a, b) => {
          const priorityOrder = {
            'teslim_alma_dogrulama': 1,
            'devam_ediyor': 2,
            'tamamlandı': 3
          };
          return priorityOrder[a.status] - priorityOrder[b.status];
        });
        
        setTasks(taskList);
        
        if (selectedTask) {
          const updatedTask = taskList.find(t => t.id === selectedTask.id);
          if (updatedTask) {
            setSelectedTask(updatedTask);
          }
        }
      } else {
        setTasks([]);
      }
    });

    return () => off(tasksRef, 'value', unsubscribe);
  }, [userData?.id, selectedTask?.id]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleScanResult = async (result: string) => {
    if (!selectedTask) return;

    try {
      if (scanMode === 'pickup') {
        // Teslim alma noktası QR kodu kontrolü
        const productionLinesRef = ref(db, 'productionLines');
        const snapshot = await get(productionLinesRef);
        
        if (snapshot.exists()) {
          const productionLines = snapshot.val();
          const matchingLine = Object.values(productionLines).find((line: any) => line.qrCode === result);
          
          if (matchingLine && selectedTask.fromQrCode === result) {
            setMessage('✅ Teslim alma noktası doğrulandı! Şimdi ürünleri teslim alabilirsiniz.');
            setScanMode('pallet');
            
            // Görev durumunu güncelle
            await update(ref(db, `tasks/${selectedTask.id}`), { 
              status: 'devam_ediyor' 
            });
          } else {
            setMessage('❌ Yanlış teslim alma noktası QR kodu!');
          }
        } else {
          setMessage('❌ Üretim hatları bulunamadı!');
        }
      } else if (scanMode === 'pallet') {
        // Palet QR kodu kontrolü
        const palletStatuses = selectedTask.palletStatuses || [];
        const palletIndex = palletStatuses.findIndex(p => p.code === result);

        if (palletIndex !== -1) {
          if (palletStatuses[palletIndex].status === 'beklemede') {
            palletStatuses[palletIndex].status = 'forklift_üstünde';
            await update(ref(db, `tasks/${selectedTask.id}`), { palletStatuses });
            setMessage(`✅ Palet QR kodu doğrulandı: ${result}`);
          } else {
            setMessage('❌ Bu palet zaten okutulmuş!');
          }
        } else {
          setMessage('❌ Geçersiz palet QR kodu!');
        }
      } else if (scanMode === 'delivery') {
        // Teslim etme noktası QR kodu kontrolü
        const warehousesRef = ref(db, 'warehouses');
        const deliveryPointsRef = ref(db, 'deliveryPoints');
        
        const [warehousesSnapshot, deliveryPointsSnapshot] = await Promise.all([
          get(warehousesRef),
          get(deliveryPointsRef)
        ]);
        
        let isValidDelivery = false;
        
        if (warehousesSnapshot.exists()) {
          const warehouses = warehousesSnapshot.val();
          const matchingWarehouse = Object.values(warehouses).find((warehouse: any) => warehouse.qrCode === result);
          if (matchingWarehouse && selectedTask.toQrCode === result) {
            isValidDelivery = true;
          }
        }
        
        if (deliveryPointsSnapshot.exists()) {
          const deliveryPoints = deliveryPointsSnapshot.val();
          const matchingDeliveryPoint = Object.values(deliveryPoints).find((point: any) => point.qrCode === result);
          if (matchingDeliveryPoint && selectedTask.toQrCode === result) {
            isValidDelivery = true;
          }
        }
        
        if (isValidDelivery) {
          // Sadece forklift_üstünde olan paletleri teslim edilmiş yap
          const palletStatuses = selectedTask.palletStatuses || [];
          let anyDelivered = false;
          for (let p of palletStatuses) {
            if (p.status === 'forklift_üstünde') {
              p.status = 'teslim_edildi';
              anyDelivered = true;
            }
          }
          await update(ref(db, `tasks/${selectedTask.id}`), { palletStatuses });

          // Tüm paletler teslim edildiyse görevi tamamla
          if (palletStatuses.every(p => p.status === 'teslim_edildi')) {
            await update(ref(db, `tasks/${selectedTask.id}`), { status: 'tamamlandı' });
            // Ürün stoğunu artır
            const productsRef = ref(db, 'products');
            const productsSnapshot = await get(productsRef);
            
            if (productsSnapshot.exists()) {
              const products = productsSnapshot.val();
              const productKey = Object.keys(products).find(key => 
                products[key].qrCode === selectedTask.productQrCode
              );
              
              if (productKey) {
                const currentStock = products[productKey].stock || 0;
                const newStock = currentStock + selectedTask.palletQuantity;
                
                await update(ref(db, `products/${productKey}`), {
                  stock: newStock
                });
                
                setMessage(`🎉 Görev tamamlandı! ${selectedTask.palletQuantity} palet stoğa eklendi.`);
              }
            }
          } else if (anyDelivered) {
            setMessage('✅ Forklift üstündeki paletler teslim edildi!');
          } else {
            setMessage('❌ Teslim edilecek palet yok!');
          }
        } else {
          setMessage('❌ Yanlış teslim noktası QR kodu!');
        }
      }
    } catch (error) {
      console.error('Error processing scan:', error);
      setMessage('❌ QR kod işlenirken bir hata oluştu.');
    }

    setShowScanner(false);
    setTimeout(() => setMessage(''), 5000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Truck className="w-8 h-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Şöför Paneli</h1>
                <p className="text-sm text-gray-500">Hoş geldiniz, {userData?.name || userData?.email}</p>
              </div>
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
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.includes('✅') || message.includes('🎉') 
              ? 'bg-green-50 border border-green-200 text-green-800' 
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {message}
          </div>
        )}

        {!selectedTask ? (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Görevlerim</h2>
            
            {tasks.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz görev yok</h3>
                <p className="text-gray-500">Yeni görevler atandığında burada görünecek.</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {tasks.map((task) => (
                  <div key={task.id} className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{task.productName}</h3>
                        <p className="text-sm text-gray-500">Üretim No: {task.productionNumber}</p>
                      </div>
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                        task.status === 'teslim_alma_dogrulama' ? 'bg-yellow-100 text-yellow-800' :
                        task.status === 'devam_ediyor' ? 'bg-blue-100 text-blue-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {task.status === 'teslim_alma_dogrulama' ? 'Teslim Alma Bekliyor' :
                         task.status === 'devam_ediyor' ? 'Devam Ediyor' : 'Tamamlandı'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-gray-500">Teslim Alma</p>
                        <p className="font-medium">{task.from}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Teslim Etme</p>
                        <p className="font-medium">{task.to}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Palet Sayısı</p>
                        <p className="font-medium">{task.palletQuantity}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Son Kullanma</p>
                        <p className="font-medium">{new Date(task.expirationDate).toLocaleDateString('tr-TR')}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedTask(task)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition-colors"
                    >
                      Görev Detayı
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">{selectedTask.productName}</h2>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Geri Dön
              </button>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <p className="text-sm text-gray-500">Durum</p>
                  <p className="font-semibold">{
                    selectedTask.status === 'teslim_alma_dogrulama' ? 'Teslim Alma Bekliyor' :
                    selectedTask.status === 'devam_ediyor' ? 'Devam Ediyor' : 'Tamamlandı'
                  }</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Palet Sayısı</p>
                  <p className="font-semibold">{selectedTask.palletQuantity}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Üretim No</p>
                  <p className="font-semibold">{selectedTask.productionNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Son Kullanma</p>
                  <p className="font-semibold">{new Date(selectedTask.expirationDate).toLocaleDateString('tr-TR')}</p>
                </div>
              </div>

              <div className="space-y-4">
                {selectedTask.status === 'teslim_alma_dogrulama' && (
                  <button
                    onClick={() => {
                      setScanMode('pickup');
                      setShowScanner(true);
                    }}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-md flex items-center justify-center gap-2 transition-colors"
                  >
                    <QrCode className="w-5 h-5" />
                    Teslim Alma Noktası QR Kodunu Okut
                  </button>
                )}

                {selectedTask.status === 'devam_ediyor' && (
                  <div className="space-y-3">
                    <button
                      onClick={() => {
                        setScanMode('pallet');
                        setShowScanner(true);
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-md flex items-center justify-center gap-2 transition-colors"
                    >
                      <Package className="w-5 h-5" />
                      Palet QR Kodunu Okut
                    </button>

                    <button
                      onClick={() => {
                        setScanMode('delivery');
                        setShowScanner(true);
                      }}
                      className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 px-4 rounded-md flex items-center justify-center gap-2 transition-colors"
                    >
                      <CheckCircle className="w-5 h-5" />
                      Teslim Etme Noktası QR Kodunu Okut
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">Palet QR Kodları</h3>
              <div className="space-y-3">
                {selectedTask.palletQRCodes?.map((qrCode, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Package className="w-5 h-5 text-gray-600" />
                      <span className="font-medium">Palet #{index + 1}</span>
                    </div>
                    <span className="text-sm text-gray-500 font-mono">{qrCode}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {showScanner && (
        <QRScanner
          onScanResult={handleScanResult}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
};

export default DriverDashboard;
