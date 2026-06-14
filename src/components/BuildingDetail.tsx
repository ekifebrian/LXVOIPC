import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Building, GalleryItem } from '../types';
import { X, MapPin, Calendar, User, ChevronLeft, ChevronRight, Edit3, Trash2, Play, Volume2, VolumeX, Layers, Cpu, Hash, Clock, Phone, Send, Settings, Check, Loader2 } from 'lucide-react';
import { Language, translations } from '../languages';
import { isMediaVideo } from './AdminPanel';

interface BuildingDetailProps {
  building: Building;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (building: Building) => void;
  onDelete: (building: Building) => void;
  lang: Language;
}

export default function BuildingDetail({ building, isAdmin, onClose, onEdit, onDelete, lang }: BuildingDetailProps) {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  
  const t = translations[lang];

  const mediaItems = building.gallery && building.gallery.length > 0 
    ? building.gallery.map((img) => typeof img === 'string' ? { url: img, caption: '', type: undefined } : img)
    : [{ url: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1200&q=80', caption: '', type: undefined }];

  const nextMedia = () => {
    setCurrentMediaIndex((prev) => (prev + 1) % mediaItems.length);
  };

  const prevMedia = () => {
    setCurrentMediaIndex((prev) => (prev - 1 + mediaItems.length) % mediaItems.length);
  };

  const activeMedia = mediaItems[currentMediaIndex];
  const activeIsVideo = activeMedia ? isMediaVideo(activeMedia) : false;

  // Format record categorization names and badge styles
  const getBadgeStyle = () => {
    switch (building.category) {
      case 'survey':
        return 'bg-teal-50 text-teal-700 border-teal-100';
      case 'line':
        return 'bg-sky-50 text-sky-700 border-sky-100';
      case 'installation':
        return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex justify-end overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 220 }}
        className="w-full max-w-[700px] bg-white h-full shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Visual Media Showcase Section */}
        <div className="relative h-[320px] sm:h-[380px] bg-slate-950 shrink-0 flex items-center justify-center overflow-hidden group">
          <div className="w-full h-full flex items-center justify-center">
            {activeIsVideo ? (
              <div className="relative w-full h-full flex items-center justify-center bg-black">
                <video
                  src={activeMedia.url}
                  className="w-full h-full object-contain"
                  autoPlay
                  loop
                  muted={isMuted}
                  playsInline
                />
                {/* Audio Volume Button Overlay */}
                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className="absolute bottom-4 right-4 bg-slate-950/80 hover:bg-slate-900 text-white p-2 rounded-lg shadow-md border border-white/10 transition z-10"
                  title={isMuted ? 'Mute' : 'Unmute'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                </button>
                <span className="absolute top-4 left-4 bg-teal-500 text-white text-[9px] uppercase font-black tracking-widest px-2.5 py-1 rounded-md shadow-sm z-10 flex items-center gap-1.5 font-sans">
                  <Play className="w-2.5 h-2.5 fill-white" />
                  LIVE TELEMETRY
                </span>
              </div>
            ) : (
              <img
                src={activeMedia?.url || ''}
                alt={`${building.name} gallery ${currentMediaIndex}`}
                className="w-full h-full object-cover select-none"
                referrerPolicy="no-referrer"
              />
            )}
          </div>

          {/* Picture Caption Tag */}
          {activeMedia?.caption && (
            <div className="absolute bottom-4 inset-x-0 bg-slate-950/80 backdrop-blur-xs px-4 py-2 text-white text-xs text-center mx-auto max-w-[85%] rounded-lg shadow-md border border-white/10 z-10">
              {activeMedia.caption}
            </div>
          )}

          {/* Floating dismiss button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 bg-slate-900/60 backdrop-blur-md text-white p-2 rounded-lg hover:bg-slate-950 transition hover:scale-105 z-20"
            aria-label={t.detailCloseBtn}
          >
            <X className="w-5 h-5" />
          </button>

          {/* Swipe selectors */}
          {mediaItems.length > 1 && (
            <>
              <button
                onClick={prevMedia}
                className="absolute left-3 top-1/2 -translate-y-1/2 bg-slate-900/50 hover:bg-slate-950 text-white p-2 rounded-lg transition z-10"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={nextMedia}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-slate-900/50 hover:bg-slate-950 text-white p-2 rounded-lg transition z-10"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Counter Tag */}
          <div className="absolute right-4 bottom-4 px-2 py-1 bg-black/60 rounded-md text-white text-[10px] font-mono z-10">
            {currentMediaIndex + 1} / {mediaItems.length}
          </div>
        </div>

        {/* Info Area Sheet */}
        <div className="p-6 flex-grow flex flex-col gap-6 overflow-y-auto">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center gap-4">
              <span className={`inline-block border text-[10px] uppercase font-black px-3 py-1 rounded-md tracking-wider ${getBadgeStyle()}`}>
                {building.category}
              </span>
              
              {/* Quick contextual edits */}
              {isAdmin && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      onEdit(building);
                    }}
                    className="flex items-center gap-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer text-slate-700"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    {t.editBtn}
                  </button>
                  <button
                    onClick={() => onDelete(building)}
                    className="flex items-center gap-1 bg-rose-50 text-rose-600 hover:bg-rose-100 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t.deleteBtn}
                  </button>
                </div>
              )}
            </div>
            
            <h2 className="font-sans font-black text-2xl text-slate-900 leading-snug">
              {building.name}
            </h2>
          </div>

          {/* Structured Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs text-slate-600">
            <div className="flex items-center gap-2.5">
              <User className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-slate-400 font-medium">{t.operator}</p>
                <p className="font-bold text-slate-800">{building.operator || 'N/A'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 border-t sm:border-t-0 sm:border-l border-slate-200/50 pt-2.5 sm:pt-0 sm:pl-3">
              <Calendar className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-slate-400 font-medium">{t.operationTime}</p>
                <p className="font-bold text-slate-800">{building.operationTime || 'N/A'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 border-t sm:border-t-0 sm:border-l border-slate-200/50 pt-2.5 sm:pt-0 sm:pl-3">
              <MapPin className="w-4 h-4 text-slate-400" />
              <div className="min-w-0">
                <p className="text-slate-400 font-medium">{t.operationLocation}</p>
                <p className="font-bold text-slate-800 truncate" title={building.location}>
                  {building.location}
                </p>
              </div>
            </div>
          </div>

          {/* Dynamic Technical Parameter Specifications */}
          <div className="flex flex-col gap-2 bg-blue-50/20 border border-blue-50 p-4 rounded-xl">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
              {lang === 'id' ? 'SPESIFIKASI METRIK TEKNIS' : '技术指标详情'}
            </h3>
            
            {building.category === 'survey' && (
              <div className="grid grid-cols-2 gap-4 text-xs mt-1">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-teal-500 shrink-0" />
                  <div>
                    <p className="text-slate-400">{t.longDistanceLines}</p>
                    <p className="font-black text-slate-800 text-sm">{building.longDistanceLines || 0} {lang === 'id' ? 'Batang' : '根'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-teal-500 shrink-0" />
                  <div>
                    <p className="text-slate-400">{t.localLines}</p>
                    <p className="font-black text-slate-800 text-sm">{building.localLines || 0} {lang === 'id' ? 'Batang' : '根'}</p>
                  </div>
                </div>
              </div>
            )}

            {building.category === 'line' && (
              <div className="grid grid-cols-2 gap-4 text-xs mt-1">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-sky-500 shrink-0" />
                  <div>
                    <p className="text-slate-400">{t.longDistancePhones}</p>
                    <p className="font-black text-slate-800 text-sm">{building.longDistancePhones || 0} {lang === 'id' ? 'Unit' : '个'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-500 shrink-0" />
                  <div>
                    <p className="text-slate-400">{t.localPhones}</p>
                    <p className="font-black text-slate-800 text-sm">{building.localPhones || 0} {lang === 'id' ? 'Unit' : '个'}</p>
                  </div>
                </div>
              </div>
            )}

            {building.category === 'installation' && (
              <div className="grid grid-cols-3 gap-3 text-xs mt-1">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-500 shrink-0" />
                  <div>
                    <p className="text-slate-400">{lang === 'id' ? 'Jalur Jauh' : '长途线路'}</p>
                    <p className="font-black text-slate-800 text-sm">{building.longDistanceLines || 0} {lang === 'id' ? 'Batang' : '根'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-indigo-500 shrink-0" />
                  <div>
                    <p className="text-slate-400">{lang === 'id' ? 'Jalur Lokal' : '本地线路'}</p>
                    <p className="font-black text-slate-800 text-sm">{building.localLines || 0} {lang === 'id' ? 'Batang' : '根'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
                  <div>
                    <p className="text-slate-400">{t.totalDurationHours}</p>
                    <p className="font-black text-slate-800 text-sm">{building.totalDuration || 0} {lang === 'id' ? 'Jam' : '小时'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Narrative description */}
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
              {t.descStr}
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50 p-4 rounded-xl border border-slate-100">
              {building.description || lang === 'id' ? 'Tidak ada penjelasan tertulis.' : '暂无详细描述描述。'}
            </p>
          </div>



          {/* Copy and Export tools at the footer bottom */}
          <div className="bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between gap-4 mt-auto">
            <div className="text-xs min-w-0">
              <p className="font-bold">{lang === 'id' ? 'Rekaman Terdistribusi Resmi' : '官方存盘核验记录'}</p>
              <p className="text-slate-400 mt-1 truncate">{building.location}</p>
            </div>
            <button
              onClick={() => {
                let specDetails = '';
                if (building.category === 'survey') {
                  specDetails = `长途线路: ${building.longDistanceLines || 0} | 本地线路: ${building.localLines || 0}`;
                } else if (building.category === 'line') {
                  specDetails = `长途电话: ${building.longDistancePhones || 0} | 本地电话: ${building.localPhones || 0}`;
                } else if (building.category === 'installation') {
                  specDetails = `安装线路: ${building.installedLines || 0} | 总时长: ${building.totalDuration || 0}小时`;
                }

                const shareText = `[${building.category.toUpperCase()}] ${building.name}
时间 : ${building.operationTime || 'N/A'}
地点 : ${building.location}
操作人 : ${building.operator || 'N/A'}
指标 : ${specDetails}
笔记 : ${building.description}`;

                navigator.clipboard.writeText(shareText);
                alert(t.copySuccessAlert);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-sm"
            >
              {t.copyRecordBtn}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
