import { Whop } from "@whop/api";
import { env } from "./env";

// Only create Whop client if API key is available
export const whop = env.WHOP_API_KEY ? new Whop({ token: env.WHOP_API_KEY }) : null;
