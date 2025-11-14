import { CreateProductForm } from './CreateProductForm';

type PageProps = {
  searchParams?: { companyId?: string };
};

export default function NewProductPage({ searchParams }: PageProps) {
  const companyId = searchParams?.companyId;

  return <CreateProductForm companyId={companyId} />;
}
