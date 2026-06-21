import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | null = null;

export function getConvexClient() {
  if (!client) {
    client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }

  return client;
}

const convex = new Proxy({} as ConvexHttpClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getConvexClient(), prop, receiver);
  },
});

export default convex;
