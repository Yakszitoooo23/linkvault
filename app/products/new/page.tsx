"use client";

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { UploadBox } from '@/components/ui/UploadBox';
import { Toast } from '@/components/ui/Toast';
import { ArrowLeftIcon } from '@/components/ui/Icon';

interface FormData {
  name: string;
  price: string;
  description: string;
}

interface FormErrors {
  name?: string;
  price?: string;
  description?: string;
  digitalFile?: string;
}

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function CreateProductPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    name: '',
    price: '',
    description: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [digitalFile, setDigitalFile] = useState<File | null>(null);
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'success' });

  const imageInputRef = useRef<HTMLInputElement>(null);
  const digitalInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear error when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleImageSelect = (file: File) => {
    setImageFile(file);
    
    // Create preview for image files
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageRemove = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleDigitalFileSelect = (file: File) => {
    setDigitalFile(file);
    
    // Clear error when file is selected
    if (errors.digitalFile) {
      setErrors(prev => ({ ...prev, digitalFile: undefined }));
    }
  };

  const handleDigitalFileRemove = () => {
    setDigitalFile(null);
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Product name is required';
    } else if (formData.name.length > 80) {
      newErrors.name = 'Product name must be 80 characters or less';
    }

    const price = parseFloat(formData.price);
    if (!formData.price.trim()) {
      newErrors.price = 'Price is required';
    } else if (isNaN(price) || price < 1) {
      newErrors.price = 'Price must be at least $1.00';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.length > 2000) {
      newErrors.description = 'Description must be 2000 characters or less';
    }

    if (!digitalFile) {
      newErrors.digitalFile = 'Digital product file is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const uploadFile = async (file: File, isImage: boolean = false): Promise<string> => {
    const isDevMode = process.env.NODE_ENV === 'development';
    
    if (isDevMode) {
      // In dev mode, just return a mock fileKey
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileKey: `dev-${Date.now()}-${file.name}` }),
      });
      const uploadData = await uploadResponse.json();
      return uploadData.fileKey;
    } else {
      // Production mode: upload to S3
      const fileExtension = file.name.split('.').pop();
      const fileKey = isImage 
        ? `${crypto.randomUUID()}-cover.${fileExtension}`
        : `${crypto.randomUUID()}-${file.name}`;

      // Get pre-signed URL
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileKey }),
      });
      const uploadData = await uploadResponse.json();

      // Upload file to S3
      await fetch(uploadData.url, {
        method: 'PUT',
        body: file,
      });

      return fileKey;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      let fileKey: string;
      let imageKey: string | undefined;
      let finalImageUrl: string | undefined;

      if (digitalFile) {
        fileKey = await uploadFile(digitalFile, false);
      } else {
        throw new Error('Digital file is required');
      }

      // Upload cover image if provided
      if (imageFile) {
        try {
          const formData = new FormData();
          formData.append('file', imageFile);
          formData.append('fileName', imageFile.name);
          formData.append('contentType', imageFile.type);

          const imageResponse = await fetch('/api/upload-image', {
            method: 'POST',
            body: formData,
          });

          if (!imageResponse.ok) {
            throw new Error('Failed to upload image');
          }

          const imageData = await imageResponse.json();
          finalImageUrl = imageData.url;
          // Store fileKey so images can be retrieved via /api/images
          if (imageData.fileKey) {
            imageKey = imageData.fileKey;
          }
        } catch (imageError) {
          console.error('Error uploading image:', imageError);
          // Don't block product creation if image upload fails
          // Fall back to legacy imageKey
          imageKey = await uploadFile(imageFile, true);
        }
      }

      // Create product
      const productResponse = await fetch('/api/products/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.name.trim(),
          description: formData.description.trim(),
          priceCents: Math.round(parseFloat(formData.price) * 100),
          currency: 'USD',
          fileKey,
          imageKey,
          imageUrl: finalImageUrl,
        }),
      });

      if (!productResponse.ok) {
        const errorData = await productResponse.json();
        console.error('Product creation failed:', errorData);
        throw new Error(errorData.error || 'Failed to create product');
      }

      // Show success toast
      setToast({
        show: true,
        message: 'Product created successfully!',
        type: 'success',
      });

      // Navigate back to homepage immediately - router.push will trigger a refresh
      setTimeout(() => {
        router.push('/');
        router.refresh(); // Force refresh to show new product
      }, 1000);

    } catch (error) {
      console.error('Error creating product:', error);
      setToast({
        show: true,
        message: 'Failed to create product. Please try again.',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    router.push('/');
  };

  const isFormValid = formData.name.trim() && 
                     formData.price.trim() && 
                     parseFloat(formData.price) >= 1 && 
                     formData.description.trim() && 
                     digitalFile;

  return (
    <div>
      <div className="create-product-container">
        <div className="create-product-header">
          <Button variant="secondary" onClick={handleBack} aria-label="Back to experience">
            <ArrowLeftIcon size={16} />
            Back
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="create-product-form">
          <div className="form-grid">
            {/* Left Column - Image Upload */}
            <div className="form-left">
              <div className="form-section">
                <Label htmlFor="image-upload">Upload product image</Label>
                <UploadBox
                  id="image-upload"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  maxSizeMB={3}
                  onFileSelect={handleImageSelect}
                  onFileRemove={handleImageRemove}
                  label="Upload product image"
                  description="PNG, JPG, WebP up to 3MB"
                  file={imageFile}
                  preview={imagePreview}
                  aspectRatio="4/3"
                />
              </div>
            </div>

            {/* Right Column - Form Fields */}
            <div className="form-right">
              <div className="form-section">
                <Label htmlFor="name" required>
                  Name
                </Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Enter product name"
                  value={formData.name}
                  onChange={handleInputChange}
                  maxLength={80}
                  aria-describedby={errors.name ? 'name-error' : undefined}
                  aria-invalid={!!errors.name}
                />
                {errors.name && (
                  <div id="name-error" className="form-error" role="alert">
                    {errors.name}
                  </div>
                )}
              </div>

              <div className="form-section">
                <Label htmlFor="price" required>
                  Price (USD)
                </Label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  placeholder="0.00"
                  value={formData.price}
                  onChange={handleInputChange}
                  min={1}
                  step={0.01}
                  aria-describedby={errors.price ? 'price-error' : 'price-help'}
                  aria-invalid={!!errors.price}
                />
                <div id="price-help" className="form-help">
                  * Whop fee + App fee will be subtracted from this price
                </div>
                {errors.price && (
                  <div id="price-error" className="form-error" role="alert">
                    {errors.price}
                  </div>
                )}
              </div>

              <div className="form-section">
                <Label htmlFor="description" required>
                  Description
                </Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Describe your product in detail..."
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={6}
                  maxLength={2000}
                  aria-describedby={errors.description ? 'description-error' : 'description-help'}
                  aria-invalid={!!errors.description}
                />
                <div id="description-help" className="form-help">
                  {formData.description.length}/2000 characters
                </div>
                {errors.description && (
                  <div id="description-error" className="form-error" role="alert">
                    {errors.description}
                  </div>
                )}
              </div>

              <div className="form-section">
                <Label htmlFor="digital-file" required>
                  Upload digital product
                </Label>
                <UploadBox
                  id="digital-file"
                  accept=".pdf,.zip,.docx,.pptx,.mp4,.mov,.mp3"
                  maxSizeMB={50}
                  onFileSelect={handleDigitalFileSelect}
                  onFileRemove={handleDigitalFileRemove}
                  label="Upload digital product"
                  description="PDF, ZIP, DOCX, PPTX, MP4, MOV, MP3 up to 50MB"
                  required
                  file={digitalFile}
                />
                {errors.digitalFile && (
                  <div className="form-error" role="alert">
                    {errors.digitalFile}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="form-actions">
            <Button
              type="submit"
              variant="primary"
              disabled={!isFormValid || isSubmitting}
              className="create-product-btn"
            >
              {isSubmitting ? 'Creating...' : 'Create Product'}
            </Button>
          </div>
        </form>
      </div>

      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(prev => ({ ...prev, show: false }))}
        />
      )}
    </div>
  );
}



