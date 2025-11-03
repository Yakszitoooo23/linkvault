import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDownloadUrl } from "@/lib/storage";

export async function GET(_: NextRequest, { params }: { params: { purchaseId: string } }) {
  const p = await prisma.purchase.findUnique({
    where: { id: params.purchaseId },
    include: { product: true },
  });
  if (!p || p.status !== "paid") return new NextResponse("Not allowed", { status: 403 });

  // TODO: verify current user owns this purchase
  const url = await getDownloadUrl(p.product.fileKey, 600);
  await prisma.purchase.update({ where: { id: p.id }, data: { downloads: { increment: 1 } } });
  return NextResponse.json({ url });
}
