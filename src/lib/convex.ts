import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | null = null;

function getConvexClient() {
  if (!client) {
    client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }

  return client;
}

export { getConvexClient };

export default new Proxy({} as ConvexHttpClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getConvexClient(), prop, receiver);
  },
});
