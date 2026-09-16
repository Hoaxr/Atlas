import React from 'react';

export const SettingsSection = ({ children, className = '' }) => {
  return (
    <div className={`glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 shadow-sm ${className}`}>
      {children}
    </div>
  );
};

export const SettingsHeader = ({ title, description, icon: Icon, children }) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div>
        <h2 className="text-lg sm:text-xl font-bold font-display text-slate-100 flex items-center gap-2.5">
          {Icon && <Icon className="w-5 h-5 text-cyan-400 shrink-0" />}
          {title}
        </h2>
        {description && (
          <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="self-end sm:self-auto shrink-0">
          {children}
        </div>
      )}
    </div>
  );
};

export const SettingsGroup = ({ children, className = '' }) => {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 ${className}`}>
      {children}
    </div>
  );
};

export const SettingsLabel = ({ title, icon: Icon, required }) => {
  return (
    <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
      {Icon && <Icon className="w-3.5 h-3.5 text-cyan-400" />}
      {title}
      {required && <span className="text-rose-400">*</span>}
    </label>
  );
};

export const SettingsHelper = ({ text }) => {
  if (!text) return null;
  return (
    <p className="text-xs text-slate-400 mt-2">
      {text}
    </p>
  );
};
