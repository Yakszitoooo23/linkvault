"use client";

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { PlusIcon } from '@/components/ui/Icon';

export function ExperienceClient() {
  const router = useRouter();

  const handleCreateProduct = () => {
    router.push('/products/new');
  };

  return (
    <>
      <Button variant="primary" onClick={handleCreateProduct} aria-label="Create Product">
        <PlusIcon size={18} />
        Create Product
      </Button>
    </>
  );
}
