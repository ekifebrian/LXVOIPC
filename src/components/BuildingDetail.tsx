import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Building, GalleryItem } from '../types';
import { X, MapPin, Calendar, User, ChevronLeft, ChevronRight, Edit3, Trash2, Play, Volume2, VolumeX, Layers, Cpu, Hash, Clock, Phone, Send, Settings, Check, Loader2 } from 'lucide-react';
import { Language, translations } from '../languages';
import { isMediaVideo } from './AdminPanel';

function dataURLtoBlob(dataurl: string): Blob | null {
  try {
    const arr = dataurl.split(',');
    if (arr.length < 2) return null;
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) return null;
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    console.error("Failed to parse base64 to blob", e);
    return null;
  }
}

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
  
  // Telegram integration states
  const [telegramToken, setTelegramToken] = useState(() => localStorage.getItem('lx_telegram_token') || '');
  const [telegramChatId, setTelegramChatId] = useState(() => localStorage.getItem('lx_telegram_chat_id') || '');
  const [isConfiguringTelegram, setIsConfiguringTelegram] = useState(false);
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<{ text: string; isError: boolean } | null>(null);

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

  const handleSaveTelegramConfig = () => {
    localStorage.setItem('lx_telegram_token', telegramToken.trim());
    localStorage.setItem('lx_telegram_chat_id', telegramChatId.trim());
    setTelegramStatus({
      text: lang === 'id' ? 'Konfigurasi Telegram berhasil disimpan!' : 'Telegram 配置已成功保存！',
      isError: false
    });
    setIsConfiguringTelegram(false);
  };

  const handleSendToTelegram = async () => {
    if (!telegramToken || !telegramChatId) {
      setIsConfiguringTelegram(true);
      setTelegramStatus({
        text: lang === 'id' ? 'Harap lengkapi Token Bot dan Chat ID Telegram Anda terlebih dahulu.' : '请先完整配置 Telegram 机器人口令与群组 ID。',
        isError: true
      });
      return;
    }

    setIsSendingTelegram(true);
    setTelegramStatus(null);

    try {
      // Prepare localized specifications
      let specDetailsHtml = '';
      if (building.category === 'survey') {
        specDetailsHtml = `• <b>${t.longDistanceLines}:</b> ${building.longDistanceLines || 0} ${lang === 'id' ? 'Batang' : '根'}\n• <b>${t.localLines}:</b> ${building.localLines || 0} ${lang === 'id' ? 'Batang' : '根'}`;
      } else if (building.category === 'line') {
        specDetailsHtml = `• <b>${t.longDistancePhones}:</b> ${building.longDistancePhones || 0} ${lang === 'id' ? 'Unit' : '个'}\n• <b>${t.localPhones}:</b> ${building.localPhones || 0} ${lang === 'id' ? 'Unit' : '个'}`;
      } else if (building.category === 'installation') {
        specDetailsHtml = `• <b>${lang === 'id' ? 'Jalur Jauh' : '长途线路'}:</b> ${building.longDistanceLines || 0} ${lang === 'id' ? 'Batang' : '根'}\n• <b>${lang === 'id' ? 'Jalur Lokal' : '本地线路'}:</b> ${building.localLines || 0} ${lang === 'id' ? 'Batang' : '根'}\n• <b>${t.totalDurationHours}:</b> ${building.totalDuration || 0} ${lang === 'id' ? 'Jam' : '小时'}`;
      }

      const catUpper = building.category === 'survey' ? (lang === 'id' ? 'SURVEI' : '踩点') : building.category === 'line' ? (lang === 'id' ? 'PENGUKURAN LIN' : '测线') : (lang === 'id' ? '设备安装' : '设备安装');

      const isChinese = lang === 'zh';
      const labelCategory = isChinese ? '📋 类别' : '📋 Kategori';
      const labelOperator = isChinese ? '👤 操作人' : '👤 Operator';
      const labelTime = isChinese ? '📅 操作时间' : '📅 Waktu';
      const labelLocation = isChinese ? '📍 地点' : '📍 Lokasi';
      const labelGps = isChinese ? '🛰 GPS 坐标' : '🛰 Koordinat GPS';
      const labelSpec = isChinese ? '⚙️ 技术规范' : '⚙️ Spesifikasi Teknis';
      const labelDesc = isChinese ? '📝 描述/备注' : '📝 Deskripsi/Catatan';
      const labelFooter = isChinese ? '发送自 LXVOIP 数据中心终端' : 'Dikirim via Portal Database LXVOIP';

      const fullMessageHtml = `<b>🏨 PORTAL DATA - ${building.name.toUpperCase()}</b>\n\n<b>${labelCategory}:</b> [${catUpper}]\n<b>${labelOperator}:</b> ${building.operator || 'N/A'}\n<b>${labelTime}:</b> ${building.operationTime || 'N/A'}\n<b>${labelLocation}:</b> ${building.location || 'N/A'}${building.latitude && building.longitude ? `\n<b>${labelGps}:</b> <a href="https://www.google.com/maps/search/?api=1&query=${building.latitude},${building.longitude}">${building.latitude.toFixed(5)}, ${building.longitude.toFixed(5)}</a>` : ''}\n\n<b>${labelSpec}:</b>\n${specDetailsHtml}\n\n<b>${labelDesc}:</b>\n${building.description || (lang === 'id' ? 'Tidak ada catatan.' : '暂无。')}\n\n<i>${labelFooter}</i>`;

      let success = false;
      const actualGallery = building.gallery || [];

      if (actualGallery.length === 0) {
        // Text-only send
        const res = await fetch(`https://api.telegram.org/bot${telegramToken.trim()}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId.trim(),
            text: fullMessageHtml,
            parse_mode: 'HTML',
            disable_web_page_preview: false
          })
        });
        const data = await res.json();
        if (data.ok) success = true;
      } else if (actualGallery.length === 1) {
        // Send exactly one item (photo or video)
        const item = actualGallery[0];
        const url = typeof item === 'string' ? item : item.url;
        const isVideo = typeof item === 'string' ? false : item.type === 'video';
        const apiMethod = isVideo ? 'sendVideo' : 'sendPhoto';

        const singleFormData = new FormData();
        singleFormData.append('chat_id', telegramChatId.trim());
        singleFormData.append('parse_mode', 'HTML');

        const useSeparateText = fullMessageHtml.length > 1000;
        singleFormData.append('caption', useSeparateText ? `🏨 <b>[DATA SHARING] ${building.name.toUpperCase()}</b>` : fullMessageHtml);

        if (url.startsWith('data:')) {
          const blob = dataURLtoBlob(url);
          if (blob) {
            singleFormData.append(isVideo ? 'video' : 'photo', blob, `file_0.${isVideo ? 'mp4' : 'jpg'}`);
          }
        } else {
          singleFormData.append(isVideo ? 'video' : 'photo', url);
        }

        const res = await fetch(`https://api.telegram.org/bot${telegramToken.trim()}/${apiMethod}`, {
          method: 'POST',
          body: singleFormData
        });
        const data = await res.json();
        if (data.ok) success = true;

        if (useSeparateText && success) {
          await fetch(`https://api.telegram.org/bot${telegramToken.trim()}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramChatId.trim(),
              text: fullMessageHtml,
              parse_mode: 'HTML',
              disable_web_page_preview: true
            })
          });
        }
      } else {
        // Send multi photo/video album (bulk up to 10!)
        const subGallery = actualGallery.slice(0, 10);
        const groupFormData = new FormData();
        groupFormData.append('chat_id', telegramChatId.trim());

        const mediaArray: any[] = [];
        const useSeparateText = fullMessageHtml.length > 1000;

        subGallery.forEach((item, idx) => {
          const url = typeof item === 'string' ? item : item.url;
          const isVideo = typeof item === 'string' ? false : item.type === 'video';
          
          let mediaRef = '';
          if (url.startsWith('data:')) {
            const blob = dataURLtoBlob(url);
            if (blob) {
              const fieldName = `media_file_${idx}`;
              groupFormData.append(fieldName, blob, `file_${idx}.${isVideo ? 'mp4' : 'jpg'}`);
              mediaRef = `attach://${fieldName}`;
            }
          } else {
            mediaRef = url;
          }

          if (mediaRef) {
            mediaArray.push({
              type: isVideo ? 'video' : 'photo',
              media: mediaRef,
              caption: idx === 0 
                ? (useSeparateText ? `🏨 <b>[DATA SHARING] ${building.name.toUpperCase()}</b>` : fullMessageHtml) 
                : undefined,
              parse_mode: idx === 0 ? 'HTML' : undefined
            });
          }
        });

        groupFormData.append('media', JSON.stringify(mediaArray));

        const res = await fetch(`https://api.telegram.org/bot${telegramToken.trim()}/sendMediaGroup`, {
          method: 'POST',
          body: groupFormData
        });
        const data = await res.json();
        if (data.ok) success = true;

        if (useSeparateText && success) {
          await fetch(`https://api.telegram.org/bot${telegramToken.trim()}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramChatId.trim(),
              text: fullMessageHtml,
              parse_mode: 'HTML',
              disable_web_page_preview: true
            })
          });
        }
      }

      if (success) {
        setTelegramStatus({
          text: lang === 'id' ? 'Sukses terkirim ke Telegram!' : '已成功发送至 Telegram！',
          isError: false
        });
      } else {
        throw new Error(lang === 'id' ? 'Telegram mengembalikan status error. Periksa kecocokan Token/ChatID Anda.' : '发送失败，请检查机器人 Token 或 Chat ID 是否正确。');
      }
    } catch (err: any) {
      setTelegramStatus({
        text: err.message || (lang === 'id' ? 'Gagal terhubung dengan Telegram.' : '连接 Telegram 失败，请检查网络或配置。'),
        isError: true
      });
    } finally {
      setIsSendingTelegram(false);
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
        <div className="relative h-[320px] sm:h-[380px] bg-slate-950 shrink-0 flex items-center justify-center group">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentMediaIndex}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full flex items-center justify-center"
            >
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
                  <span className="absolute top-4 left-4 bg-teal-500 text-white text-[9px] uppercase font-black tracking-widest px-2.5 py-1 rounded-md shadow-sm z-10 flex items-center gap-1.5">
                    <Play className="w-2.5 h-2.5 fill-white" />
                    LIVE TELEMETRY
                  </span>
                </div>
              ) : (
                <img
                  src={activeMedia?.url || ''}
                  alt={`${building.name} gallery ${currentMediaIndex}`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              )}
            </motion.div>
          </AnimatePresence>

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

          {/* Telegram Forwarding Widget */}
          <div className="bg-sky-50/50 border border-sky-100 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                <h3 className="text-xs font-extrabold uppercase tracking-widest text-sky-800">
                  {lang === 'id' ? 'INTEGRASI BOT TELEGRAM' : 'TELEGRAM 机器人转发'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfiguringTelegram(!isConfiguringTelegram)}
                className="text-[11px] font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1 transition cursor-pointer"
                title={lang === 'id' ? 'Konfigurasi Bot' : '配置机器人参数'}
              >
                <Settings className="w-3.5 h-3.5" />
                {lang === 'id' ? 'Pengaturan' : '配置'}
              </button>
            </div>

            {/* Config Expandable Block */}
            {isConfiguringTelegram && (
              <div className="bg-white border border-sky-100 rounded-lg p-3 flex flex-col gap-3 text-xs text-slate-700 animate-fade-in">
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-slate-600">Telegram Bot Token:</span>
                  <input
                    type="password"
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    placeholder="Contoh: 1234567890:ABCdefGH..."
                    className="bg-slate-50 border border-slate-200 focus:border-sky-500 rounded-lg p-2.5 font-mono text-xs text-slate-800"
                  />
                  <span className="text-[10px] text-slate-400">
                    {lang === 'id' 
                      ? 'Dapatkan token dari @BotFather di aplikasi Telegram.' 
                      : '从 Telegram 上的 @BotFather 申请获得的 API 凭证。'}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="font-bold text-slate-600">Target Chat ID:</span>
                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder="Contoh: -100123456789 atau 987654321"
                    className="bg-slate-50 border border-slate-200 focus:border-sky-500 rounded-lg p-2.5 font-mono text-xs text-slate-800"
                  />
                  <span className="text-[10px] text-slate-400">
                    {lang === 'id' 
                      ? 'Bisa ID pribadi Anda, grup, atau Channel ID (cth: -100123...).' 
                      : '接收消息的用户 ID、群组或频道 ID (群组需带负号 -100 等)。'}
                  </span>
                </div>

                <div className="flex justify-end gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsConfiguringTelegram(false);
                      setTelegramStatus(null);
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 font-bold"
                  >
                    {lang === 'id' ? 'Batal' : '取消'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTelegramConfig}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {lang === 'id' ? 'Simpan' : '确定保存'}
                  </button>
                </div>
              </div>
            )}

            {/* Status alerts */}
            {telegramStatus && (
              <div className={`p-3 rounded-lg text-xs leading-relaxed font-bold border ${telegramStatus.isError ? 'bg-rose-50 text-rose-800 border-rose-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'}`}>
                {telegramStatus.text}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-2 mt-1">
              <button
                type="button"
                onClick={handleSendToTelegram}
                disabled={isSendingTelegram}
                className="flex-grow flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-450 text-white p-3 rounded-xl text-xs font-black transition shadow-xs cursor-pointer"
              >
                {isSendingTelegram ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {lang === 'id' ? 'Mengirim Data...' : '正在封包发送中...'}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {lang === 'id' ? 'Kirim ke Bot Telegram Sekarang' : '立即发送至 Telegram '}
                  </>
                )}
              </button>
            </div>
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
