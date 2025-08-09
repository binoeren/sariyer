import React, { useEffect, useState } from 'react';
import { ref, get, push, set, remove } from 'firebase/database';
import { db } from '../../firebase/config';
import { Warehouse, Product } from '../../types';
import { Plus, Trash2, Eye, X, Package } from 'lucide-react';
import { generateQRCode } from '../../utils/qrGenerator';

const WarehouseManagement: React.FC = () => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [capacity, setCapacity] = useState<number>(100);
  const [qrImages, setQrImages] = useState<{ [id: string]: string }>({});
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    fetchWarehouses();
    fetchProducts();
  }, []);

  useEffect(() => {
    const fetchQRCodes = async () => {
      const images: { [id: string]: string } = {};
      for (const wh of warehouses) {
        if (wh.qrCode) {
          images[wh.id] = await generateQRCode(wh.qrCode);
        }
      }
      setQrImages(images);
    };
    fetchQRCodes();
  }, [warehouses]);

  const fetchWarehouses = async () => {
    const refWarehouses = ref(db, 'warehouses');
    const snapshot = await get(refWarehouses);
    if (snapshot.exists()) {
      const data = snapshot.val();
      setWarehouses(Object.keys(data).map(key => ({ id: key, ...data[key] })));
    }
  };

  const fetchProducts = async () => {
    const refProducts = ref(db, 'products');
    const snapshot = await get(refProducts);
    if (snapshot.exists()) {
      const data = snapshot.val();
      setProducts(Object.keys(data).map(key => ({ id: key, ...data[key] })));
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !qrCode || !capacity) return;
    const newRef = push(ref(db, 'warehouses'));
    await set(newRef, { name, qrCode, capacity });
    setName('');
    setQrCode('');
    setCapacity(100);
    fetchWarehouses();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Silmek istediğinize emin misiniz?')) {
      await remove(ref(db, `warehouses/${id}`));
      fetchWarehouses();
    }
  };

  const calculateWarehouseStats = (warehouse: Warehouse) => {
    let totalPallets = 0;
    const productBreakdown: { [productId: string]: { name: string; pallets: number } } = {};

    if (warehouse.inventory) {
      Object.keys(warehouse.inventory).forEach(productId => {
        const product = products.find(p => p.id === productId);
        const productName = product?.name || 'Bilinmeyen Ürün';
        const pallets = warehouse.inventory![productId].totalPallets || 0;
        
        totalPallets += pallets;
        productBreakdown[productId] = {
          name: productName,
          pallets
        };
      });
    }

    const capacity = warehouse.capacity || 0;
    const available = capacity - totalPallets;
    const usagePercentage = capacity > 0 ? Math.round((totalPallets / capacity) * 100) : 0;

    return {
      totalPallets,
      capacity,
      available,
      usagePercentage,
      productBreakdown
    };
  };

  const showWarehouseDetail = (warehouse: Warehouse) => {
    setSelectedWarehouse(warehouse);
    setShowDetailModal(true);
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Depo Yönetimi</h2>
      
      <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
        <input
          className="border rounded px-2 py-1"
          placeholder="Depo Adı"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
        <input
          className="border rounded px-2 py-1"
          placeholder="QR Kodu"
          value={qrCode}
          onChange={e => setQrCode(e.target.value)}
          required
        />
        <input
          type="number"
          className="border rounded px-2 py-1"
          placeholder="Kapasite (Palet)"
          value={capacity}
          onChange={e => setCapacity(parseInt(e.target.value) || 0)}
          min="1"
          required
        />
        <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded flex items-center gap-1">
          <Plus className="w-4 h-4" /> Ekle
        </button>
      </form>

      <div className="space-y-4">
        {warehouses.map(wh => {
          const stats = calculateWarehouseStats(wh);
          return (
            <div key={wh.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div>
                    <h3 className="font-semibold text-lg">{wh.name}</h3>
                    <span className="text-xs text-gray-400">({wh.qrCode})</span>
                  </div>
                  {qrImages[wh.id] && (
                    <img src={qrImages[wh.id]} alt="QR" className="w-12 h-12 border" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => showWarehouseDetail(wh)}
                    className="text-blue-600 hover:bg-blue-50 rounded p-1"
                    title="Depo Detayı"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(wh.id)} 
                    className="text-red-600 hover:bg-red-50 rounded p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3">
                <div className="text-center p-2 bg-blue-50 rounded">
                  <div className="text-lg font-bold text-blue-600">{stats.capacity}</div>
                  <div className="text-xs text-gray-600">Toplam Kapasite</div>
                </div>
                <div className="text-center p-2 bg-orange-50 rounded">
                  <div className="text-lg font-bold text-orange-600">{stats.totalPallets}</div>
                  <div className="text-xs text-gray-600">Dolu</div>
                </div>
                <div className="text-center p-2 bg-green-50 rounded">
                  <div className="text-lg font-bold text-green-600">{stats.available}</div>
                  <div className="text-xs text-gray-600">Boş</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded">
                  <div className="text-lg font-bold text-gray-600">%{stats.usagePercentage}</div>
                  <div className="text-xs text-gray-600">Doluluk</div>
                </div>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    stats.usagePercentage >= 90 ? 'bg-red-500' :
                    stats.usagePercentage >= 70 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${stats.usagePercentage}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Depo Detay Modal */}
      {showDetailModal && selectedWarehouse && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {selectedWarehouse.name} - Depo Detayı
              </h3>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const stats = calculateWarehouseStats(selectedWarehouse);
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{stats.capacity}</div>
                      <div className="text-sm text-gray-500">Toplam Kapasite</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">{stats.totalPallets}</div>
                      <div className="text-sm text-gray-500">Dolu</div>
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

                  <div>
                    <h4 className="font-medium mb-2">Ürün Dağılımı:</h4>
                    {Object.keys(stats.productBreakdown).length > 0 ? (
                      <div className="space-y-2">
                        {Object.entries(stats.productBreakdown).map(([productId, data]) => (
                          <div key={productId} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                            <div className="flex items-center gap-3">
                              <Package className="w-5 h-5 text-gray-600" />
                              <span className="font-medium">{data.name}</span>
                            </div>
                            <span className="text-sm text-gray-500">{data.pallets} palet</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">Bu depoda henüz ürün bulunmuyor.</p>
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

export default WarehouseManagement;
