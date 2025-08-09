import React, { useState, useEffect } from 'react';
import { ref, push, get, set, remove } from 'firebase/database';
import { db } from '../../firebase/config';
import { Product, Warehouse } from '../../types';
import { Plus, Package, Trash2 } from 'lucide-react';

const ProductManagement: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    expiryDays: 30
  });

  useEffect(() => {
    fetchProducts();
    fetchWarehouses();
  }, []);

  const fetchProducts = async () => {
    try {
      const productsRef = ref(db, 'products');
      const snapshot = await get(productsRef);
      
      if (snapshot.exists()) {
        const productsData = snapshot.val();
        const productList = Object.keys(productsData).map(key => ({
          id: key,
          ...productsData[key]
        })) as Product[];
        setProducts(productList);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const warehousesRef = ref(db, 'warehouses');
      const snapshot = await get(warehousesRef);
      
      if (snapshot.exists()) {
        const warehousesData = snapshot.val();
        const warehouseList = Object.keys(warehousesData).map(key => ({
          id: key,
          ...warehousesData[key]
        }));
        setWarehouses(warehouseList);
      }
    } catch (error) {
      console.error('Error fetching warehouses:', error);
    }
  };

  const getProductWarehouseDistribution = (product: Product) => {
    const distribution: { [warehouseName: string]: number } = {};
    
    warehouses.forEach(warehouse => {
      if (warehouse.inventory && warehouse.inventory[product.id]) {
        const pallets = warehouse.inventory[product.id].totalPallets || 0;
        if (pallets > 0) {
          distribution[warehouse.name] = pallets;
        }
      }
    });
    
    return distribution;
  };

  const calculateTotalStock = (product: Product): number => {
    return warehouses.reduce((total, warehouse) => {
      const productInventory = warehouse.inventory?.[product.id];
      return total + (productInventory?.totalPallets || 0);
    }, 0);
  };

  const generateQRCode = (productName: string): string => {
    const cleanName = productName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const timestamp = Date.now().toString(36);
    return `${cleanName}_${timestamp}`;
  };

  const checkProductExists = (productName: string): boolean => {
    return products.some(product => 
      product.name.toLowerCase().trim() === productName.toLowerCase().trim()
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (checkProductExists(formData.name)) {
        alert('Bu ürün adı zaten mevcut. Lütfen farklı bir ad seçin.');
        setLoading(false);
        return;
      }

      const qrCode = generateQRCode(formData.name);
      
      const newProductRef = push(ref(db, 'products'));
      const productData = {
        name: formData.name,
        qrCode: qrCode,
        expiryDays: formData.expiryDays,
      };

      await set(newProductRef, productData);
      
      setFormData({ name: '', expiryDays: 30 });
      setShowForm(false);
      fetchProducts();
      alert('Ürün başarıyla eklendi!');
    } catch (error) {
      console.error('Error adding product:', error);
      alert('Ürün eklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (productId: string, productName: string) => {
    if (window.confirm(`"${productName}" ürününü silmek istediğinizden emin misiniz? Bu işlem, depolardaki ilgili tüm stok kayıtlarını da silebilir.`)) {
      try {
        // Note: This only deletes the product definition, not its inventory in warehouses.
        // A more robust solution would be a cloud function to clean up inventory.
        await remove(ref(db, `products/${productId}`));
        fetchProducts();
        alert('Ürün başarıyla silindi!');
      } catch (error) {
        console.error('Error deleting product:', error);
        alert('Ürün silinirken bir hata oluştu.');
      }
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Ürün Yönetimi</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Yeni Ürün Ekle
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Yeni Ürün Ekle</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ürün Adı *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Örn: Sarıyer Kola"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                Aynı isimde ürün eklenemez.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Son Kullanıma Kalan Gün Sayısı *
              </label>
              <input
                type="number"
                min="1"
                max="3650"
                value={formData.expiryDays}
                onChange={(e) => setFormData({...formData, expiryDays: parseInt(e.target.value) || 30})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Örn: 100"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                Görev oluşturulduğunda bu kadar gün sonrası son kullanma tarihi olarak ayarlanır.
              </p>
            </div>
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-6 py-2 rounded-md transition-colors"
              >
                {loading ? 'Ekleniyor...' : 'Ürün Ekle'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-md transition-colors"
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => {
          const totalStock = calculateTotalStock(product);
          const distribution = getProductWarehouseDistribution(product);

          return (
            <div key={product.id} className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-3 rounded-full">
                    <Package className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{product.name}</h3>
                    <p className="text-sm text-gray-500">Son kullanım: {product.expiryDays || 30} gün</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteProduct(product.id, product.name)}
                  className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full transition-colors"
                  title="Ürünü Sil"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Son Kullanım Süresi:</span>
                  <span className="text-lg font-bold text-blue-600">{product.expiryDays || 30} gün</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Toplam Stok:</span>
                  <span className="text-lg font-bold text-gray-900">{totalStock} palet</span>
                </div>
                
                {Object.keys(distribution).length > 0 ? (
                  <div className="border-t pt-3">
                    <span className="text-sm font-medium text-gray-700 mb-2 block">Depo Dağılımı:</span>
                    <div className="space-y-1">
                      {Object.entries(distribution).map(([warehouseName, pallets]) => (
                        <div key={warehouseName} className="flex justify-between text-sm">
                          <span className="text-gray-600">{warehouseName}:</span>
                          <span className="font-medium">{pallets} palet</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="border-t pt-3">
                    <span className="text-sm text-gray-500">Henüz depoda stok bulunmuyor</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {products.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz ürün yok</h3>
          <p className="text-gray-500">İlk ürününüzü eklemek için yukarıdaki butona tıklayın.</p>
        </div>
      )}
    </div>
  );
};

export default ProductManagement;