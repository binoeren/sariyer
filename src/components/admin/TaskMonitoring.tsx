import React, { useState, useEffect } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { db } from '../../firebase/config';
import { Task } from '../../types';
import { Monitor, Package, Clock, CheckCircle, Truck } from 'lucide-react';
import { generateQRCode } from '../../utils/qrGenerator'; // QR kod görseli için import eklendi

const TaskMonitoring: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [qrImages, setQrImages] = useState<{ [taskId: string]: string[] }>({});

  useEffect(() => {
    const tasksRef = ref(db, 'tasks');
    const unsubscribe = onValue(tasksRef, (snapshot) => {
      if (snapshot.exists()) {
        const tasksData = snapshot.val();
        const taskList = Object.keys(tasksData).map(key => ({
          id: key,
          ...tasksData[key]
        })) as Task[];
        setTasks(taskList);
      } else {
        setTasks([]);
      }
    });

    return () => off(tasksRef, 'value', unsubscribe);
  }, []);

  // QR kod görsellerini hazırla
  useEffect(() => {
    const fetchQRCodes = async () => {
      const imagesMap: { [taskId: string]: string[] } = {};
      for (const task of tasks) {
        if (task.palletQRCodes) {
          imagesMap[task.id] = await Promise.all(
            task.palletQRCodes.map(qr => generateQRCode(qr))
          );
        }
      }
      setQrImages(imagesMap);
    };
    fetchQRCodes();
  }, [tasks]);

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'teslim_alma_dogrulama':
        return <Clock className="w-4 h-4" />;
      case 'devam_ediyor':
        return <Truck className="w-4 h-4" />;
      case 'tamamlandı':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <Package className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Monitor className="w-8 h-8 text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-900">Görev Takibi</h2>
        <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
          Canlı Takip Aktif
        </div>
      </div>

      <div className="space-y-6">
        {tasks.map((task) => {
          const completionPercentage = task.status === 'tamamlandı' ? 100 : 
                                     task.status === 'devam_ediyor' ? 50 : 0;

          return (
            <div key={task.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {task.productName}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Üretim No: {task.productionNumber} | Toplam: {task.palletQuantity} Palet
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      %{completionPercentage}
                    </div>
                    <div className="text-sm text-gray-500">Tamamlandı</div>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>İlerleme</span>
                    <span>{task.status === 'tamamlandı' ? task.palletQuantity : 0}/{task.palletQuantity}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${completionPercentage}%` }}
                    ></div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-gray-600">
                      {task.status === 'teslim_alma_dogrulama' ? task.palletQuantity : 0}
                    </div>
                    <div className="text-sm text-gray-500">Bekliyor</div>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {task.status === 'devam_ediyor' ? task.palletQuantity : 0}
                    </div>
                    <div className="text-sm text-blue-600">Devam Ediyor</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {task.status === 'tamamlandı' ? task.palletQuantity : 0}
                    </div>
                    <div className="text-sm text-green-600">Tamamlandı</div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedTask(selectedTask === task.id ? null : task.id)}
                  className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Görev Detayları</span>
                    <span className="text-gray-400">
                      {selectedTask === task.id ? '▲' : '▼'}
                    </span>
                  </div>
                </button>

                {selectedTask === task.id && (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4 p-3 border border-gray-100 rounded-lg">
                      <div>
                        <p className="text-sm text-gray-500">Teslim Alma</p>
                        <p className="font-medium">{task.from}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Teslim Etme</p>
                        <p className="font-medium">{task.to}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Son Kullanma</p>
                        <p className="font-medium">{new Date(task.expirationDate).toLocaleDateString('tr-TR')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Oluşturulma</p>
                        <p className="font-medium">{new Date(task.createdAt).toLocaleDateString('tr-TR')}</p>
                      </div>
                    </div>
                    
                    <div className="p-3 border border-gray-100 rounded-lg">
                      <h4 className="font-medium mb-2">Palet QR Kodları:</h4>
                      <div className="space-y-1">
                        {task.palletQRCodes?.map((qrCode, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm text-gray-600 font-mono">
                            {index + 1}. {qrCode}
                            {/* QR kod görseli */}
                            {qrImages[task.id]?.[index] && (
                              <img src={qrImages[task.id][index]} alt={`QR ${index + 1}`} className="w-10 h-10 ml-2 border" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {tasks.length === 0 && (
        <div className="text-center py-12">
          <Monitor className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Takip edilecek görev yok</h3>
          <p className="text-gray-500">Görevler oluşturulduktan sonra burada takip edebilirsiniz.</p>
        </div>
      )}
    </div>
  );
};

export default TaskMonitoring;
