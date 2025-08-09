import React, { useState, useEffect } from 'react';
import { QrCode, X, Camera } from 'lucide-react';
import QrReader from 'react-qr-barcode-scanner';

interface QRScannerProps {
  onScanResult: (result: string) => void;
  onClose: () => void;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScanResult, onClose }) => {
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Kamera başlatma için 3 saniye bekle
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleScan = (data: string | null) => {
    if (data && !scanned) {
      setScanned(true);
      onScanResult(data);
      onClose();
    }
  };

  const handleError = (err: any) => {
    // Sadece kritik hataları göster, QR kod bulunamama hatalarını gösterme
    if (err && err.name && 
        err.name !== 'NoMultiFormatReadersWereAbleToDetectTheCode' &&
        !err.message?.includes('No MultiFormat Readers were able to detect the code') &&
        !err.message?.includes('NotFoundException')) {
      setError('Kamera başlatılamadı: ' + (err?.message || 'Bilinmeyen hata'));
    }
  };

  const handleClose = () => {
    setScanned(true);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <QrCode className="w-6 h-6 text-blue-600" />
            <h3 className="text-lg font-semibold">QR Kod Okuyucu</h3>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="mb-4">
          <p className="text-sm text-gray-600 text-center">
            QR kodu kameranızın önüne tutun ve sabit tutun
          </p>
        </div>

        {error ? (
          <div className="text-red-600 text-center my-4">{error}</div>
        ) : (
          <div className="w-full h-64 bg-gray-100 rounded flex items-center justify-center overflow-hidden relative">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center">
                <Camera className="w-8 h-8 text-blue-600 animate-pulse mb-2" />
                <p className="text-gray-600 text-sm">Kamera başlatılıyor...</p>
              </div>
            ) : (
              !scanned && (
                <QrReader
                  onUpdate={(err, result) => {
                    if (err) handleError(err);
                    if (result) handleScan(result.getText());
                  }}
                />
              )
            )}
          </div>
        )}
        
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500 mb-2">
            QR kodu net görünene kadar sabit tutun
          </p>
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            İptal
          </button>
        </div>
      </div>
    </div>
  );
};

export default QRScanner;
