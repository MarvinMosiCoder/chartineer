import React from 'react';

export default function ToggleSwitch({ checked, onChange, label, isDark, disabled = false }) {
  return (
    <label
      className={`inline-flex items-center gap-2 select-none ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <span className="relative inline-flex h-5 w-9 flex-shrink-0 items-center">
        <input
          type="checkbox"
          checked={Boolean(checked)}
          onChange={onChange}
          disabled={disabled}
          className="peer sr-only"
        />
        <span
          className={`pointer-events-none absolute inset-0 rounded-full transition-colors duration-200 ease-in-out ${
            checked ? 'bg-[#2dd4bf]' : isDark ? 'bg-gray-700' : 'bg-slate-300'
          } peer-focus-visible:ring-2 peer-focus-visible:ring-[#2dd4bf] peer-focus-visible:ring-offset-2 ${
            isDark ? 'peer-focus-visible:ring-offset-skin-black' : 'peer-focus-visible:ring-offset-white'
          }`}
        />
        <span
          className={`pointer-events-none absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ease-in-out ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
      {label && (
        <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>{label}</span>
      )}
    </label>
  );
}
