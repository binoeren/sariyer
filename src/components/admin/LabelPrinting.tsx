import React, { useState, useEffect } from 'react';
import { ref, get } from 'firebase/database';
import { db } from '../../firebase/config';
import { Task, Product, User, ProductionLine, Warehouse, DeliveryPoint } from '../../types';
import { Printer, Package, QrCode, Calendar, User as UserIcon, MapPin, Clock, Hash, Truck, AlertTriangle } from 'lucide-react';
import { generateQRCode } from '../../utils/qrGenerator';

interface LabelData {
  palletQRCode: string;
  palletNumber: number;
  productName: string;
  productQRCode: string;
  productionNumber: number;
  expirationDate: string;
  taskId: string;
  driverName: string;
  fromLocation: string;
  toLocation: string;
  createdDate: string;
  palletCount: number;
  taskStatus: string;
  priority: string;
  batchInfo: string;
  qrCodeImage: string;
}

const LabelPrinting: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [productionLines, setProductionLines] = useState<ProductionLine[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [deliveryPoints, setDeliveryPoints] = useState<DeliveryPoint[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [labels, setLabels] = useState<LabelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingLabels, setGeneratingLabels] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tasksSnapshot, productsSnapshot, usersSnapshot, productionLinesSnapshot, warehousesSnapshot, deliveryPointsSnapshot] = await Promise.all([
        get(ref(db, 'tasks')),
        get(ref(db, 'products')),
        get(ref(db, 'users')),
        get(ref(db, 'productionLines')),
        get(ref(db, 'warehouses')),
        get(ref(db, 'deliveryPoints'))
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

      // Sadece beklemede olan veya devam eden görevleri filtrele
      const activeTasks = tasksData.filter((task: Task) => 
        task.status === 'teslim_alma_dogrulama' || task.status === 'devam_ediyor'
      );

      setTasks(activeTasks);
      setProducts(productsData);
      setUsers(usersData);
      setProductionLines(productionLinesData);
      setWarehouses(warehousesData);
      setDeliveryPoints(deliveryPointsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateLabelsForTask = async (task: Task) => {
    setGeneratingLabels(true);
    try {
      const driver = users.find(u => u.id === task.assignedTo);
      const product = products.find(p => p.productQrCode === task.productQrCode || p.qrCode === task.productQrCode);
      
      const taskStatusText = task.status === 'teslim_alma_dogrulama' ? 'Teslim Alma Bekliyor' : 'Devam Ediyor';
      
      // Öncelik belirleme
      const expirationDate = new Date(task.expirationDate);
      const today = new Date();
      const daysUntilExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      let priority = 'Normal';
      if (daysUntilExpiration < 0) priority = 'Süresi Geçmiş';
      else if (daysUntilExpiration <= 3) priority = 'Acil';
      else if (daysUntilExpiration <= 7) priority = 'Yüksek';
      else if (daysUntilExpiration <= 14) priority = 'Orta';

      const labelsData: LabelData[] = [];

      for (let i = 0; i < task.palletQRCodes.length; i++) {
        const qrCode = task.palletQRCodes[i];
        const qrCodeImage = await generateQRCode(qrCode);
        
        labelsData.push({
          palletQRCode: qrCode,
          palletNumber: i + 1,
          productName: task.productName,
          productQRCode: task.productQrCode,
          productionNumber: task.productionNumber,
          expirationDate: new Date(task.expirationDate).toLocaleDateString('tr-TR'),
          taskId: task.id,
          driverName: driver?.name || 'Atanmamış',
          fromLocation: task.from,
          toLocation: task.to,
          createdDate: new Date(task.createdAt).toLocaleDateString('tr-TR'),
          palletCount: task.palletQuantity,
          taskStatus: taskStatusText,
          priority: priority,
          batchInfo: `ÜN-${task.productionNumber}`,
          qrCodeImage: qrCodeImage
        });
      }

      setLabels(labelsData);
    } catch (error) {
      console.error('Error generating labels:', error);
      alert('Etiketler oluşturulurken bir hata oluştu.');
    } finally {
      setGeneratingLabels(false);
    }
  };

  const handleTaskSelect = (task: Task) => {
    setSelectedTask(task);
    generateLabelsForTask(task);
  };

  const printLabels = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up engelleyici nedeniyle yazdırma penceresi açılamadı.');
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Palet Etiketleri</title>
        <meta charset="utf-8">
        <style>
          @page {
            size: A4;
            margin: 10mm;
          }
          
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            font-size: 12px;
          }
          
          .label-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10mm;
            page-break-inside: avoid;
          }
          
          .label {
            border: 2px solid #000;
            padding: 8mm;
            margin-bottom: 10mm;
            background: white;
            page-break-inside: avoid;
            min-height: 120mm;
            position: relative;
          }
          
          .label-header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 5mm;
            margin-bottom: 5mm;
          }
          
          .company-name {
            font-size: 18px;
            font-weight: bold;
            color: #1e40af;
            margin-bottom: 2mm;
          }
          
          .label-title {
            font-size: 14px;
            font-weight: bold;
            color: #374151;
          }
          
          .qr-section {
            text-align: center;
            margin: 5mm 0;
            padding: 3mm;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
          }
          
          .qr-code {
            width: 60px;
            height: 60px;
            margin: 0 auto 3mm auto;
            display: block;
          }
          
          .qr-text {
            font-size: 10px;
            font-family: monospace;
            word-break: break-all;
            color: #4b5563;
          }
          
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 3mm;
            margin: 5mm 0;
          }
          
          .info-item {
            margin-bottom: 3mm;
          }
          
          .info-label {
            font-weight: bold;
            color: #374151;
            font-size: 10px;
            display: block;
            margin-bottom: 1mm;
          }
          
          .info-value {
            color: #1f2937;
            font-size: 11px;
            word-wrap: break-word;
          }
          
          .priority-badge {
            position: absolute;
            top: 5mm;
            right: 5mm;
            padding: 2mm 4mm;
            border-radius: 3mm;
            font-size: 10px;
            font-weight: bold;
            color: white;
          }
          
          .priority-normal { background: #10b981; }
          .priority-orta { background: #f59e0b; }
          .priority-yuksek { background: #ef4444; }
          .priority-acil { background: #dc2626; animation: blink 1s infinite; }
          .priority-suresi-gecmis { background: #7c2d12; }
          
          @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0.5; }
          }
          
          .pallet-number {
            position: absolute;
            top: 5mm;
            left: 5mm;
            background: #1e40af;
            color: white;
            padding: 2mm 4mm;
            border-radius: 3mm;
            font-weight: bold;
            font-size: 12px;
          }
          
          .expiration-warning {
            background: #fef3c7;
            border: 1px solid #f59e0b;
            padding: 2mm;
            margin: 3mm 0;
            border-radius: 2mm;
            text-align: center;
            font-weight: bold;
            color: #92400e;
          }
          
          .route-info {
            background: #eff6ff;
            border: 1px solid #3b82f6;
            padding: 3mm;
            margin: 3mm 0;
            border-radius: 2mm;
          }
          
          .route-arrow {
            text-align: center;
            font-size: 16px;
            color: #3b82f6;
            margin: 2mm 0;
          }
          
          @media print {
            .label {
              break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="label-container">
          ${labels.map(label => `
            <div class="label">
              <div class="pallet-number">Palet #${label.palletNumber}</div>
              <div class="priority-badge priority-${label.priority.toLowerCase().replace(' ', '-').replace('ü', 'u').replace('ı', 'i')}">
                ${label.priority}
              </div>
              
              <div class="label-header">
                <div class="company-name">SARIYER LOJİSTİK</div>
                <div class="label-title">PALET ETİKETİ</div>
              </div>
              
              <div class="qr-section">
                <img src="${label.qrCodeImage}" alt="QR Code" class="qr-code">
                <div class="qr-text">${label.palletQRCode}</div>
              </div>
              
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">ÜRÜN ADI:</span>
                  <span class="info-value">${label.productName}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">ÜRETİM NO:</span>
                  <span class="info-value">${label.productionNumber}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">GÖREV ID:</span>
                  <span class="info-value">${label.taskId.substring(0, 8)}...</span>
                </div>
                <div class="info-item">
                  <span class="info-label">ŞÖFÖR:</span>
                  <span class="info-value">${label.driverName}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">TOPLAM PALET:</span>
                  <span class="info-value">${label.palletCount} Adet</span>
                </div>
                <div class="info-item">
                  <span class="info-label">DURUM:</span>
                  <span class="info-value">${label.taskStatus}</span>
                </div>
              </div>
              
              ${label.priority === 'Acil' || label.priority === 'Süresi Geçmiş' ? `
                <div class="expiration-warning">
                  ⚠️ DİKKAT: ${label.priority === 'Süresi Geçmiş' ? 'SÜRESİ GEÇMİŞ' : 'ACİL TESLİMAT'}
                </div>
              ` : ''}
              
              <div class="route-info">
                <div style="font-weight: bold; text-align: center; margin-bottom: 2mm;">ROTA BİLGİSİ</div>
                <div style="text-align: center;">
                  <div style="font-size: 11px; color: #374151;">${label.fromLocation}</div>
                  <div class="route-arrow">↓</div>
                  <div style="font-size: 11px; color: #374151;">${label.toLocation}</div>
                </div>
              </div>
              
              <div class="info-grid" style="margin-top: 5mm; font-size: 10px;">
                <div class="info-item">
                  <span class="info-label">SON KULLANMA:</span>
                  <span class="info-value">${label.expirationDate}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">OLUŞTURMA:</span>
                  <span class="info-value">${label.createdDate}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">BATCH:</span>
                  <span class="info-value">${label.batchInfo}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">ÜRÜN QR:</span>
                  <span class="info-value">${label.productQRCode}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Yazdırma diyaloğunu aç
    setTimeout(() => {
      printWindow.print();
    }, 1000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'teslim_alma_dogrulama':
        return 'bg-yellow-100 text-yellow-800';
      case 'devam_ediyor':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Acil':
        return 'bg-red-100 text-red-800';
      case 'Yüksek':
        return 'bg-orange-100 text-orange-800';
      case 'Orta':
        return 'bg-yellow-100 text-yellow-800';
      case 'Süresi Geçmiş':
        return 'bg-red-200 text-red-900';
      default:
        return 'bg-green-100 text-green-800';
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <Printer className="w-8 h-8 animate-pulse text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Etiket verileri yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Printer className="w-8 h-8 text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-900">Etiket Yazdırma</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Görev Seçimi */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            Aktif Görevler
          </h3>
          
          {tasks.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">Aktif görev bulunmuyor</p>
              <p className="text-sm text-gray-400">Beklemede olan veya devam eden görevler burada görünür</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {tasks.map((task) => {
                const driver = users.find(u => u.id === task.assignedTo);
                const expirationDate = new Date(task.expirationDate);
                const today = new Date();
                const daysUntilExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                
                let priority = 'Normal';
                if (daysUntilExpiration < 0) priority = 'Süresi Geçmiş';
                else if (daysUntilExpiration <= 3) priority = 'Acil';
                else if (daysUntilExpiration <= 7) priority = 'Yüksek';
                else if (daysUntilExpiration <= 14) priority = 'Orta';

                return (
                  <div
                    key={task.id}
                    onClick={() => handleTaskSelect(task)}
                    className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                      selectedTask?.id === task.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-gray-900">{task.productName}</h4>
                      <div className="flex gap-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(task.status)}`}>
                          {task.status === 'teslim_alma_dogrulama' ? 'Beklemede' : 'Devam Ediyor'}
                        </span>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(priority)}`}>
                          {priority}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-2">
                      <div className="flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        <span>ÜN: {task.productionNumber}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        <span>{task.palletQuantity} Palet</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <UserIcon className="w-3 h-3" />
                        <span>{driver?.name || 'Atanmamış'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{expirationDate.toLocaleDateString('tr-TR')}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <MapPin className="w-3 h-3" />
                      <span>{task.from} → {task.to}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Etiket Önizleme */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <QrCode className="w-5 h-5 text-blue-600" />
              Etiket Önizleme
            </h3>
            {labels.length > 0 && (
              <button
                onClick={printLabels}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Printer className="w-4 h-4" />
                Etiketleri Yazdır ({labels.length} adet)
              </button>
            )}
          </div>

          {generatingLabels ? (
            <div className="text-center py-8">
              <QrCode className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
              <p className="text-gray-600">Etiketler oluşturuluyor...</p>
            </div>
          ) : labels.length === 0 ? (
            <div className="text-center py-8">
              <QrCode className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">Etiket önizlemesi için bir görev seçin</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {labels.slice(0, 3).map((label, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-blue-600 text-white px-2 py-1 rounded text-sm font-medium">
                        Palet #{label.palletNumber}
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(label.priority)}`}>
                        {label.priority}
                      </span>
                    </div>
                    <img src={label.qrCodeImage} alt="QR" className="w-12 h-12 border" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Ürün:</span>
                      <span className="ml-1 font-medium">{label.productName}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Üretim No:</span>
                      <span className="ml-1 font-medium">{label.productionNumber}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Son Kullanma:</span>
                      <span className="ml-1 font-medium">{label.expirationDate}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Şöför:</span>
                      <span className="ml-1 font-medium">{label.driverName}</span>
                    </div>
                  </div>
                  
                  <div className="mt-2 text-xs text-gray-500 font-mono">
                    QR: {label.palletQRCode.substring(0, 30)}...
                  </div>
                </div>
              ))}
              
              {labels.length > 3 && (
                <div className="text-center py-2 text-sm text-gray-500">
                  ... ve {labels.length - 3} etiket daha
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Etiket Bilgileri */}
      {selectedTask && (
        <div className="mt-6 bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            Etiket İçeriği Bilgileri
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div className="bg-blue-50 p-3 rounded">
              <h4 className="font-medium text-blue-900 mb-2">Temel Bilgiler</h4>
              <ul className="space-y-1 text-blue-800">
                <li>• Palet QR Kodu</li>
                <li>• Palet Numarası</li>
                <li>• Ürün Adı ve QR Kodu</li>
                <li>• Üretim Numarası</li>
                <li>• Görev ID</li>
              </ul>
            </div>
            
            <div className="bg-green-50 p-3 rounded">
              <h4 className="font-medium text-green-900 mb-2">Tarih ve Zaman</h4>
              <ul className="space-y-1 text-green-800">
                <li>• Son Kullanma Tarihi</li>
                <li>• Görev Oluşturma Tarihi</li>
                <li>• Öncelik Durumu</li>
                <li>• Batch Bilgisi</li>
              </ul>
            </div>
            
            <div className="bg-orange-50 p-3 rounded">
              <h4 className="font-medium text-orange-900 mb-2">Lojistik Bilgiler</h4>
              <ul className="space-y-1 text-orange-800">
                <li>• Atanan Şöför</li>
                <li>• Teslim Alma Noktası</li>
                <li>• Teslim Etme Noktası</li>
                <li>• Görev Durumu</li>
                <li>• Toplam Palet Sayısı</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LabelPrinting;