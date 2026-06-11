import React from 'react';
import { Category } from '../types';
import { Search, Grid } from 'lucide-react';
import { Language, translations } from '../languages';

interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  categories: Category[];
  lang: Language;
}

export default function FilterBar({
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  categories,
  lang,
}: FilterBarProps) {
  const t = translations[lang];

  return (
    <div id="filter-bar" className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 flex flex-col gap-4">
      {/* Search Input Row */}
      <div className="relative">
        <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-400">
          <Search className="w-4.5 h-4.5" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.filterPlaceholder}
          className="w-full bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-hidden focus:ring-1 focus:ring-amber-500 focus:bg-white transition-all"
        />
      </div>

      {/* Category Filter Chips */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
          <Grid className="w-3.5 h-3.5 text-slate-400" />
          {t.filterLabel}
        </span>
        <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategory('Semua')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition ${
              selectedCategory === 'Semua'
                ? 'bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/10'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {t.filterAll}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.name)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition ${
                selectedCategory === cat.name
                  ? 'bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/10'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
