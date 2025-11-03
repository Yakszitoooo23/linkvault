import React from 'react';

interface InputProps {
  id?: string;
  name?: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url';
  placeholder?: string;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  required?: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function Input({
  id,
  name,
  type = 'text',
  placeholder,
  value,
  onChange,
  onBlur,
  required = false,
  disabled = false,
  min,
  max,
  step,
  maxLength,
  className = '',
  'aria-describedby': ariaDescribedby,
  'aria-invalid': ariaInvalid,
}: InputProps) {
  return (
    <input
      id={id}
      name={name}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      required={required}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      maxLength={maxLength}
      className={`form-input ${className}`}
      aria-describedby={ariaDescribedby}
      aria-invalid={ariaInvalid}
    />
  );
}





