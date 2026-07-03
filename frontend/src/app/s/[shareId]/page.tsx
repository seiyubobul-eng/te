'use client';

import { useState, useEffect, use } from 'react';
import {
  Lock, HardDrive, File, Folder, Download, ChevronRight,
  Eye, RefreshCw, KeyRound, CheckCircle, AlertCircle, X,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, BACKEND_URL } from '@/lib/api';

interface SharePageProps {
  params: Promise<{ shareId: string }>;
}

export default function SharePage({ params }: SharePageProps) {
  const resolvedParams = use(params);
  const shareId = resolvedParams.shareId;

  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');
  
  // Share details
  const [share, setShare] = useState<any>(null);
  const [content, setContent] = useState<any>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // File Preview Modal
  const [previewFile, setPreviewFile] = useState<any>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);

  // Toast Notifications
  const [toasts, setToasts] = useState<any[]>([]);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Initial Fetch of share links
  const fetchShareDetails = async (subFolderId: string | null = null) => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/api/shares/${shareId}${subFolderId ? `?folderId=${subFolderId}` : ''}`);
      if (data && data.success) {
        if (data.passwordRequired) {
          setPasswordRequired(true);
          setShare(data.share);
        } else {
          setPasswordRequired(false);
          setShare(data.share);
          setContent(data.content);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Share link is invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShareDetails();
  }, [shareId]);

  // Lock unlock submission
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUnlocking(true);

    try {
      const data = await apiFetch(`/api/shares/${shareId}/unlock${currentFolderId ? `?folderId=${currentFolderId}` : ''}`, {
        method: 'POST',
        body: JSON.stringify({ password })
      });

      if (data && data.success) {
        setPasswordRequired(false);
        setShare(data.share);
        setContent(data.content);
        showToast('Decrypted successfully', 'success');
      }
    } catch (err: any) {
      setError(err.message || 'Incorrect password.');
      // Add visual shake to input container
      const card = document.getElementById('lock-card');
      if (card) {
        card.classList.add('animate-shake');
        setTimeout(() => card.classList.remove('animate-shake'), 400);
      }
    } finally {
      setUnlocking(false);
    }
  };

  // Handle directory navigation inside shared files
  const navigateFolder = async (folderId: string | null) => {
    setCurrentFolderId(folderId);
    if (passwordRequired) {
      // Re-run unlock with the targeted folder subpath
      setLoading(true);
      try {
        const data = await apiFetch(`/api/shares/${shareId}/unlock?folderId=${folderId || ''}`, {
          method: 'POST',
          body: JSON.stringify({ password })
        });
        if (data && data.success) {
          setContent(data.content);
        }
      } catch (err: any) {
        showToast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    } else {
      fetchShareDetails(folderId);
    }
  };

  // Preview logic
  const handlePreview = async (file: any) => {
    if (share.disablePreview) {
      showToast('Preview is disabled for this share link', 'error');
      return;
    }
    setPreviewFile(file);
    setPreviewContent('');
    
    const mimeType = file.mimeType.toLowerCase();
    const isText = mimeType.startsWith('text/') || ['json', 'javascript', 'css', 'html', 'markdown'].some(e => mimeType.includes(e));

    if (isText) {
      setPreviewLoading(true);
      try {
        const res = await fetch(`${BACKEND_URL}/api/file/preview/${file.id}`);
        if (res.ok) {
          const txt = await res.text();
          setPreviewContent(txt);
        }
      } catch (_) {
        setPreviewContent('Failed to load text preview');
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  // Helper
  const formatBytes = (bytes: string | number) => {
    const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (b === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading && !share) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  // Error/Invalid landing page
  if (error && !passwordRequired) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col justify-center items-center px-4">
        <div className="glass-premium p-8 rounded-2xl text-center max-w-sm flex flex-col items-center gap-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <h2 className="text-xl font-bold text-white">Access Error</h2>
          <p className="text-gray-400 text-xs">{error}</p>
        </div>
      </div>
    );
  }

  // Render Password protected card screen
  if (passwordRequired) {
    return (
      <div className="min-h-screen w-full bg-[#1f2937] flex items-center justify-center p-4">
        <motion.div 
          id="lock-card"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-sm bg-gray-900/80 backdrop-blur-xl border border-blue-500/30 p-8 rounded-2xl shadow-2xl flex flex-col items-center text-center gap-5 transition-all"
        >
          <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
            <Lock className="w-6 h-6 text-blue-400" />
          </div>

          <h2 className="text-lg font-bold text-white">
            This content is password protected
          </h2>

          {error && (
            <div className="w-full text-xs font-semibold text-red-400 bg-red-500/5 border border-red-500/10 p-2.5 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleUnlock} className="w-full flex flex-col gap-4">
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter Password"
              className="w-full bg-[#111827] border border-white/5 rounded-xl py-3 px-4 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />

            <button
              type="submit"
              disabled={unlocking}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-400 hover:from-blue-500 hover:to-blue-300 disabled:opacity-50 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 hover:scale-[1.01] active:scale-[0.99] hover:shadow-[0_0_20px_rgba(0,210,255,0.6)]"
            >
              <KeyRound className="w-4 h-4" />
              <span>{unlocking ? 'Verifying...' : 'Unlock'}</span>
            </button>
          </form>
        </motion.div>

        <style jsx global>{`
          @keyframes shake {
            10%, 90% { transform: translate3d(-2px, 0, 0); }
            20%, 80% { transform: translate3d(4px, 0, 0); }
            30%, 50%, 70% { transform: translate3d(-6px, 0, 0); }
            40%, 60% { transform: translate3d(6px, 0, 0); }
          }
          .animate-shake {
            animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
          }
        `}</style>
      </div>
    );
  }

  // Render main file sharing explorer screen
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col p-6 md:p-8 max-w-5xl mx-auto gap-6 relative">
      {/* Glow Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[35vw] h-[35vw] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none animate-pulse-slow"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[35vw] h-[35vw] rounded-full bg-purple-500/5 blur-[120px] pointer-events-none animate-pulse-slow"></div>

      {/* Header Info */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <HardDrive className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base text-white">Node-X Secure Share</span>
            <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Shared Content</span>
          </div>
        </div>

        {share?.fileId && (
          <a
            href={`${BACKEND_URL}/api/file/download/${share.fileId}`}
            download
            className="flex items-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-500/10 hover:scale-[1.01]"
          >
            <Download className="w-4 h-4" />
            <span>Download File</span>
          </a>
        )}
      </div>

      {/* Folders Breadcrumbs navigation */}
      {content?.breadcrumbs && (
        <div className="flex items-center gap-1.5 flex-wrap text-sm text-gray-400 font-medium">
          {content.breadcrumbs.map((crumb: any, idx: number) => (
            <div key={crumb.id || 'root'} className="flex items-center gap-1.5">
              {idx > 0 && <ChevronRight className="w-4 h-4 text-gray-600" />}
              <button
                onClick={() => navigateFolder(crumb.id)}
                className={`hover:text-white transition-all py-1 px-2 rounded-lg hover:bg-white/5 flex items-center gap-1 ${
                  idx === content.breadcrumbs.length - 1 ? 'text-white font-semibold' : ''
                }`}
              >
                <span>{crumb.name}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Shared files explorer grid listing */}
      <div className="flex-1 bg-gray-900/30 border border-white/5 rounded-2xl p-6 min-h-[350px]">
        {share?.fileId ? (
          /* Single File Shared */
          <div className="flex flex-col items-center justify-center p-8 text-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400">
              <File className="w-8 h-8" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="font-bold text-white text-base">{content?.file?.originalName}</h3>
              <span className="text-xs text-gray-500">{formatBytes(content?.file?.size || 0)}</span>
            </div>
            
            {!share.disablePreview && (
              <button onClick={() => handlePreview(content.file)} className="flex items-center gap-2 py-2 px-4 rounded-xl border border-white/5 hover:border-blue-500/20 hover:bg-blue-500/10 text-xs font-semibold text-blue-400 transition-all">
                <Eye className="w-4 h-4" />
                <span>Preview File</span>
              </button>
            )}
          </div>
        ) : (
          /* Shared Folder Content */
          <div className="flex flex-col gap-6">
            {content?.folders?.length === 0 && content?.files?.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-gray-500 py-12">
                <Folder className="w-12 h-12 text-gray-800 mb-2" />
                <span>This shared folder is empty</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {/* Folders */}
                {content?.folders?.map((folder: any) => (
                  <div
                    key={folder.id}
                    onClick={() => navigateFolder(folder.id)}
                    className="group relative flex flex-col gap-3 p-4 rounded-2xl border border-white/5 bg-white/20 hover:bg-white/40 hover:border-white/10 transition-all cursor-pointer select-none hover:-translate-y-0.5"
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                      <Folder className="w-5 h-5 fill-blue-400/20" />
                    </div>
                    <span className="text-xs font-semibold text-white truncate max-w-full">{folder.name}</span>
                  </div>
                ))}

                {/* Files */}
                {content?.files?.map((file: any) => (
                  <div
                    key={file.id}
                    onClick={() => handlePreview(file)}
                    className="group relative flex flex-col gap-3 p-4 rounded-2xl border border-white/5 bg-white/20 hover:bg-white/40 hover:border-white/10 transition-all cursor-pointer select-none hover:-translate-y-0.5"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400">
                      <File className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-white truncate max-w-full">{file.originalName}</span>
                      <span className="text-[10px] text-gray-500">{formatBytes(file.size)}</span>
                    </div>

                    {/* Download button */}
                    {!share?.disableDownload && (
                      <a
                        href={`${BACKEND_URL}/api/file/download/${file.id}`}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-3 right-3 p-1.5 rounded-lg bg-gray-900 border border-white/5 hover:border-white/10 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- INLINE FILE PREVIEW MODAL --- */}
      <AnimatePresence>
        {previewFile && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-3xl h-[80vh] glass-premium rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Preview Modal Header */}
              <div className="flex justify-between items-center p-4 border-b border-white/5 bg-gray-950/20">
                <div className="flex items-center gap-2 max-w-[70%]">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-semibold text-white truncate" title={previewFile.originalName}>
                    {previewFile.originalName}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {!share?.disableDownload && (
                    <a href={`${BACKEND_URL}/api/file/download/${previewFile.id}`} download className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all">
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  )}
                  <button onClick={() => setPreviewFile(null)} className="text-gray-400 hover:text-white p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Preview Modal Body */}
              <div className="flex-1 bg-black/30 flex items-center justify-center overflow-auto p-4">
                {previewLoading ? (
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                ) : (
                  <>
                    {/* Image Preview */}
                    {previewFile.mimeType.toLowerCase().startsWith('image/') && (
                      <img
                        src={`${BACKEND_URL}/api/file/preview/${previewFile.id}`}
                        alt={previewFile.originalName}
                        className="max-w-full max-h-[60vh] object-contain rounded"
                      />
                    )}

                    {/* Video Preview */}
                    {previewFile.mimeType.toLowerCase().startsWith('video/') && (
                      <video
                        src={`${BACKEND_URL}/api/file/preview/${previewFile.id}`}
                        controls
                        className="max-w-full max-h-[60vh] object-contain rounded outline-none"
                      />
                    )}

                    {/* Audio Preview */}
                    {previewFile.mimeType.toLowerCase().startsWith('audio/') && (
                      <audio
                        src={`${BACKEND_URL}/api/file/preview/${previewFile.id}`}
                        controls
                        className="w-full max-w-md outline-none"
                      />
                    )}

                    {/* PDF Preview */}
                    {previewFile.mimeType.toLowerCase() === 'application/pdf' && (
                      <iframe
                        src={`${BACKEND_URL}/api/file/preview/${previewFile.id}`}
                        className="w-full h-full border-none"
                      />
                    )}

                    {/* Text Preview */}
                    {(previewFile.mimeType.toLowerCase().startsWith('text/') || previewContent) && (
                      <div className="w-full h-full bg-gray-950 p-4 rounded-xl overflow-auto border border-white/5">
                        <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">{previewContent}</pre>
                      </div>
                    )}

                    {/* Fallback */}
                    {!previewFile.mimeType.toLowerCase().startsWith('image/') &&
                     !previewFile.mimeType.toLowerCase().startsWith('video/') &&
                     !previewFile.mimeType.toLowerCase().startsWith('audio/') &&
                     previewFile.mimeType.toLowerCase() !== 'application/pdf' &&
                     !previewContent && (
                       <div className="text-center text-gray-500 text-xs flex flex-col items-center gap-2">
                         <AlertCircle className="w-8 h-8 text-gray-700" />
                         <span>Inline preview not available for this file type.</span>
                       </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className={`flex items-center gap-2.5 py-3 px-4 rounded-xl border shadow-xl text-xs font-semibold ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-400 border-emerald-500/20'
                : 'bg-red-950/90 text-red-400 border-red-500/20'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{toast.message}</span>
          </motion.div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 border-t border-white/5 pt-4 text-center text-xs text-gray-600 font-medium">
        Credit by tiaarah
      </div>
    </div>
  );
}
