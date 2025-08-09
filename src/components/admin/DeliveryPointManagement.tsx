import React, { useEffect, useState } from 'react';
import { ref, get, push, set, remove } from 'firebase/database';
import { db } from '../../firebase/config';
import { DeliveryPoint } from '../../types';
import { Plus, Trash2 } from 'lucide-react';
import { generateQRCode } from '../../utils/qrGenerator';

const DeliveryPointManagement: React.FC = () => {
  const [points, setPoints] = useState<DeliveryPoint[]>([]);
  const [name, setName] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [qrImages, setQrImages] = useState<{ [id: string]: string }>({});

  useEffect(() => {
    fetchPoints();
  }, []);

  useEffect(() => {
    const fetchQRCodes = async () => {
      const images: { [id: string]: string } = {};
      for (const point of points) {
        if (point.qrCode) {
          images[point.id] = await generateQRCode(point.qrCode);
        }
      }
      setQrImages(images);
    };
    fetchQRCodes();
  }, [points]);

  const fetchPoints = async () => {
    const refPoints = ref(db, 'deliveryPoints');
    const snapshot = await get(refPoints);
    if (snapshot.exists()) {
      const data = snapshot.val();
      setPoints(Object.keys(data).map(key => ({ id: key, ...data[key] })));
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !qrCode) return;
    const newRef = push(ref(db, 'deliveryPoints'));
    await set(newRef, { name, qrCode });
    setName('');
    setQrCode('');
    fetchPoints();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Silmek istediğinize emin misiniz?')) {
      await remove(ref(db, `deliveryPoints/${id}`));
      fetchPoints();
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Teslimat Noktası Yönetimi</h2>
      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <input
          className="border rounded px-2 py-1"
          placeholder="Teslimat Noktası Adı"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          className="border rounded px-2 py-1"
          placeholder="QR Kodu"
          value={qrCode}
          onChange={e => setQrCode(e.target.value)}
        />
        <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded flex items-center gap-1">
          <Plus className="w-4 h-4" /> Ekle
        </button>
      </form>
      <ul>
        {points.map(point => (
          <li key={point.id} className="flex justify-between items-center border-b py-2">
            <span>
              {point.name}
              <span className="text-xs text-gray-400 ml-2">({point.qrCode})</span>
              {qrImages[point.id] && (
                <img src={qrImages[point.id]} alt="QR" className="inline-block w-8 h-8 ml-2 border" />
              )}
            </span>
            <button onClick={() => handleDelete(point.id)} className="text-red-600 hover:bg-red-50 rounded p-1">
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DeliveryPointManagement;
