import React from 'react';

interface TextareaProps {
  id?: string;
  name?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  required?: boolean;
  disabled?: boolean;
  rows?: number;
  maxLength?: number;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function Textarea({
  id,
  name,
  placeholder,
  value,
  onChange,
  onBlur,
  required = false,
  disabled = false,
  rows = 4,
  maxLength,
  className = '',
  'aria-describedby': ariaDescribedby,
  'aria-invalid': ariaInvalid,
}: TextareaProps) {
  return (
    <textarea
      id={id}
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      required={required}
      disabled={disabled}
      rows={rows}
      maxLength={maxLength}
      className={`form-textarea ${className}`}
      aria-describedby={ariaDescribedby}
      aria-invalid={ariaInvalid}
    />
  );
}








