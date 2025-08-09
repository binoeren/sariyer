import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { ref, get } from 'firebase/database';
import { db } from '../firebase/config';
import { Task, Product, User, Warehouse, DeliveryPoint, ProductionLine, Truck } from '../types';

interface ReportData {
  tasks: Task[];
  products: Product[];
  users: User[];
  warehouses: Warehouse[];
  deliveryPoints: DeliveryPoint[];
  productionLines: ProductionLine[];
  trucks: Truck[];
}

interface PalletDetail {
  qrCode: string;
  productName: string;
  productionNumber: number;
  expirationDate: string;
  location: string;
  status: string;
  assignedDriver?: string;
  createdDate: string;
  taskId: string;
}

interface ProductInventoryDetail {
  productName: string;
  warehouseName: string;
  batchId: string;
  productionNumber: string;
  palletQuantity: number;
  expirationDate: string;
  location: string;
}

export class ExcelReportGenerator {
  private data: ReportData;

  constructor(data: ReportData) {
    this.data = data;
  }

  private getDateRange(period: 'daily' | 'weekly' | 'monthly' | 'yearly'): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date();
    const end = new Date();

    switch (period) {
      case 'daily':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'weekly':
        const dayOfWeek = now.getDay();
        start.setDate(now.getDate() - dayOfWeek);
        start.setHours(0, 0, 0, 0);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      case 'monthly':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(start.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'yearly':
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(11, 31);
        end.setHours(23, 59, 59, 999);
        break;
    }

    return { start, end };
  }

  private filterTasksByPeriod(tasks: Task[], period: 'daily' | 'weekly' | 'monthly' | 'yearly'): Task[] {
    const { start, end } = this.getDateRange(period);
    return tasks.filter(task => {
      const taskDate = new Date(task.createdAt);
      return taskDate >= start && taskDate <= end;
    });
  }

  private generateSummarySheet(filteredTasks: Task[], period: string): any[] {
    const totalTasks = filteredTasks.length;
    const completedTasks = filteredTasks.filter(t => t.status === 'tamamlandı').length;
    const ongoingTasks = filteredTasks.filter(t => t.status === 'devam_ediyor').length;
    const pendingTasks = filteredTasks.filter(t => t.status === 'teslim_alma_dogrulama').length;
    const totalPallets = filteredTasks.reduce((sum, task) => sum + task.palletQuantity, 0);
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return [
      ['GENEL ÖZET RAPORU', '', '', ''],
      ['Rapor Dönemi:', period, '', ''],
      ['Rapor Tarihi:', new Date().toLocaleDateString('tr-TR'), '', ''],
      ['', '', '', ''],
      ['GÖREV İSTATİSTİKLERİ', '', '', ''],
      ['Toplam Görev Sayısı:', totalTasks, '', ''],
      ['Tamamlanan Görevler:', completedTasks, '', ''],
      ['Devam Eden Görevler:', ongoingTasks, '', ''],
      ['Bekleyen Görevler:', pendingTasks, '', ''],
      ['Toplam Palet Sayısı:', totalPallets, '', ''],
      ['Başarı Oranı (%):', completionRate, '', ''],
      ['', '', '', ''],
      ['ÜRÜN İSTATİSTİKLERİ', '', '', ''],
      ['Toplam Ürün Çeşidi:', this.data.products.length, '', ''],
      ['Aktif Depo Sayısı:', this.data.warehouses.length, '', ''],
      ['Teslimat Noktası Sayısı:', this.data.deliveryPoints.length, '', ''],
      ['Üretim Hattı Sayısı:', this.data.productionLines.length, '', ''],
      ['Toplam Şöför Sayısı:', this.data.users.filter(u => u.role === 'sofor').length, '', ''],
      ['Toplam Tır Sayısı:', this.data.trucks.length, '', ''],
    ];
  }

  private generateTasksSheet(filteredTasks: Task[]): any[] {
    const headers = [
      'Görev ID',
      'Ürün Adı',
      'Üretim Numarası',
      'Palet Sayısı',
      'Durum',
      'Atanan Şöför',
      'Teslim Alma Noktası',
      'Teslim Etme Noktası',
      'Son Kullanma Tarihi',
      'Oluşturulma Tarihi',
      'Görev Tipi',
      'QR Kodları (İlk 3)'
    ];

    const rows = filteredTasks.map(task => {
      const driver = this.data.users.find(u => u.id === task.assignedTo);
      const statusText = task.status === 'tamamlandı' ? 'Tamamlandı' :
                        task.status === 'devam_ediyor' ? 'Devam Ediyor' : 'Teslim Alma Bekliyor';
      const taskTypeText = task.taskType === 'productionToWarehouse' ? 'Üretimden Depoya' : 'Depodan Teslimat Noktasına';
      const qrCodes = task.palletQRCodes?.slice(0, 3).join(', ') || '';

      return [
        task.id,
        task.productName,
        task.productionNumber,
        task.palletQuantity,
        statusText,
        driver?.name || 'Bilinmiyor',
        task.from,
        task.to,
        new Date(task.expirationDate).toLocaleDateString('tr-TR'),
        new Date(task.createdAt).toLocaleDateString('tr-TR'),
        taskTypeText,
        qrCodes
      ];
    });

    return [headers, ...rows];
  }

