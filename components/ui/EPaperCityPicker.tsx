'use client';

import { MapPin, ChevronDown, Check } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { EPAPER_CITY_OPTIONS } from '@/lib/constants/epaperCities';
import type { EPaperCityFilter } from '@/lib/utils/publicEpaperFilters';

type EPaperCityPickerProps = {
  value: EPaperCityFilter;
  onChange: (value: EPaperCityFilter) => void;
  language: 'hi' | 'en';
  className?: string;
};

const CITY_LABELS_HI = {
  all: 'सभी संस्करण',
  indore: 'इंदौर संस्करण',
  ujjain: 'उज्जैन संस्करण',
  mumbai: 'मुंबई संस्करण',
  delhi: 'डिजिटल संस्करण',
} as const;

const CITY_LABELS_EN = {
  all: 'All editions',
  indore: 'Indore Edition',
  ujjain: 'Ujjain Edition',
  mumbai: 'Mumbai Edition',
  delhi: 'Digital Edition',
} as const;

export default function EPaperCityPicker({
  value,
  onChange,
  language,
  className = '',
}: EPaperCityPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside or ESC key
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const labels = language === 'hi' ? CITY_LABELS_HI : CITY_LABELS_EN;

  const options = [
    { slug: 'all' as const, label: labels.all },
    ...EPAPER_CITY_OPTIONS.map((city) => ({
      slug: city.slug,
      label: labels[city.slug] || city.name,
    })),
  ];

  const getSelectedLabel = () => {
    return labels[value] || (value === 'all' ? labels.all : value);
  };

  const handleSelect = (slug: EPaperCityFilter) => {
    onChange(slug);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* City Pill Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`reader-focus-ring flex h-12 w-full items-center justify-between gap-2.5 rounded-full border border-gray-300 bg-white px-4 text-[13px] font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200 dark:hover:bg-zinc-800/80 sm:h-11 sm:text-sm ${className}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
          <span className="truncate">{getSelectedLabel()}</span>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
      </button>

      {/* Dropdown Overlay */}
      {isOpen && (
        <div 
          className="absolute left-0 mt-1.5 w-full min-w-[200px] z-[100] rounded-2xl border border-zinc-100 bg-white p-2 shadow-2xl dark:border-zinc-800/80 dark:bg-zinc-900/95 animate-in fade-in slide-in-from-top-1 duration-150"
          role="listbox"
        >
          <div className="flex flex-col gap-0.5">
            {options.map((opt) => {
              const isSelected = value === opt.slug;
              return (
                <button
                  key={opt.slug}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt.slug)}
                  className={`flex w-full items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-sm font-semibold transition cursor-pointer ${
                    isSelected
                      ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
                      : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
