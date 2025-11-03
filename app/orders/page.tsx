import { prisma } from "@/lib/db";
import { PageToolbar } from "@/components/layout/PageToolbar";
import { OrdersTable } from "@/components/table/OrdersTable";
import { Button } from "@/components/ui/Button";
import { ArrowLeftIcon, RefreshIcon, SearchIcon, DownloadIcon } from "@/components/ui/Icon";
import { OrdersClient } from "./OrdersClient";

interface OrderRow {
  id: string;
  productTitle: string;
  productId: string;
  amountCents: number;
  buyerId: string;
  createdAt: string;
}

interface OrdersPageProps {
  searchParams: {
    page?: string;
    pageSize?: string;
    q?: string;
  };
}

async function getOrders(
  page: number,
  pageSize: number,
  searchQuery?: string
): Promise<{ rows: OrderRow[]; total: number }> {
  try {
    const take = pageSize;
    const skip = (page - 1) * pageSize;

    // Build where clause for search
    const where = searchQuery
      ? {
          OR: [
            {
              product: {
                title: {
                  contains: searchQuery,
                  mode: "insensitive" as const,
                },
              },
            },
            {
              buyer: {
                whopUserId: searchQuery,
              },
            },
          ],
        }
      : {};

    // Get orders with pagination
    const orders = await prisma.purchase.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: {
        product: true,
        buyer: true,
      },
    });

    // Get total count
    const total = await prisma.purchase.count({ where });

    // Map to our row format
    const rows: OrderRow[] = orders.map((order) => ({
      id: order.id,
      productTitle: order.product.title,
      productId: order.product.id,
      amountCents: order.amountCents,
      buyerId: order.buyer.whopUserId,
      createdAt: order.createdAt.toISOString(),
    }));

    return { rows, total };
  } catch (error) {
    console.error("Failed to fetch orders:", error);
    return { rows: [], total: 0 };
  }
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const page = parseInt(searchParams.page || "1", 10);
  const pageSize = parseInt(searchParams.pageSize || "20", 10);
  const searchQuery = searchParams.q;

  const { rows, total } = await getOrders(page, pageSize, searchQuery);

  return (
    <div>
      <PageToolbar
        leftActions={
          <div className="toolbar-left-actions">
            <Button variant="secondary" aria-label="Back to experience">
              <ArrowLeftIcon size={16} />
              Back
            </Button>
            <Button variant="secondary" aria-label="Refresh orders">
              <RefreshIcon size={16} />
              Refresh Orders
            </Button>
          </div>
        }
        rightActions={
          <OrdersClient 
            initialSearch={searchQuery}
            initialPageSize={pageSize}
          />
        }
      />

      <OrdersTable
        rows={rows}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </div>
  );
}
