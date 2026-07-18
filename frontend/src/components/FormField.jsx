import React from 'react';

export default function FormField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  error,
  options = [],
  placeholder = '',
  required = false,
  min,
  max,
  disabled = false,
  list,
}) {
  const inputClass = `w-full min-h-[44px] px-3.5 py-2 text-[15px] md:text-sm bg-panel dark:bg-panel-dark border rounded-xl outline-none transition-all ${
    error ? 'border-brand-red focus:border-brand-red focus:ring-1 focus:ring-brand-red' : 'border-gray-300 dark:border-edge-dark focus:border-accent focus:ring-1 focus:ring-accent'
  } ${disabled ? 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark cursor-not-allowed' : 'text-inkA dark:text-inkA-dark'}`;

  return (
    <div className="space-y-1.5 w-full">
      {label && (
        <label className="block text-xs font-semibold text-inkB dark:text-inkB-dark">
          {label} {required && <span className="text-brand-red font-bold">*</span>}
        </label>
      )}

      {type === 'select' ? (
        <select
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={inputClass}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`${inputClass} min-h-[80px] resize-y`}
        />
      ) : (
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          min={min}
          max={max}
          disabled={disabled}
          list={list}
          className={inputClass}
        />
      )}

      {error && <p className="text-[11px] font-medium text-brand-red leading-none">{error}</p>}
    </div>
  );
}
