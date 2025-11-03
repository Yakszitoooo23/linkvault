import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const searchQuery = searchParams.get('q');
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

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

    // Get orders (cap to 2000 for safety)
    const orders = await prisma.purchase.findMany({
      where,
      take: Math.min(pageSize * 100, 2000), // Cap at 2000 rows
      orderBy: { createdAt: "desc" },
      include: {
        product: true,
        buyer: true,
      },
    });

    // Generate CSV content
    const csvHeaders = [
      'product_title',
      'product_id', 
      'amount',
      'buyer_id',
      'purchased_at'
    ];

    const csvRows = orders.map((order) => [
      `"${order.product.title.replace(/"/g, '""')}"`, // Escape quotes
      order.product.id,
      order.amountCents / 100, // Convert cents to dollars
      order.buyer.whopUserId,
      order.createdAt.toISOString()
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n');

    // Return CSV response
    const response = new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="orders-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

    return response;
  } catch (error) {
    console.error('CSV export error:', error);
    return NextResponse.json(
      { error: 'Failed to export orders' },
      { status: 500 }
    );
  }
}





