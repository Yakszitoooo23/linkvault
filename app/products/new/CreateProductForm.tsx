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

interface CreateProductFormProps {
  companyId: string | undefined;
}

export function CreateProductForm({ companyId }: CreateProductFormProps) {
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

  const uploadDigitalFile = async (file: File): Promise<string> => {
    const isDevMode = process.env.NODE_ENV === 'development';
    
    const fileKey = `files/${crypto.randomUUID()}-${file.name}`;
    
    if (isDevMode && process.env.DEV_NO_STORAGE === "true") {
      // In dev mode with no storage, just return a mock fileKey
      return `dev-${Date.now()}-${file.name}`;
    } else {
      // Upload file directly via API route (handles S3/R2 upload server-side)
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileKey', fileKey);

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to upload file');
      }

      const uploadData = await uploadResponse.json();
      return uploadData.fileKey;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent submission if companyId is missing
    if (!companyId) {
      setToast({
        show: true,
        message: 'Missing companyId. Please open this page from the Whop dashboard.',
        type: 'error',
      });
      return;
    }
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      let fileKey: string;
      let imageKey: string | undefined;
      let finalImageUrl: string | undefined;

      if (digitalFile) {
        fileKey = await uploadDigitalFile(digitalFile);
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
          imageKey = undefined;
        }
      }

      // Log before submitting
      console.log("[CreateProductForm] Submitting product with companyId:", companyId);
      
      const requestBody = {
        title: formData.name.trim(),
        description: formData.description.trim(),
        priceCents: Math.round(parseFloat(formData.price) * 100),
        currency: 'USD',
        fileKey,
        imageKey,
        imageUrl: finalImageUrl,
        companyId, // Include companyId from URL
      };
      
      console.log("[CreateProductForm] Request body:", {
        ...requestBody,
        fileKey: requestBody.fileKey ? `${requestBody.fileKey.substring(0, 20)}...` : null,
        imageKey: requestBody.imageKey ? `${requestBody.imageKey.substring(0, 20)}...` : null,
      });

      // Create product
      const productResponse = await fetch("/api/products/create-with-plan", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!productResponse.ok) {
        const errorData = await productResponse.json().catch(() => ({}));
        console.error('Product creation failed:', errorData);
        throw new Error(
          (errorData && typeof errorData === 'object' && 'error' in errorData)
            ? String(errorData.error)
            : 'Failed to create product'
        );
      }

      const responseData = await productResponse.json().catch(() => ({}));
      const createdProduct = responseData?.product;

      setToast({
        show: true,
        message: createdProduct?.title
          ? `Product "${createdProduct.title}" created successfully!`
          : 'Product created successfully!',
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
        message: error instanceof Error ? error.message : 'Failed to create product. Please try again.',
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
  
  const canSubmit = isFormValid && companyId && !isSubmitting;

  return (
    <div>
      {!companyId && (
        <div className="dashboard-error" role="alert" style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#fee', border: '1px solid #fcc', borderRadius: '4px' }}>
          <strong>Missing companyId.</strong> Please open this page from the Whop dashboard.
        </div>
      )}
      
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
              disabled={!canSubmit}
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

