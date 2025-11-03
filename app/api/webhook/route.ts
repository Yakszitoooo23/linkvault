import { NextRequest, NextResponse } from "next/server";
import { makeWebhookValidator } from "@whop/api";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const validator = env.WHOP_WEBHOOK_SECRET
  ? makeWebhookValidator({
      secret: env.WHOP_WEBHOOK_SECRET,
    })
  : null;

export async function POST(req: NextRequest) {
  if (!validator) {
    return new NextResponse("Webhook secret not configured", { status: 500 });
  }

  const raw = await req.text();
  const sig = req.headers.get("whop-signature") || "";
  let event: any;

  try {
    event = validator.verify(raw, sig);
  } catch {
    return new NextResponse("invalid signature", { status: 400 });
  }

  // Acknowledge fast, do work async
  queueMicrotask(async () => {
    try {
      if (event.type === "payment.succeeded") {
        const { payment_id, amount, currency, buyer, metadata } = event.data;
        const productId = metadata?.productId as string | undefined;
        if (!productId) return;

        const buyerUser = await prisma.user.upsert({
          where: { whopUserId: buyer.id },
          create: { whopUserId: buyer.id, role: "buyer" },
          update: {},
        });

        await prisma.purchase.create({
          data: {
            productId,
            buyerId: buyerUser.id,
            whopPaymentId: payment_id,
            amountCents: amount,
            status: "paid",
          },
        });
      }
      if (event.type === "payment.refunded") {
        const { payment_id } = event.data;
        await prisma.purchase.update({
          where: { whopPaymentId: payment_id },
          data: { status: "refunded" },
        });
      }
    } catch (e) {
      console.error("webhook worker error", e);
    }
  });

  return new NextResponse(null, { status: 200 });
}
