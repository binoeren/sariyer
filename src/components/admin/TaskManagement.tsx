import React, { useState, useEffect } from 'react';
import { ref, push, get, set, update, remove } from 'firebase/database';
import { db } from '../../firebase/config';
import { Product, User, Task, ProductionLine, Warehouse, DeliveryPoint, Truck } from '../../types';
import { Plus, User as UserIcon, Package, Trash2, Eye, X, Pencil } from 'lucide-react';
import { generateQRCode } from '../../utils/qrGenerator';

const TaskManagement: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [productionLines, setProductionLines] = useState<ProductionLine[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [deliveryPoints, setDeliveryPoints] = useState<DeliveryPoint[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPalletModal, setShowPalletModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  
  // State for new task form
  const [formData, setFormData] = useState({
    driverId: '', 
    productId: '', 
    palletCount: 1, 
    fromId: '', 
    toId: '',
    taskType: 'productionToWarehouse' as 'productionToWarehouse' | 'productionToTruck' | 'warehouseToTruck'
  });

  // State for edit task modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});

  const [qrImages, setQrImages] = useState<string[]>([]);
  const [availableSpace, setAvailableSpace] = useState<number | null>(null);
  const [editAvailableSpace, setEditAvailableSpace] = useState<number | null>(null);
  const [availablePallets, setAvailablePallets] = useState<any[]>([]);
  const [truckCurrentLoad, setTruckCurrentLoad] = useState<number>(0);

  useEffect(() => {
    fetchData();
  }, []);

  // Seçilen ürünün son kullanım gün sayısını al
  const getSelectedProductExpiryDays = (productId: string): number => {
    const product = products.find(p => p.id === productId);
    return product?.expiryDays || 30;
  };

  // Son kullanma tarihini hesapla
  const calculateExpirationDate = (productId: string): string => {
    const expiryDays = getSelectedProductExpiryDays(productId);
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + expiryDays);
    return expirationDate.toISOString();
  };

  // Depodan tır görevleri için mevcut paletleri getir
  const getAvailablePalletsFromWarehouses = async (productId: string, requestedCount: number) => {
    const availableBatches: any[] = [];
    
    for (const warehouse of warehouses) {
      if (warehouse.inventory && warehouse.inventory[productId]) {
        const productInventory = warehouse.inventory[productId];
        if (productInventory.batches) {
          Object.entries(productInventory.batches).forEach(([batchId, batch]: [string, any]) => {
            if (batch.palletQuantity > 0 && batch.expirationDate) {
              availableBatches.push({
                warehouseId: warehouse.id,
                warehouseName: warehouse.name,
                batchId,
                productionNumber: batch.productionNumber,
                palletQuantity: batch.palletQuantity,
                expirationDate: new Date(batch.expirationDate),
                expirationDateString: batch.expirationDate
              });
            }
          });
        }
      }
    }

    // Son kullanma tarihine göre sırala (en yakın olanlar önce)
    availableBatches.sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime());

    // İstenen sayıda palet seç
    const selectedPallets: any[] = [];
    let remainingCount = requestedCount;

    for (const batch of availableBatches) {
      if (remainingCount <= 0) break;
      
      const takeFromBatch = Math.min(batch.palletQuantity, remainingCount);
      selectedPallets.push({
        ...batch,
        selectedQuantity: takeFromBatch
      });
      remainingCount -= takeFromBatch;
    }

    return { selectedPallets, totalAvailable: availableBatches.reduce((sum, b) => sum + b.palletQuantity, 0) };
  };

  // Tırın mevcut yükünü hesapla
  const calculateTruckCurrentLoad = (truckId: string): number => {
    const truck = trucks.find(t => t.id === truckId);
    if (!truck || !truck.inventory) return 0;
    
    return Object.values(truck.inventory).reduce((total, productInventory) => {
      return total + (productInventory.totalPallets || 0);
    }, 0);
  };

  // Effect for new task form capacity validation
  useEffect(() => {
    const handleCapacityCheck = async () => {
      if (formData.taskType === 'productionToWarehouse') {
        if (!formData.toId) {
          setAvailableSpace(null);
          return;
        }
        const selectedWarehouse = warehouses.find(w => w.id === formData.toId);
        if (selectedWarehouse) {
          const space = calculateAvailableSpace(selectedWarehouse);
          setAvailableSpace(space);
          if (formData.palletCount > space) {
            setFormData(prev => ({ ...prev, palletCount: 1 }));
          }
        } else {
          setAvailableSpace(null);
        }
      } else if (formData.taskType === 'productionToTruck' || formData.taskType === 'warehouseToTruck') {
        if (!formData.toId) {
          setAvailableSpace(null);
          setTruckCurrentLoad(0);
          return;
        }
        const selectedTruck = trucks.find(t => t.id === formData.toId);
        if (selectedTruck) {
          const capacity = selectedTruck.capacity || 0;
          const currentLoad = calculateTruckCurrentLoad(selectedTruck.id);
          const availableCapacity = capacity - currentLoad;
          
          setAvailableSpace(availableCapacity);
          setTruckCurrentLoad(currentLoad);
          
          if (formData.palletCount > availableCapacity) {
            setFormData(prev => ({ ...prev, palletCount: 1 }));
          }
        } else {
          setAvailableSpace(null);
          setTruckCurrentLoad(0);
        }
      } else {
        setAvailableSpace(null);
        setTruckCurrentLoad(0);
      }

      // Depodan tır görevleri için mevcut paletleri kontrol et
      if (formData.taskType === 'warehouseToTruck' && formData.productId && formData.palletCount > 0) {
        const { selectedPallets, totalAvailable } = await getAvailablePalletsFromWarehouses(formData.productId, formData.palletCount);
        setAvailablePallets(selectedPallets);
        
        if (formData.palletCount > totalAvailable) {
          setFormData(prev => ({ ...prev, palletCount: Math.min(totalAvailable, 1) }));
        }
      }
    };

    handleCapacityCheck();
  }, [formData.toId, formData.taskType, formData.productId, formData.palletCount, warehouses, trucks]);

  // Effect for edit task form capacity validation
  useEffect(() => {
    if (!editFormData.toId) {
      setEditAvailableSpace(null);
      return;
    }
    const selectedWarehouse = warehouses.find(w => w.id === editFormData.toId);
    if (selectedWarehouse) {
      // When editing, available space should also consider the pallets from the task being edited
      const originalTaskPallets = (editingTask && editingTask.toId === editFormData.toId) ? editingTask.palletQuantity : 0;
      const space = calculateAvailableSpace(selectedWarehouse) + originalTaskPallets;
      setEditAvailableSpace(space);
    } else {
      setEditAvailableSpace(null);
    }
  }, [editFormData.toId, warehouses, editingTask]);

  const calculateAvailableSpace = (warehouse: Warehouse): number => {
    const warehouseCapacity = warehouse.capacity || 0;
    let currentPallets = 0;
    if (warehouse.inventory) {
      Object.values(warehouse.inventory).forEach((inv: any) => {
        currentPallets += inv.totalPallets || 0;
      });
    }
    return Math.max(0, warehouseCapacity - currentPallets);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchProducts(),
        fetchDrivers(),
        fetchTasks(),
        fetchProductionLines(),
        fetchWarehouses(),
        fetchDeliveryPoints(),
        fetchTrucks()
      ]);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  async function fetchGenericData<T>(
    path: string,
    setter: React.Dispatch<React.SetStateAction<T[]>>
  ): Promise<void> {
    try {
      const dataRef = ref(db, path);
      const snapshot = await get(dataRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        setter(Object.keys(data).map(key => ({ id: key, ...data[key] } as T)));
      } else {
        setter([]);
      }
    } catch (error) {
      console.error(`Error fetching ${path}:`, error);
    }
  }

  const fetchProducts = () => fetchGenericData<Product>('products', setProducts);
  const fetchTasks = async () => {
     const tasksRef = ref(db, 'tasks');
      const snapshot = await get(tasksRef);
      if (snapshot.exists()) {
        const tasksData = snapshot.val();
        const taskList = Object.keys(tasksData).map(key => ({ id: key, ...tasksData[key] })) as Task[];
        setTasks(taskList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      } else {
        setTasks([]);
      }
  };
  const fetchProductionLines = () => fetchGenericData<ProductionLine>('productionLines', setProductionLines);
  const fetchWarehouses = () => fetchGenericData<Warehouse>('warehouses', setWarehouses);
  const fetchDeliveryPoints = () => fetchGenericData<DeliveryPoint>('deliveryPoints', setDeliveryPoints);
  const fetchTrucks = () => fetchGenericData<Truck>('trucks', setTrucks);
  const fetchDrivers = async () => {
    const usersRef = ref(db, 'users');
    const snapshot = await get(usersRef);
    if (snapshot.exists()) {
      const usersData = snapshot.val();
      const driverList = Object.keys(usersData)
        .map(key => ({ id: key, ...usersData[key] }))
        .filter((user: User) => user.role === 'sofor') as User[];
      setDrivers(driverList);
    }
  };

  const getNextProductionNumber = async (): Promise<number> => {
    const settingsRef = ref(db, 'settings/lastProductionNumber');
    const snapshot = await get(settingsRef);
    const nextNumber = (snapshot.val() || 0) + 1;
    await set(settingsRef, nextNumber);
    return nextNumber;
  };

  const generatePalletQRCodes = (productQrCode: string, productionNumber: number, palletCount: number, to: string): string[] => {
    return Array.from({ length: palletCount }, (_, i) => {
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substr(2, 9);
      return `${productQrCode}_${productionNumber}_${i + 1}_${to}_${timestamp}_${randomId}`;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const selectedDriver = drivers.find(d => d.id === formData.driverId);
      const selectedProduct = products.find(p => p.id === formData.productId);
      
      if (!selectedDriver || !selectedProduct) {
        throw new Error('Lütfen tüm alanları doğru şekilde doldurun.');
      }

      let selectedFrom: any = null;
      let selectedTo: any = null;
      let taskType = formData.taskType;

      // Görev türüne göre kaynak ve hedef belirleme
      if (formData.taskType === 'productionToWarehouse') {
        selectedFrom = productionLines.find(p => p.id === formData.fromId);
        selectedTo = warehouses.find(w => w.id === formData.toId);
        
        if (availableSpace !== null && formData.palletCount > availableSpace) {
          throw new Error(`Bu depoda sadece ${availableSpace} palet için yer var.`);
        }
      } else if (formData.taskType === 'productionToTruck') {
        selectedFrom = productionLines.find(p => p.id === formData.fromId);
        selectedTo = trucks.find(t => t.id === formData.toId);
        
        if (availableSpace !== null && formData.palletCount > availableSpace) {
          throw new Error(`Bu tırda sadece ${availableSpace} palet için yer var. (Mevcut yük: ${truckCurrentLoad}/${selectedTo?.capacity || 0})`);
        }
      } else if (formData.taskType === 'warehouseToTruck') {
        // Depodan tır için kaynak otomatik belirlenir
        selectedTo = trucks.find(t => t.id === formData.toId);
        
        if (availableSpace !== null && formData.palletCount > availableSpace) {
          throw new Error(`Bu tırda sadece ${availableSpace} palet için yer var. (Mevcut yük: ${truckCurrentLoad}/${selectedTo?.capacity || 0})`);
        }
        
        if (availablePallets.length === 0) {
          throw new Error('Bu ürün için depoda yeterli palet bulunmuyor.');
        }
        
        const totalSelected = availablePallets.reduce((sum, p) => sum + p.selectedQuantity, 0);
        if (totalSelected < formData.palletCount) {
          throw new Error(`Bu ürün için depoda sadece ${totalSelected} palet mevcut.`);
        }
      }

      if (!selectedTo) {
        throw new Error('Hedef nokta bulunamadı.');
      }

      const expirationDate = calculateExpirationDate(formData.productId);
      const productionNumber = await getNextProductionNumber();
      
      let palletQRCodes: string[] = [];
      let fromName = '';
      let fromQrCode = '';

      if (formData.taskType === 'warehouseToTruck') {
        // Depodan tır için özel QR kod üretimi
        palletQRCodes = [];
        let palletIndex = 1;
        
        for (const batch of availablePallets) {
          for (let i = 0; i < batch.selectedQuantity; i++) {
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substr(2, 9);
            palletQRCodes.push(`${selectedProduct.qrCode}_${batch.productionNumber}_${palletIndex}_${selectedTo.name}_${timestamp}_${randomId}`);
            palletIndex++;
          }
        }
        
        fromName = 'Depo (Otomatik)';
        fromQrCode = 'AUTO_WAREHOUSE';
      } else {
        palletQRCodes = generatePalletQRCodes(selectedProduct.qrCode, productionNumber, formData.palletCount, selectedTo.name);
        fromName = selectedFrom?.name || '';
        fromQrCode = selectedFrom?.qrCode || '';
      }
      
      const taskData = {
        assignedTo: formData.driverId,
        createdAt: new Date().toISOString(),
        expirationDate: expirationDate,
        from: fromName,
        fromQrCode: fromQrCode,
        palletQRCodes,
        palletQuantity: formData.palletCount,
        productName: selectedProduct.name,
        productQrCode: selectedProduct.qrCode,
        productionNumber,
        status: 'teslim_alma_dogrulama',
        taskType: taskType,
        to: selectedTo.name,
        toQrCode: selectedTo.qrCode,
        palletStatuses: palletQRCodes.map(code => ({ code, status: 'beklemede' })),
        productId: formData.productId,
        toId: formData.toId,
        fromId: formData.fromId || null,
        selectedPallets: formData.taskType === 'warehouseToTruck' ? availablePallets : null
      };

      await set(push(ref(db, 'tasks')), taskData);

      // Depodan tır görevleri için stok düşürme
      if (formData.taskType === 'warehouseToTruck') {
        const updates: { [key: string]: any } = {};
        
        for (const batch of availablePallets) {
          const newQuantity = batch.palletQuantity - batch.selectedQuantity;
          const inventoryPath = `warehouses/${batch.warehouseId}/inventory/${formData.productId}`;
          
          if (newQuantity > 0) {
            updates[`${inventoryPath}/batches/${batch.batchId}/palletQuantity`] = newQuantity;
          } else {
            updates[`${inventoryPath}/batches/${batch.batchId}`] = null;
          }
          
          // Toplam palet sayısını güncelle
          const warehouseRef = ref(db, `${inventoryPath}/totalPallets`);
          const currentTotalSnapshot = await get(warehouseRef);
          const currentTotal = currentTotalSnapshot.val() || 0;
          updates[`${inventoryPath}/totalPallets`] = Math.max(0, currentTotal - batch.selectedQuantity);
        }
        
        await update(ref(db), updates);
      }

      // Tır görevleri için tır envanterini güncelle (sadece rezervasyon)
      if (formData.taskType === 'productionToTruck' || formData.taskType === 'warehouseToTruck') {
        const truckInventoryPath = `trucks/${formData.toId}/inventory/${formData.productId}`;
        const batchId = `task_${Date.now()}`;
        
        const updates: { [key: string]: any } = {};
        
        // Tır envanterine rezervasyon ekle
        const truckInventoryRef = ref(db, truckInventoryPath);
        const truckInvSnapshot = await get(truckInventoryRef);
        const currentTruckInv = truckInvSnapshot.val() || { batches: {}, totalPallets: 0 };
        
        updates[`${truckInventoryPath}/batches/${batchId}`] = {
          palletQuantity: formData.palletCount,
          expirationDate: expirationDate,
          productionNumber: productionNumber,
          taskId: taskData.id || 'unknown',
          status: 'reserved' // Rezerve edilmiş
        };
        updates[`${truckInventoryPath}/totalPallets`] = (currentTruckInv.totalPallets || 0) + formData.palletCount;
        
        await update(ref(db), updates);
      }

      setFormData({ driverId: '', productId: '', palletCount: 1, fromId: '', toId: '', taskType: 'productionToWarehouse' });
      setShowForm(false);
      setAvailablePallets([]);
      fetchData();
      alert('Görev başarıyla oluşturuldu!');
    } catch (error: any) {
      console.error('Error creating task:', error);
      alert(`Görev oluşturulurken bir hata oluştu: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    const fromLocation = productionLines.find(pl => pl.name === task.from);
    setEditFormData({
      ...task,
      fromId: fromLocation?.id || ''
    });
    setShowEditModal(true);
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    setLoading(true);

    try {
        const updates: { [key: string]: any } = {};
        const originalTask = editingTask;
        
        const selectedDriver = drivers.find(d => d.id === editFormData.assignedTo);
        const selectedProduct = products.find(p => p.id === editFormData.productId);
        const selectedFrom = productionLines.find(p => p.id === editFormData.fromId);
        const selectedTo = warehouses.find(w => w.id === editFormData.toId) || deliveryPoints.find(d => d.id === editFormData.toId);

        if (!selectedDriver || !selectedProduct || !selectedFrom || !selectedTo) {
            throw new Error("Düzenlenen görev için tüm alanlar doldurulmalıdır.");
        }

        if (editAvailableSpace !== null && editFormData.palletQuantity > editAvailableSpace) {
            throw new Error(`Yeni hedef depoda sadece ${editAvailableSpace} palet için yer var.`);
        }

        // If task was completed, we need to revert the original inventory change and apply the new one.
        if (originalTask.status === 'tamamlandı') {
            // 1. Revert original inventory
            const originalDestinationIsWarehouse = warehouses.some(w => w.id === originalTask.toId);
            const originalDestinationPath = originalDestinationIsWarehouse ? `warehouses/${originalTask.toId}` : `deliveryPoints/${originalTask.toId}`;
            const originalInventoryRef = ref(db, `${originalDestinationPath}/inventory/${originalTask.productId}`);
            const originalInvSnapshot = await get(originalInventoryRef);
            if (originalInvSnapshot.exists()) {
                const inv = originalInvSnapshot.val();
                const batchId = String(originalTask.productionNumber);
                const newTotal = Math.max(0, (inv.totalPallets || 0) - originalTask.palletQuantity);
                updates[`${originalDestinationPath}/inventory/${originalTask.productId}/totalPallets`] = newTotal;
                if (inv.batches && inv.batches[batchId]) {
                    const newBatchQty = Math.max(0, inv.batches[batchId].palletQuantity - originalTask.palletQuantity);
                    if (newBatchQty === 0) {
                        updates[`${originalDestinationPath}/inventory/${originalTask.productId}/batches/${batchId}`] = null;
                    } else {
                        updates[`${originalDestinationPath}/inventory/${originalTask.productId}/batches/${batchId}/palletQuantity`] = newBatchQty;
                    }
                }
            }

            // 2. Apply new inventory change
            const newDestinationIsWarehouse = warehouses.some(w => w.id === editFormData.toId);
            const newDestinationPath = newDestinationIsWarehouse ? `warehouses/${editFormData.toId}` : `deliveryPoints/${editFormData.toId}`;
            const newInventoryRef = ref(db, `${newDestinationPath}/inventory/${editFormData.productId}`);
            const newInvSnapshot = await get(newInventoryRef);
            const newInv = newInvSnapshot.val() || { batches: {}, totalPallets: 0 };
            const newBatchId = String(editFormData.productionNumber);
            const existingBatchQty = newInv.batches?.[newBatchId]?.palletQuantity || 0;

            updates[`${newDestinationPath}/inventory/${editFormData.productId}/batches/${newBatchId}`] = {
                palletQuantity: existingBatchQty + editFormData.palletQuantity,
                expirationDate: editFormData.expirationDate,
                productionNumber: editFormData.productionNumber,
            };
            updates[`${newDestinationPath}/inventory/${editFormData.productId}/totalPallets`] = (newInv.totalPallets || 0) + editFormData.palletQuantity;
        }

        // 3. Update the task itself
        const updatedTaskData = {
            ...originalTask,
            ...editFormData,
            productName: selectedProduct.name,
            productQrCode: selectedProduct.qrCode,
            from: selectedFrom.name,
            fromQrCode: selectedFrom.qrCode,
            to: selectedTo.name,
            toQrCode: selectedTo.qrCode,
        };
        updates[`tasks/${originalTask.id}`] = updatedTaskData;

        await update(ref(db), updates);
        
        setShowEditModal(false);
        setEditingTask(null);
        fetchData();
        alert('Görev başarıyla güncellendi!');

    } catch (error: any) {
        console.error('Error updating task:', error);
        alert(`Görev güncellenirken bir hata oluştu: ${error.message}`);
    } finally {
        setLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: string, taskName: string) => {
    if (!window.confirm(`"${taskName}" görevini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) return;
    try {
      const taskRef = ref(db, `tasks/${taskId}`);
      const taskSnapshot = await get(taskRef);
      if (!taskSnapshot.exists()) throw new Error("Silinecek görev bulunamadı.");
      
      const task = taskSnapshot.val() as Task;
      const updates: { [key: string]: any } = { [`tasks/${taskId}`]: null };

      if (task.status === 'tamamlandı') {
        const destinationIsWarehouse = warehouses.some(w => w.id === task.toId);
        const destinationPath = destinationIsWarehouse ? `warehouses/${task.toId}` : `deliveryPoints/${task.toId}`;
        const inventoryProductRef = ref(db, `${destinationPath}/inventory/${task.productId}`);
        const inventorySnapshot = await get(inventoryProductRef);

        if (inventorySnapshot.exists()) {
          const currentInventory = inventorySnapshot.val();
          const batchId = String(task.productionNumber);
          if (currentInventory.batches?.[batchId]) {
            const newBatchQuantity = currentInventory.batches[batchId].palletQuantity - task.palletQuantity;
            if (newBatchQuantity > 0) {
              updates[`${destinationPath}/inventory/${task.productId}/batches/${batchId}/palletQuantity`] = newBatchQuantity;
            } else {
              updates[`${destinationPath}/inventory/${task.productId}/batches/${batchId}`] = null;
            }
          }
          const newTotalPallets = (currentInventory.totalPallets || 0) - task.palletQuantity;
          updates[`${destinationPath}/inventory/${task.productId}/totalPallets`] = Math.max(0, newTotalPallets);
        }
      }
      
      // Tır görevleri için tır envanterini temizle
      if (task.taskType === 'productionToTruck' || task.taskType === 'warehouseToTruck') {
        const truckInventoryPath = `trucks/${task.toId}/inventory/${task.productId}`;
        const truckInventoryRef = ref(db, truckInventoryPath);
        const truckInvSnapshot = await get(truckInventoryRef);
        
        if (truckInvSnapshot.exists()) {
          const truckInventory = truckInvSnapshot.val();
          if (truckInventory.batches) {
            // Bu görevle ilgili batch'leri bul ve sil
            Object.keys(truckInventory.batches).forEach(batchId => {
              const batch = truckInventory.batches[batchId];
              if (batch.taskId === taskId) {
                updates[`${truckInventoryPath}/batches/${batchId}`] = null;
                // Toplam palet sayısını güncelle
                const currentTotal = truckInventory.totalPallets || 0;
                updates[`${truckInventoryPath}/totalPallets`] = Math.max(0, currentTotal - batch.palletQuantity);
              }
            });
          }
        }
      }
      
      await update(ref(db), updates);
      fetchData();
      alert('Görev ve ilgili stok kaydı başarıyla silindi!');
    } catch (error: any) {
      console.error('Error deleting task:', error);
      alert(`Görev silinirken bir hata oluştu: ${error.message}`);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return alert('Görev bulunamadı!');

    try {
      if (newStatus !== 'tamamlandı') {
        await update(ref(db, `tasks/${taskId}`), { status: newStatus });
        fetchTasks();
        alert('Görev durumu güncellendi!');
        return;
      }

      // Görev tamamlandığında stok işlemleri
      if (task.taskType === 'productionToWarehouse') {
        // Üretimden depoya - stok artır
        const { productId, toId, productionNumber, palletQuantity, expirationDate } = task;
        const destinationIsWarehouse = warehouses.some(w => w.id === toId);
        if (!destinationIsWarehouse && !deliveryPoints.some(dp => dp.id === toId)) {
          throw new Error('Teslimat noktası bulunamadı!');
        }

        const destinationPath = destinationIsWarehouse ? `warehouses/${toId}` : `deliveryPoints/${toId}`;
        const inventoryRef = ref(db, `${destinationPath}/inventory/${productId}`);
        const inventorySnapshot = await get(inventoryRef);
        const currentInventory = inventorySnapshot.val() || { batches: {}, totalPallets: 0 };
        const batchId = String(productionNumber);
        const existingBatchQuantity = currentInventory.batches?.[batchId]?.palletQuantity || 0;

        const updates: { [key: string]: any } = {};
        updates[`tasks/${taskId}/status`] = 'tamamlandı';
        updates[`${destinationPath}/inventory/${productId}/batches/${batchId}`] = {
          palletQuantity: existingBatchQuantity + palletQuantity,
          expirationDate,
          productionNumber,
        };
        updates[`${destinationPath}/inventory/${productId}/totalPallets`] = (currentInventory.totalPallets || 0) + palletQuantity;

        await update(ref(db), updates);
      } else if (task.taskType === 'productionToTruck' || task.taskType === 'warehouseToTruck') {
        // Tır görevleri için tır envanterini güncelle (rezervasyondan gerçek yüke çevir)
        const updates: { [key: string]: any } = {};
        updates[`tasks/${taskId}/status`] = 'tamamlandı';
        
        // Tır envanterindeki rezervasyonu gerçek yüke çevir
        const truckInventoryPath = `trucks/${task.toId}/inventory/${task.productId}`;
        const truckInventoryRef = ref(db, truckInventoryPath);
        const truckInvSnapshot = await get(truckInventoryRef);
        
        if (truckInvSnapshot.exists()) {
          const truckInventory = truckInvSnapshot.val();
          if (truckInventory.batches) {
            // Bu görevle ilgili batch'i bul ve durumunu güncelle
            Object.keys(truckInventory.batches).forEach(batchId => {
              const batch = truckInventory.batches[batchId];
              if (batch.taskId === taskId && batch.status === 'reserved') {
                updates[`${truckInventoryPath}/batches/${batchId}/status`] = 'loaded';
              }
            });
          }
        }
        
        await update(ref(db), updates);
      } else {
        // Tır görevleri için sadece durumu güncelle (stok işlemi yok)
        await update(ref(db, `tasks/${taskId}`), { status: 'tamamlandı' });
      }

      fetchData();
      alert('Görev tamamlandı!');
    } catch (error: any) {
      console.error('Error completing task:', error);
      alert(`Görev tamamlanırken bir hata oluştu: ${error.message}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'teslim_alma_dogrulama': return 'bg-yellow-100 text-yellow-800';
      case 'devam_ediyor': return 'bg-blue-100 text-blue-800';
      case 'tamamlandı': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTaskTypeText = (taskType: string) => {
    switch (taskType) {
      case 'productionToWarehouse': return 'Üretimden Depoya';
      case 'productionToTruck': return 'Üretimden Tıra';
      case 'warehouseToTruck': return 'Depodan Tıra';
      default: return 'Bilinmiyor';
    }
  };

  useEffect(() => {
    const fetchQRCodes = async () => {
      if (showPalletModal && selectedTask?.palletQRCodes) {
        const images = await Promise.all(selectedTask.palletQRCodes.map(qr => generateQRCode(qr)));
        setQrImages(images);
      } else {
        setQrImages([]);
      }
    };
    fetchQRCodes();
  }, [showPalletModal, selectedTask]);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Görev Atama</h2>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Yeni Görev Ata
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Yeni Görev Ata</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Görev Türü *</label>
                <select 
                  value={formData.taskType} 
                  onChange={(e) => setFormData({...formData, taskType: e.target.value as any, fromId: '', toId: '', palletCount: 1})} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                  required
                >
                  <option value="productionToWarehouse">Üretimden Depoya</option>
                  <option value="productionToTruck">Üretimden Tıra</option>
                  <option value="warehouseToTruck">Depodan Tıra</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Şöför Seç *</label>
                <select value={formData.driverId} onChange={(e) => setFormData({...formData, driverId: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                  <option value="">Şöför seçin...</option>
                  {drivers.map((driver) => (<option key={driver.id} value={driver.id}>{driver.name} ({driver.email})</option>))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ürün Seç *</label>
                <select value={formData.productId} onChange={(e) => setFormData({...formData, productId: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                  <option value="">Ürün seçin...</option>
                  {products.map((product) => (<option key={product.id} value={product.id}>{product.name}</option>))}
                </select>
              </div>

              {formData.taskType !== 'warehouseToTruck' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Teslim Alma Noktası *</label>
                  <select value={formData.fromId} onChange={(e) => setFormData({...formData, fromId: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                    <option value="">Teslim alma noktası seçin...</option>
                    {productionLines.map((line) => (<option key={line.id} value={line.id}>{line.name}</option>))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {formData.taskType === 'productionToWarehouse' ? 'Teslim Etme Noktası (Depo) *' :
                   formData.taskType === 'productionToTruck' ? 'Teslim Etme Noktası (Tır) *' :
                   'Teslim Etme Noktası (Tır) *'}
                </label>
                <select value={formData.toId} onChange={(e) => setFormData({...formData, toId: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                  <option value="">
                    {formData.taskType === 'productionToWarehouse' ? 'Depo seçin...' : 'Tır seçin...'}
                  </option>
                  {formData.taskType === 'productionToWarehouse' ? (
                    warehouses.map((warehouse) => (<option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>))
                  ) : (
                    trucks.map((truck) => (<option key={truck.id} value={truck.id}>{truck.name}</option>))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Palet Sayısı *</label>
                <input 
                  type="number" 
                  min="1" 
                  max={availableSpace !== null ? availableSpace : undefined} 
                  value={formData.palletCount} 
                  onChange={(e) => setFormData({ ...formData, palletCount: parseInt(e.target.value) || 1 })} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100" 
                  required 
                  disabled={availableSpace === 0} 
                />
                {availableSpace !== null && availableSpace > 0 && (
                  <p className="text-sm text-gray-500 mt-1">
                    {formData.taskType === 'productionToWarehouse' ? `Seçili depoda maksimum ${availableSpace} palet için yer var.` :
                     formData.taskType === 'warehouseToTruck' ? `Bu ürün için depoda toplam ${availableSpace} palet mevcut.` :
                     `Seçili tırda ${availableSpace} palet için yer var. (Mevcut: ${truckCurrentLoad}/${trucks.find(t => t.id === formData.toId)?.capacity || 0})`}
                  </p>
                )}
                {availableSpace === 0 && (
                  <p className="text-sm text-red-500 mt-1">
                    {formData.taskType === 'productionToWarehouse' ? 'Seçili depo dolu, yeni palet eklenemez.' :
                     formData.taskType === 'warehouseToTruck' ? 'Bu ürün için depoda palet bulunmuyor.' :
                     `Seçili tır dolu, yeni palet eklenemez. (${truckCurrentLoad}/${trucks.find(t => t.id === formData.toId)?.capacity || 0})`}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Son Kullanım Bilgisi</label>
                <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600">
                  {formData.productId ? (
                    <>
                      <div className="text-sm">
                        <strong>{products.find(p => p.id === formData.productId)?.name}</strong> ürünü için:
                      </div>
                      <div className="text-sm mt-1">
                        Son kullanım süresi: <strong>{getSelectedProductExpiryDays(formData.productId)} gün</strong>
                      </div>
                      <div className="text-sm mt-1">
                        Son kullanma tarihi: <strong>{new Date(calculateExpirationDate(formData.productId)).toLocaleDateString('tr-TR')}</strong>
                      </div>
                    </>
                  ) : (
                    <span className="text-sm">Önce ürün seçin</span>
                  )}
                </div>
              </div>
            </div>

            {/* Depodan tır görevleri için seçilen paletlerin detayı */}
            {formData.taskType === 'warehouseToTruck' && availablePallets.length > 0 && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Seçilen Paletler (Son kullanma tarihine göre sıralı):</h4>
                <div className="space-y-2">
                  {availablePallets.map((batch, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                      <span className="text-blue-800">
                        {batch.warehouseName} - Üretim No: {batch.productionNumber}
                      </span>
                      <span className="text-blue-600">
                        {batch.selectedQuantity} palet - SKT: {batch.expirationDate.toLocaleDateString('tr-TR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <button type="submit" disabled={loading || availableSpace === 0} className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-6 py-2 rounded-md transition-colors">{loading ? 'Oluşturuluyor...' : 'Görev Oluştur'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-md transition-colors">İptal</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Task Modal */}
      {showEditModal && editingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Görevi Düzenle - {editingTask.productName}</h3>
              <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleUpdateTask} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Şöför</label>
                  <select value={editFormData.assignedTo} onChange={(e) => setEditFormData({...editFormData, assignedTo: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md" required>
                    {drivers.map((driver) => (<option key={driver.id} value={driver.id}>{driver.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ürün</label>
                  <select value={editFormData.productId} onChange={(e) => setEditFormData({...editFormData, productId: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md" required>
                    {products.map((product) => (<option key={product.id} value={product.id}>{product.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Son Kullanım Bilgisi</label>
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600">
                    {editFormData.productId ? (
                      <>
                        <div className="text-sm">
                          <strong>{products.find(p => p.id === editFormData.productId)?.name}</strong> ürünü için:
                        </div>
                        <div className="text-sm mt-1">
                          Son kullanım süresi: <strong>{getSelectedProductExpiryDays(editFormData.productId)} gün</strong>
                        </div>
                        <div className="text-sm mt-1">
                          Mevcut son kullanma: <strong>{new Date(editFormData.expirationDate).toLocaleDateString('tr-TR')}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditFormData({...editFormData, expirationDate: calculateExpirationDate(editFormData.productId)})}
                          className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded mt-1 hover:bg-blue-200"
                        >
                          Yeniden Hesapla
                        </button>
                      </>
                    ) : (
                      <span className="text-sm">Önce ürün seçin</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Teslim Alma Noktası</label>
                  <select value={editFormData.fromId} onChange={(e) => setEditFormData({...editFormData, fromId: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md" required>
                    {productionLines.map((line) => (<option key={line.id} value={line.id}>{line.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Teslim Etme Noktası</label>
                  <select value={editFormData.toId} onChange={(e) => setEditFormData({...editFormData, toId: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-md" required>
                    <optgroup label="Depolar">{warehouses.map((wh) => (<option key={wh.id} value={wh.id}>{wh.name}</option>))}</optgroup>
                    <optgroup label="Teslim Noktaları">{deliveryPoints.map((dp) => (<option key={dp.id} value={dp.id}>{dp.name}</option>))}</optgroup>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Palet Sayısı</label>
                  <input type="number" min="1" max={editAvailableSpace !== null ? editAvailableSpace : undefined} value={editFormData.palletQuantity} onChange={(e) => setEditFormData({...editFormData, palletQuantity: parseInt(e.target.value) || 1})} className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100" required disabled={editAvailableSpace === 0} />
                  {editAvailableSpace !== null && editAvailableSpace > 0 && (<p className="text-sm text-gray-500 mt-1">Seçili depoda maksimum {editAvailableSpace} palet için yer var.</p>)}
                  {editAvailableSpace === 0 && (<p className="text-sm text-red-500 mt-1">Seçili depo dolu.</p>)}
                </div>
              </div>
              <div className="flex gap-4">
                <button type="submit" disabled={loading || editAvailableSpace === 0} className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-6 py-2 rounded-md">
                  {loading ? 'Güncelleniyor...' : 'Görevi Güncelle'}
                </button>
                <button type="button" onClick={() => setShowEditModal(false)} className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-md">İptal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {tasks.map((task) => (
          <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-3 rounded-full"><UserIcon className="w-6 h-6 text-blue-600" /></div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{task.productName}</h3>
                  <p className="text-sm text-gray-500">Üretim No: {task.productionNumber}</p>
                  <p className="text-xs text-blue-600 font-medium">{getTaskTypeText(task.taskType)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setSelectedTask(task); setShowPalletModal(true); }} className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full" title="Palet Durumunu Görüntüle"><Eye className="w-5 h-5" /></button>
                <button onClick={() => handleEditTask(task)} className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full" title="Görevi Düzenle"><Pencil className="w-5 h-5" /></button>
                <select value={task.status} onChange={(e) => handleStatusChange(task.id, e.target.value)} className={`px-3 py-1 text-xs font-medium rounded-full border-0 focus:ring-2 focus:ring-blue-500 ${getStatusColor(task.status)}`}>
                  <option value="teslim_alma_dogrulama">Teslim Alma Bekliyor</option>
                  <option value="devam_ediyor">Devam Ediyor</option>
                  <option value="tamamlandı">Tamamlandı</option>
                </select>
                <button onClick={() => handleDeleteTask(task.id, task.productName)} className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full" title="Görevi Sil"><Trash2 className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div><p className="text-sm text-gray-500">Palet Sayısı</p><p className="font-semibold">{task.palletQuantity}</p></div>
              <div><p className="text-sm text-gray-500">Üretim No</p><p className="font-semibold">{task.productionNumber}</p></div>
              <div><p className="text-sm text-gray-500">Son Kullanma</p><p className="font-semibold">{new Date(task.expirationDate).toLocaleDateString('tr-TR')}</p></div>
              <div><p className="text-sm text-gray-500">Oluşturulma</p><p className="font-semibold">{new Date(task.createdAt).toLocaleDateString('tr-TR')}</p></div>
            </div>
            <div className="border-t pt-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-500"><strong>Teslim Alma:</strong> {task.from}</p>
                  <p className="text-sm text-gray-500"><strong>Teslim Etme:</strong> {task.to}</p>
                </div>
                <div className="text-sm text-gray-500">Paletler: {task.palletQuantity} adet</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {tasks.length === 0 && !loading && (
        <div className="text-center py-12">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz görev yok</h3>
          <p className="text-gray-500">İlk görevinizi oluşturmak için yukarıdaki butona tıklayın.</p>
        </div>
      )}

      {showPalletModal && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Palet Durumu - {selectedTask.productName}</h3>
              <button onClick={() => setShowPalletModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="text-center"><div className="text-2xl font-bold text-gray-600">{selectedTask.palletQuantity}</div><div className="text-sm text-gray-500">Toplam Palet</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-blue-600">{selectedTask.status === 'devam_ediyor' ? selectedTask.palletQuantity : 0}</div><div className="text-sm text-blue-600">İşlemde</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-green-600">{selectedTask.status === 'tamamlandı' ? selectedTask.palletQuantity : 0}</div><div className="text-sm text-green-600">Tamamlandı</div></div>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Palet QR Kodları:</h4>
                {selectedTask.palletQRCodes?.map((qrCode, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-3"><Package className="w-5 h-5 text-gray-600" /><span className="font-medium">Palet #{index + 1}</span></div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 font-mono">{qrCode.slice(0, 20)}...</span>
                      {qrImages[index] && (<img src={qrImages[index]} alt={`QR ${index + 1}`} className="w-12 h-12 ml-2 border" />)}
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(selectedTask.status)}`}>
                        {selectedTask.status === 'teslim_alma_dogrulama' ? 'Bekliyor' : selectedTask.status === 'devam_ediyor' ? 'İşlemde' : 'Tamamlandı'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskManagement;