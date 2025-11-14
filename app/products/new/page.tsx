import { CreateProductForm } from './CreateProductForm';

type PageProps = {
  searchParams?: { companyId?: string };
};

export default function NewProductPage({ searchParams }: PageProps) {
  const companyId = searchParams?.companyId;
  
  // Log for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log("[NewProductPage] Received searchParams:", { companyId, allParams: searchParams });
  }

  return <CreateProductForm companyId={companyId} />;
}
