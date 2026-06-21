import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | null = null;

export function getConvexClient() {
  if (!client) {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      throw new Error("NEXT_PUBLIC_CONVEX_URL is required to use Convex.");
    }
    client = new ConvexHttpClient(convexUrl);
  }

  return client;
}

const convex = new Proxy({} as ConvexHttpClient, {
  get(_target, property, receiver) {
    return Reflect.get(getConvexClient(), property, receiver);
  },
});

export default convex;
