import React from 'react';
import { motion } from 'motion/react';
import { Building } from '../types';
import { Calendar, User, MapPin, Clipboard, Check, Eye, Pencil, Trash } from 'lucide-react';
import { Language, translations } from '../languages';
import { isMediaVideo } from './AdminPanel';

interface BuildingCardProps {
  key?: React.Key | null;
  building: Building;
  onSelect: (building: Building) => void;
  lang: Language;
  isAdmin?: boolean;
  onEdit?: (building: Building) => void;
  onDelete?: (building: Building) => void;
  index?: number;
}

export default function BuildingCard({ 
  building, 
  onSelect, 
  lang,
  isAdmin = false,
  onEdit,
  onDelete,
  index
}: BuildingCardProps) {
  const t = translations[lang];
  const [copied, setCopied] = React.useState(false);

  // Parse media files
  const imageCount = building.gallery ? building.gallery.filter(item => !isMediaVideo(item)).length : 0;
  const videoCount = building.gallery ? building.gallery.filter(item => isMediaVideo(item)).length : 0;

  // Format record categorization names and badge styles
  const getBadgeConfig = () => {
    switch (building.category) {
      case 'survey':
        return {
          label: lang === 'id' ? '踩点 (Survei)' : '踩点数据',
          color: 'bg-teal-50 text-teal-700 border-teal-100',
          detailedType: lang === 'id' ? '【Data Survei】' : '【踩点数据】'
        };
      case 'line':
        return {
          label: lang === 'id' ? '测线 (Pengukuran)' : '测线数据',
          color: 'bg-sky-50 text-sky-700 border-sky-100',
          detailedType: lang === 'id' ? '【Data Pengukuran】' : '【测线数据】'
        };
      case 'installation':
        return {
          label: lang === 'id' ? '安装 (Instalasi)' : '安装数据',
          color: 'bg-indigo-50 text-indigo-700 border-indigo-100',
          detailedType: lang === 'id' ? '【Data Instalasi】' : '【安装数据】'
        };
      default:
        return {
          label: building.category,
          color: 'bg-slate-50 text-slate-700 border-slate-100',
          detailedType: `【${building.category}】`
        };
    }
  };

  const badge = getBadgeConfig();

  // Create a clean shareable text copy of the data logs
  const handleCopyRecord = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Draft specific details based on type
    let specDetails = '';
    if (building.category === 'survey') {
      specDetails = `${lang === 'id' ? 'Jalur Jarak Jauh' : '长途线路'}: ${building.longDistanceLines || 0} ${lang === 'id' ? 'Batang' : '根'} | ${lang === 'id' ? 'Jalur Lokal' : '本地线路'}: ${building.localLines || 0} ${lang === 'id' ? 'Batang' : '根'}`;
    } else if (building.category === 'line') {
      specDetails = `${lang === 'id' ? 'Port Jauh' : '长途电话数'}: ${building.longDistancePhones || 0} ${lang === 'id' ? 'Unit' : '个'} | ${lang === 'id' ? 'Port Lokal' : '本地电话数'}: ${building.localPhones || 0} ${lang === 'id' ? 'Unit' : '个'}`;
    } else if (building.category === 'installation') {
      specDetails = `${lang === 'id' ? 'Jalur Pasang' : '安装线路'}: ${building.installedLines || 0} ${lang === 'id' ? 'Batang' : '根'} | ${lang === 'id' ? 'Durasi' : '时长'}: ${building.totalDuration || 0} ${lang === 'id' ? 'Jam' : '小时'}`;
    }

    const shareText = `[${badge.label}] ${building.name}
${lang === 'id' ? 'Pelaksana/Operator' : '操作人'}: ${building.operator || 'N/A'}
${lang === 'id' ? 'Waktu Pengukuran' : '操作时间'}: ${building.operationTime || 'N/A'}
${lang === 'id' ? 'Wilayah Lokasi' : '地点'}: ${building.location || 'N/A'}
${specDetails ? `${lang === 'id' ? 'Parameter Teknis' : '指标数据'}: ${specDetails}\n` : ''}${lang === 'id' ? 'Catatan Lapangan' : '描述'}: ${building.description || 'N/A'}`;

    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const firstImage = building.gallery && building.gallery.length > 0 
    ? (typeof building.gallery[0] === 'string' ? building.gallery[0] : (building.gallery[0] as any).url)
    : 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=400&q=80';

  return (
    <div
      onClick={() => onSelect(building)}
      className="bg-white rounded-2xl border border-slate-100 hover:border-blue-500/20 shadow-xs hover:shadow-lg transition-all duration-300 overflow-hidden cursor-pointer flex flex-col md:flex-row gap-5 p-5 relative"
    >
      {/* Aspect Ratio Media Preview Thumbnail */}
      <div className="md:w-44 w-full h-32 rounded-xl overflow-hidden shrink-0 bg-slate-50 relative border border-slate-100">
        <img
          src={firstImage}
          alt={building.name}
          className="w-full h-full object-cover select-none"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
        <div className="absolute top-2 left-2 px-2.5 py-1 text-[10px] font-black rounded-lg border uppercase tracking-wider backdrop-blur-md bg-white/90 shadow-2xs">
          {building.category}
        </div>
      </div>

      {/* Narrative block */}
      <div className="flex-grow flex flex-col justify-between gap-3 min-w-0">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-sans font-bold text-slate-900 text-base leading-tight truncate flex items-center gap-2">
              {index !== undefined && (
                <span className="inline-flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-100 font-mono text-[10px] sm:text-xs font-black min-w-[20px] h-5 px-1.5 rounded-lg select-none">
                  #{index}
                </span>
              )}
              <span className="truncate">{building.name}</span>
            </h3>
            
            {/* Action controls */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleCopyRecord}
                title={t.copyRecordBtn}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-800 transition cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Clipboard className="w-4 h-4" />}
              </button>
              
              {isAdmin && onEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(building);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-blue-600 transition cursor-pointer"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              {isAdmin && onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(building);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-rose-600 transition cursor-pointer"
                >
                  <Trash className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
            {building.description}
          </p>
        </div>

        {/* Bottom Metadata Badges */}
        <div className="flex flex-col gap-2 pt-2 border-t border-slate-50">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-semibold text-slate-700">{building.operator || 'N/A'}</span>
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{building.operationTime || 'N/A'}</span>
            </span>
            <span className="flex items-center gap-1 truncate max-w-[200px]">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span className="truncate">{building.location}</span>
            </span>
          </div>

          {/* Media list bar buttons */}
          <div className="flex items-center justify-between text-[11px] gap-2 mt-1">
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[9px] font-extrabold rounded-md border uppercase ${badge.color}`}>
              {badge.label}
            </span>
            <span className="text-slate-400 inline-flex items-center gap-1 text-[11px]">
              <Eye className="w-3.5 h-3.5 text-slate-300" />
              <span>
                {t.previewMediaTip
                  ?.replace('{images}', String(imageCount))
                  ?.replace('{videos}', String(videoCount))}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