  private generateDriverPerformanceSheet(filteredTasks: Task[]): any[] {
    const headers = [
      'Şöför Adı',
      'Email',
      'Toplam Görev',
      'Tamamlanan',
      'Devam Eden',
      'Bekleyen',
      'Toplam Palet',
      'Başarı Oranı (%)',
      'Ortalama Görev Süresi (Gün)',
      'En Son Görev Tarihi'
    ];

    const drivers = this.data.users.filter(u => u.role === 'sofor');
    const rows = drivers.map(driver => {
      const driverTasks = filteredTasks.filter(t => t.assignedTo === driver.id);
      const completedTasks = driverTasks.filter(t => t.status === 'tamamlandı');
      const ongoingTasks = driverTasks.filter(t => t.status === 'devam_ediyor');
      const pendingTasks = driverTasks.filter(t => t.status === 'teslim_alma_dogrulama');
      const totalPallets = driverTasks.reduce((sum, task) => sum + task.palletQuantity, 0);
      const successRate = driverTasks.length > 0 ? Math.round((completedTasks.length / driverTasks.length) * 100) : 0;
      
      // Ortalama görev süresi hesaplama (tamamlanan görevler için)
      const avgDuration = completedTasks.length > 0 ? 
        completedTasks.reduce((sum, task) => {
          const created = new Date(task.createdAt);
          const now = new Date();
          return sum + Math.ceil((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        }, 0) / completedTasks.length : 0;

      const lastTaskDate = driverTasks.length > 0 ? 
        new Date(Math.max(...driverTasks.map(t => new Date(t.createdAt).getTime()))).toLocaleDateString('tr-TR') : 'Yok';

      return [
        driver.name,
        driver.email,
        driverTasks.length,
        completedTasks.length,
        ongoingTasks.length,
        pendingTasks.length,
        totalPallets,
        successRate,
        Math.round(avgDuration),
        lastTaskDate
      ];
    });

    return [headers, ...rows];
  }

  private generateProductStockSheet(): any[] {
    const headers = [
      'Ürün Adı',
      'QR Kodu',
      'Toplam Stok (Palet)',
      'Depo Dağılımı',
      'En Eski Son Kullanma Tarihi',
      'En Yeni Son Kullanma Tarihi',
      'Toplam Batch Sayısı',
      'Ortalama Batch Boyutu'
    ];

    const rows = this.data.products.map(product => {
      let totalStock = 0;
      let warehouseDistribution: string[] = [];
      let expirationDates: Date[] = [];
      let batchCount = 0;
      let totalBatchSize = 0;

      this.data.warehouses.forEach(warehouse => {
        if (warehouse.inventory && warehouse.inventory[product.id]) {
          const productInventory = warehouse.inventory[product.id];
          const pallets = productInventory.totalPallets || 0;
          if (pallets > 0) {
            totalStock += pallets;
            warehouseDistribution.push(`${warehouse.name}: ${pallets}`);
            
            if (productInventory.batches) {
              Object.values(productInventory.batches).forEach(batch => {
                batchCount++;
                totalBatchSize += batch.palletQuantity;
                if (batch.expirationDate) {
                  expirationDates.push(new Date(batch.expirationDate));
                }
              });
            }
          }
        }
      });

      const oldestExpiration = expirationDates.length > 0 ? 
        new Date(Math.min(...expirationDates.map(d => d.getTime()))).toLocaleDateString('tr-TR') : 'Yok';
      const newestExpiration = expirationDates.length > 0 ? 
        new Date(Math.max(...expirationDates.map(d => d.getTime()))).toLocaleDateString('tr-TR') : 'Yok';
      const avgBatchSize = batchCount > 0 ? Math.round(totalBatchSize / batchCount) : 0;

      return [
        product.name,
        product.qrCode,
        totalStock,
        warehouseDistribution.join('; '),
        oldestExpiration,
        newestExpiration,
        batchCount,
        avgBatchSize
      ];
    });

    return [headers, ...rows];
  }

  private generatePalletDetailsSheet(filteredTasks: Task[]): any[] {
    const headers = [
      'Palet QR Kodu',
      'Ürün Adı',
      'Üretim Numarası',
      'Son Kullanma Tarihi',
      'Mevcut Konum',
      'Durum',
      'Atanan Şöför',
      'Oluşturulma Tarihi',
      'Görev ID',
      'Teslim Alma Noktası',
      'Hedef Nokta',
      'Görev Durumu'
    ];

    const palletDetails: any[] = [];

    filteredTasks.forEach(task => {
      const driver = this.data.users.find(u => u.id === task.assignedTo);
      const taskStatusText = task.status === 'tamamlandı' ? 'Tamamlandı' :
                           task.status === 'devam_ediyor' ? 'Devam Ediyor' : 'Teslim Alma Bekliyor';

      task.palletQRCodes?.forEach((qrCode, index) => {
        const palletStatus = task.palletStatuses?.find(ps => ps.code === qrCode);
        const palletStatusText = palletStatus ? 
          (palletStatus.status === 'beklemede' ? 'Beklemede' :
           palletStatus.status === 'forklift_üstünde' ? 'Forklift Üstünde' : 'Teslim Edildi') : 'Bilinmiyor';

        let currentLocation = task.from;
        if (task.status === 'tamamlandı') {
          currentLocation = task.to;
        } else if (task.status === 'devam_ediyor') {
          currentLocation = palletStatus?.status === 'forklift_üstünde' ? 'Forklift Üstünde' : task.from;
        }

        palletDetails.push([
          qrCode,
          task.productName,
          task.productionNumber,
          new Date(task.expirationDate).toLocaleDateString('tr-TR'),
          currentLocation,
          palletStatusText,
          driver?.name || 'Bilinmiyor',
          new Date(task.createdAt).toLocaleDateString('tr-TR'),
          task.id,
          task.from,
          task.to,
          taskStatusText
        ]);
      });
    });

    return [headers, ...palletDetails];
  }

  private generateWarehouseInventorySheet(): any[] {
    const headers = [
      'Depo Adı',
      'QR Kodu',
      'Toplam Kapasite',
      'Kullanılan Kapasite',
      'Boş Kapasite',
      'Doluluk Oranı (%)',
      'Ürün Çeşit Sayısı',
      'Toplam Batch Sayısı',
      'En Eski Ürün Tarihi',
      'En Yeni Ürün Tarihi'
    ];

    const rows = this.data.warehouses.map(warehouse => {
      let totalUsed = 0;
      let productCount = 0;
      let batchCount = 0;
      let expirationDates: Date[] = [];

      if (warehouse.inventory) {
        Object.keys(warehouse.inventory).forEach(productId => {
          const productInventory = warehouse.inventory![productId];
          if (productInventory.totalPallets > 0) {
            productCount++;
            totalUsed += productInventory.totalPallets;
            
            if (productInventory.batches) {
              Object.values(productInventory.batches).forEach(batch => {
                batchCount++;
                if (batch.expirationDate) {
                  expirationDates.push(new Date(batch.expirationDate));
                }
              });
            }
          }
        });
      }

      const capacity = warehouse.capacity || 0;
      const available = capacity - totalUsed;
      const usagePercentage = capacity > 0 ? Math.round((totalUsed / capacity) * 100) : 0;
      
      const oldestProduct = expirationDates.length > 0 ? 
        new Date(Math.min(...expirationDates.map(d => d.getTime()))).toLocaleDateString('tr-TR') : 'Yok';
      const newestProduct = expirationDates.length > 0 ? 
        new Date(Math.max(...expirationDates.map(d => d.getTime()))).toLocaleDateString('tr-TR') : 'Yok';

      return [
        warehouse.name,
        warehouse.qrCode,
        capacity,
        totalUsed,
        available,
        usagePercentage,
        productCount,
        batchCount,
        oldestProduct,
        newestProduct
      ];
    });

    return [headers, ...rows];
  }

  private generateDetailedInventorySheet(): any[] {
    const headers = [
      'Ürün Adı',
      'Depo/Nokta Adı',
      'Batch ID',
      'Üretim Numarası',
      'Palet Sayısı',
      'Son Kullanma Tarihi',
      'Konum Tipi',
      'Gün Kalan',
      'Risk Durumu'
    ];

    const inventoryDetails: any[] = [];

    // Depo envanteri
    this.data.warehouses.forEach(warehouse => {
      if (warehouse.inventory) {
        Object.keys(warehouse.inventory).forEach(productId => {
          const product = this.data.products.find(p => p.id === productId);
          const productInventory = warehouse.inventory![productId];
          
          if (productInventory.batches) {
            Object.entries(productInventory.batches).forEach(([batchId, batch]) => {
              const expirationDate = batch.expirationDate ? new Date(batch.expirationDate) : null;
              const daysRemaining = expirationDate ? 
                Math.ceil((expirationDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
              
              let riskStatus = 'Normal';
              if (daysRemaining !== null) {
                if (daysRemaining < 0) riskStatus = 'Süresi Geçmiş';
                else if (daysRemaining <= 7) riskStatus = 'Kritik';
                else if (daysRemaining <= 30) riskStatus = 'Dikkat';
              }

              inventoryDetails.push([
                product?.name || 'Bilinmeyen Ürün',
                warehouse.name,
                batchId,
                batch.productionNumber,
                batch.palletQuantity,
                expirationDate ? expirationDate.toLocaleDateString('tr-TR') : 'Belirtilmemiş',
                'Depo',
                daysRemaining !== null ? daysRemaining : 'Bilinmiyor',
                riskStatus
              ]);
            });
          }
        });
      }
    });

    // Teslimat noktası envanteri
    this.data.deliveryPoints.forEach(deliveryPoint => {
      if (deliveryPoint.inventory) {
        Object.keys(deliveryPoint.inventory).forEach(productId => {
          const product = this.data.products.find(p => p.id === productId);
          const productInventory = deliveryPoint.inventory![productId];
          
          if (productInventory.batches) {
            Object.entries(productInventory.batches).forEach(([batchId, batch]) => {
              const expirationDate = batch.expirationDate ? new Date(batch.expirationDate) : null;
              const daysRemaining = expirationDate ? 
                Math.ceil((expirationDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
              
              let riskStatus = 'Normal';
              if (daysRemaining !== null) {
                if (daysRemaining < 0) riskStatus = 'Süresi Geçmiş';
                else if (daysRemaining <= 7) riskStatus = 'Kritik';
                else if (daysRemaining <= 30) riskStatus = 'Dikkat';
              }

              inventoryDetails.push([
                product?.name || 'Bilinmeyen Ürün',
                deliveryPoint.name,
                batchId,
                batch.productionNumber,
                batch.palletQuantity,
                expirationDate ? expirationDate.toLocaleDateString('tr-TR') : 'Belirtilmemiş',
                'Teslimat Noktası',
                daysRemaining !== null ? daysRemaining : 'Bilinmiyor',
                riskStatus
              ]);
            });
          }
        });
      }
    });

    return [headers, ...inventoryDetails];
  }

  private generateTruckStatusSheet(): any[] {
    const headers = [
      'Tır Adı',
      'QR Kodu',
      'Toplam Kapasite',
      'Rezerve Palet',
      'Yüklü Palet',
      'Boş Kapasite',
      'Doluluk Oranı (%)',
      'Aktif Görev Sayısı',
      'Ürün Çeşit Sayısı',
      'Durum',
      'Son Görev Tarihi'
    ];

    const rows = this.data.trucks.map(truck => {
      let totalPallets = 0;
      let reservedPallets = 0;
      let loadedPallets = 0;
      let productCount = 0;
      let activeTasks = 0;
      let lastTaskDate = 'Yok';

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
                  // İlgili görevi bul
                  const relatedTask = this.data.tasks.find(t => t.id === batch.taskId);
                  if (relatedTask) {
                    const taskDate = new Date(relatedTask.createdAt).toLocaleDateString('tr-TR');
                    if (lastTaskDate === 'Yok' || new Date(relatedTask.createdAt) > new Date(lastTaskDate)) {
                      lastTaskDate = taskDate;
                    }
                  }
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
      const status = usagePercentage >= 90 ? 'Dolu' : activeTasks > 0 ? 'Aktif Görev Var' : 'Müsait';

      return [truck.name, truck.qrCode, capacity, reservedPallets, loadedPallets, available, usagePercentage, activeTasks, productCount, status, lastTaskDate];
    });

    return [headers, ...rows];
  }

  public async generateReport(period: 'daily' | 'weekly' | 'monthly' | 'yearly'): Promise<void> {
    const filteredTasks = this.filterTasksByPeriod(this.data.tasks, period);
    
    const periodNames = {
      daily: 'Günlük',
      weekly: 'Haftalık',
      monthly: 'Aylık',
      yearly: 'Yıllık'
    };

    const periodName = periodNames[period];
    const fileName = `Lojistik_Raporu_${periodName}_${new Date().toLocaleDateString('tr-TR').replace(/\./g, '_')}.xlsx`;

    // Workbook oluştur
    const wb = XLSX.utils.book_new();

    // Sayfaları oluştur
    const summaryData = this.generateSummarySheet(filteredTasks, periodName);
    const tasksData = this.generateTasksSheet(filteredTasks);
    const driverData = this.generateDriverPerformanceSheet(filteredTasks);
    const productData = this.generateProductStockSheet();
    const palletData = this.generatePalletDetailsSheet(filteredTasks);
    const warehouseData = this.generateWarehouseInventorySheet();
    const inventoryData = this.generateDetailedInventorySheet();
    const truckData = this.generateTruckStatusSheet();

    // Sayfaları workbook'a ekle
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    const tasksWs = XLSX.utils.aoa_to_sheet(tasksData);
    const driverWs = XLSX.utils.aoa_to_sheet(driverData);
    const productWs = XLSX.utils.aoa_to_sheet(productData);
    const palletWs = XLSX.utils.aoa_to_sheet(palletData);
    const warehouseWs = XLSX.utils.aoa_to_sheet(warehouseData);
    const inventoryWs = XLSX.utils.aoa_to_sheet(inventoryData);
    const truckWs = XLSX.utils.aoa_to_sheet(truckData);

    XLSX.utils.book_append_sheet(wb, summaryWs, 'Genel Özet');
    XLSX.utils.book_append_sheet(wb, tasksWs, 'Görevler');
    XLSX.utils.book_append_sheet(wb, driverWs, 'Şöför Performansı');
    XLSX.utils.book_append_sheet(wb, productWs, 'Ürün Stokları');
    XLSX.utils.book_append_sheet(wb, palletWs, 'Palet Detayları');
    XLSX.utils.book_append_sheet(wb, warehouseWs, 'Depo Durumu');
    XLSX.utils.book_append_sheet(wb, inventoryWs, 'Detaylı Envanter');
    XLSX.utils.book_append_sheet(wb, truckWs, 'Tır Durumu');

    // Excel dosyasını oluştur ve indir
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    saveAs(blob, fileName);
  }
}

export const generateExcelReport = async (period: 'daily' | 'weekly' | 'monthly' | 'yearly'): Promise<void> => {
  try {
    // Tüm verileri Firebase'den çek
    const [tasksSnapshot, productsSnapshot, usersSnapshot, warehousesSnapshot, deliveryPointsSnapshot, productionLinesSnapshot, trucksSnapshot] = await Promise.all([
      get(ref(db, 'tasks')),
      get(ref(db, 'products')),
      get(ref(db, 'users')),
      get(ref(db, 'warehouses')),
      get(ref(db, 'deliveryPoints')),
      get(ref(db, 'productionLines')),
      get(ref(db, 'trucks'))
    ]);

    const tasks: Task[] = tasksSnapshot.exists() 
      ? Object.keys(tasksSnapshot.val()).map(key => ({ id: key, ...tasksSnapshot.val()[key] }))
      : [];

    const products: Product[] = productsSnapshot.exists()
      ? Object.keys(productsSnapshot.val()).map(key => ({ id: key, ...productsSnapshot.val()[key] }))
      : [];

    const users: User[] = usersSnapshot.exists()
      ? Object.keys(usersSnapshot.val()).map(key => ({ id: key, ...usersSnapshot.val()[key] }))
      : [];

    const warehouses: Warehouse[] = warehousesSnapshot.exists()
      ? Object.keys(warehousesSnapshot.val()).map(key => ({ id: key, ...warehousesSnapshot.val()[key] }))
      : [];

    const deliveryPoints: DeliveryPoint[] = deliveryPointsSnapshot.exists()
      ? Object.keys(deliveryPointsSnapshot.val()).map(key => ({ id: key, ...deliveryPointsSnapshot.val()[key] }))
      : [];

    const productionLines: ProductionLine[] = productionLinesSnapshot.exists()
      ? Object.keys(productionLinesSnapshot.val()).map(key => ({ id: key, ...productionLinesSnapshot.val()[key] }))
      : [];

    const trucks: Truck[] = trucksSnapshot.exists()
      ? Object.keys(trucksSnapshot.val()).map(key => ({ id: key, ...trucksSnapshot.val()[key] }))
      : [];

    const reportData: ReportData = {
      tasks,
      products,
      users,
      warehouses,
      deliveryPoints,
      productionLines,
      trucks
    };

    const generator = new ExcelReportGenerator(reportData);
    await generator.generateReport(period);
  } catch (error) {
    console.error('Excel raporu oluşturulurken hata:', error);
    throw new Error('Rapor oluşturulamadı. Lütfen tekrar deneyin.');
  }
};