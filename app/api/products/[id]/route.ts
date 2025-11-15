import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const productId = params.id;

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        title: true,
        description: true,
        priceCents: true,
        imageKey: true,
        imageUrl: true,
        whopPurchaseUrl: true,
        createdAt: true,
        isActive: true,
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (e: any) {
    console.error("Product fetch error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch product" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const productId = params.id;

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!existingProduct) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Delete the product
    await prisma.product.delete({
      where: { id: productId },
    });

    return NextResponse.json({ message: "Product deleted successfully" });
  } catch (e: any) {
    console.error("Product deletion error:", e);
    
    // Handle specific Prisma errors
    if (e.code === 'P2025') {
      return NextResponse.json({ 
        error: "Product not found" 
      }, { status: 404 });
    }
    
    if (e.code === 'P2003') {
      return NextResponse.json({ 
        error: "Cannot delete product: it has associated purchases" 
      }, { status: 400 });
    }
    
    // Generic error handling
    return NextResponse.json({ 
      error: e?.message || "An unexpected error occurred while deleting the product" 
    }, { status: 500 });
  }
}
