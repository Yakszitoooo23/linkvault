"use client";

import React, { useRef, useState } from 'react';
import { bytesToMB } from '@/lib/format';

interface UploadBoxProps {
  id?: string;
  accept?: string;
  maxSizeMB?: number;
  onFileSelect?: (file: File) => void;
  onFileRemove?: () => void;
  label: string;
  description?: string;
  required?: boolean;
  className?: string;
  file?: File | null;
  preview?: string | null;
  aspectRatio?: string;
}

export function UploadBox({
  id,
  accept,
  maxSizeMB = 10,
  onFileSelect,
  onFileRemove,
  label,
  description,
  required = false,
  className = '',
  file,
  preview,
  aspectRatio = 'auto',
}: UploadBoxProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > maxSizeMB * 1024 * 1024) {
        alert(`File size must be less than ${maxSizeMB}MB`);
        return;
      }
      onFileSelect?.(selectedFile);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (droppedFile.size > maxSizeMB * 1024 * 1024) {
        alert(`File size must be less than ${maxSizeMB}MB`);
        return;
      }
      onFileSelect?.(droppedFile);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileRemove?.();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`upload-box ${className}`}>
      <input
        ref={fileInputRef}
        id={id}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="upload-input"
        required={required}
      />
      
      <div
        className={`upload-area ${dragActive ? 'upload-drag-active' : ''} ${file ? 'upload-has-file' : ''}`}
        onClick={handleClick}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        style={{ aspectRatio }}
      >
        {file ? (
          <div className="upload-preview">
            {preview ? (
              <img src={preview} alt="Preview" className="upload-preview-image" />
            ) : (
              <div className="upload-file-info">
                <div className="upload-file-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="upload-file-details">
                  <div className="upload-file-name">{file.name}</div>
                  <div className="upload-file-size">{bytesToMB(file.size)} MB</div>
                </div>
              </div>
            )}
            <button
              type="button"
              className="upload-replace-btn"
              onClick={handleRemove}
              aria-label="Replace file"
            >
              Replace
            </button>
          </div>
        ) : (
          <div className="upload-placeholder">
            <div className="upload-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="7,10 12,15 17,10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="upload-label">{label}</div>
            {description && (
              <div className="upload-description">{description}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}







