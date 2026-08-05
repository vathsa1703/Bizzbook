import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, Upload, Loader2, Check, RotateCcw } from 'lucide-react';
import { useToast } from './ToastContext';
import { BASE } from '../api/client';
import { Capacitor } from '@capacitor/core';
import { Camera as CapacitorCamera } from '@capacitor/camera';

// Same reasoning as useVoiceRecorder.js's mic permission gate: a Capacitor
// WebView needs the native Android CAMERA runtime permission requested and
// granted before getUserMedia's live-preview path can succeed -- plain web
// JS can't trigger that dialog itself. @capacitor/camera's permission API
// bridges it; the plugin's own capture UI is NOT used here, this keeps the
// existing in-page live-preview + file-input-fallback flow unchanged.
async function ensureNativeCameraPermission() {
  if (!Capacitor.isNativePlatform()) return true;
  const status = await CapacitorCamera.checkPermissions();
  if (status.camera === 'granted') return true;
  const requested = await CapacitorCamera.requestPermissions({ permissions: ['camera'] });
  return requested.camera === 'granted';
}

export default function ScanModal({ type, onClose, onParsed }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCameraLive, setIsCameraLive] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  
  const { showToast } = useToast();

  useEffect(() => {
    // Cleanup stream on unmount
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const handleOpenCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // Fallback directly if unsupported
      cameraInputRef.current?.click();
      return;
    }
    
    try {
      const nativeOk = await ensureNativeCameraPermission();
      if (!nativeOk) {
        cameraInputRef.current?.click();
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      streamRef.current = stream;
      setIsCameraLive(true);
      // Wait for React to render the video element
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 50);
    } catch (err) {
      console.warn("getUserMedia failed, falling back to input", err);
      cameraInputRef.current?.click();
    }
  };

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setPreviewImage(dataUrl);
    stopCamera();
    setIsCameraLive(false);
  };

  const handleRetake = () => {
    setPreviewImage(null);
    handleOpenCamera();
  };

  const handleUsePhoto = async () => {
    if (!previewImage) return;
    const res = await fetch(previewImage);
    const blob = await res.blob();
    const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
    processFile(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // When using fallback file inputs, we don't show the internal preview step.
      // We go straight to process, or we could set preview image. Let's set preview image for consistency.
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPreviewImage(ev.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const processFile = async (file) => {
    setIsProcessing(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const endpoint = type === 'sales' ? '/ocr/sales' : '/ocr/stock';
      const res = await fetch(`${BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });
      
      const data = await res.json();
      if (data.success) {
        showToast('Invoice scanned successfully', 'success');
        onParsed(data.data);
      } else {
        throw new Error(data.error || 'Failed to scan invoice');
      }
    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-panel dark:bg-panel-dark rounded-3xl w-full max-w-md overflow-hidden animate-fade-in-up flex flex-col max-h-full">
        {/* Header */}
        <div className="px-5 py-4 border-b border-edge dark:border-edge-dark flex justify-between items-center shrink-0">
          <h3 className="font-bold text-inkA dark:text-inkA-dark">Scan {type === 'sales' ? 'Sale' : 'Stock'} Invoice</h3>
          <button onClick={handleClose} disabled={isProcessing} className="w-8 h-8 flex items-center justify-center rounded-full bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark hover:bg-gray-200">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex-1 overflow-y-auto">
          {isProcessing ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-accent animate-spin mb-4" />
              <p className="text-base font-bold text-inkA dark:text-inkA-dark">Analyzing Document...</p>
              <p className="text-sm text-inkB dark:text-inkB-dark mt-2 text-center max-w-xs">Extracting items, matching products, and preparing your draft.</p>
            </div>
          ) : isCameraLive ? (
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-full aspect-[3/4] bg-black rounded-2xl overflow-hidden shadow-inner">
                <video 
                  ref={videoRef} 
                  className="w-full h-full object-cover" 
                  playsInline 
                  autoPlay 
                  muted 
                />
                {/* Scanner overlay effect */}
                <div className="absolute inset-0 pointer-events-none border-2 border-accent/30 rounded-2xl">
                  <div className="w-full h-0.5 bg-brand-blue/50 shadow-[0_0_8px_rgba(59,130,246,0.8)] animate-scan" />
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex gap-3 w-full">
                <button 
                  onClick={() => { setIsCameraLive(false); stopCamera(); }}
                  className="flex-1 py-3.5 bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark font-bold rounded-xl active:scale-95 transition-transform"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCapture}
                  className="flex-[2] flex items-center justify-center gap-2 py-3.5 bg-accent text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 active:scale-95 transition-transform"
                >
                  <Camera size={20} /> Capture
                </button>
              </div>
            </div>
          ) : previewImage ? (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm font-bold text-inkA dark:text-inkA-dark">Preview Image</p>
              <div className="relative w-full aspect-[3/4] bg-panel2 dark:bg-panel2-dark rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
                <img src={previewImage} alt="Preview" className="w-full h-full object-contain" />
              </div>
              <div className="flex gap-3 w-full">
                <button 
                  onClick={handleRetake}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark font-bold rounded-xl active:scale-95 transition-transform"
                >
                  <RotateCcw size={18} /> Retake
                </button>
                <button 
                  onClick={handleUsePhoto}
                  className="flex-[2] flex items-center justify-center gap-2 py-3.5 bg-brand-green text-white font-bold rounded-xl shadow-lg shadow-green-500/30 active:scale-95 transition-transform"
                >
                  <Check size={20} /> Use Photo
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-inkB dark:text-inkB-dark text-center mb-6">Choose how you want to provide the invoice image.</p>
              
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                ref={cameraInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
              />
              <button 
                onClick={handleOpenCamera}
                className="w-full flex items-center justify-center gap-3 py-4 bg-accent text-white rounded-2xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-transform"
              >
                <Camera size={24} />
                Open Camera
              </button>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-edge dark:border-edge-dark"></div>
                <span className="flex-shrink-0 mx-4 text-xs text-gray-400 dark:text-slate-500 font-medium">OR</span>
                <div className="flex-grow border-t border-edge dark:border-edge-dark"></div>
              </div>

              <input 
                type="file" 
                accept="image/*" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-3 py-4 bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark border border-edge dark:border-edge-dark rounded-2xl font-bold active:bg-panel2 dark:active:bg-panel2-dark transition-colors"
              >
                <Upload size={20} />
                Upload from Gallery
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
