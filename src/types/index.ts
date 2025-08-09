export interface User {
  id: string;
  email: string;
  role: 'depo' | 'sofor';
  name: string;
  createdAt: Date;
}

export interface Product {
  id: string;
  name: string;
  qrCode: string;
  stock?: number;
  expiryDays?: number; // Son kullanıma kalan gün sayısı
}

export interface PalletStatus {
  code: string; // Paletin QR kodu
  status: 'beklemede' | 'forklift_üstünde' | 'teslim_edildi';
}

export interface Task {
  id:string;
  assignedTo: string;
  createdAt: string;
  expirationDate: string;
  from: string;
  fromQrCode: string;
  palletQRCodes: string[];
  palletQuantity: number;
  productName: string;
  productQrCode: string;
  productionNumber: number;
  status: 'tamamlandı' | 'teslim_alma_dogrulama' | 'devam_ediyor';
  taskType: 'productionToWarehouse' | 'productionToTruck' | 'warehouseToTruck';
  to: string;
  toQrCode: string;
  palletStatuses: PalletStatus[];
  // YENİ EKLENEN ALANLAR
  productId: string;
  toId: string;
  fromId?: string;
  selectedPallets?: any[];
}

export interface Warehouse {
  id: string;
  name: string;
  qrCode: string;
  capacity?: number; // Maksimum palet kapasitesi
  inventory?: {
    [productId: string]: {
      batches: {
        [batchId: string]: {
          expirationDate?: string;
          palletQuantity: number;
          productionNumber: string | number;
        };
      };
      totalPallets: number;
    };
  };
}

export interface ProductionLine {
  id: string;
  name: string;
  qrCode: string;
}

export interface DeliveryPoint {
  id: string;
  name: string;
  qrCode: string;
  // TESLİMAT NOKTALARI İÇİN ENVANTER EKLENDİ
  inventory?: {
    [productId: string]: {
      batches: {
        [batchId: string]: {
          expirationDate?: string;
          palletQuantity: number;
          productionNumber: string | number;
        };
      };
      totalPallets: number;
    };
  };
}

export interface Truck {
  id: string;
  name: string;
  qrCode: string;
  capacity?: number; // Maksimum palet kapasitesi
  currentLoad?: number; // Mevcut yük (palet sayısı)
  inventory?: {
    [productId: string]: {
      batches: {
        [batchId: string]: {
          expirationDate?: string;
          palletQuantity: number;
          productionNumber: string | number;
          taskId: string; // Hangi görevden geldiği
        };
      };
      totalPallets: number;
    };
  };
}
