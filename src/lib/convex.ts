import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | null = null;

export function getConvexClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required to call Convex APIs.");
  }
  client ??= new ConvexHttpClient(url);
  return client;
}

const convex = new Proxy({} as ConvexHttpClient, {
  get(_target, prop) {
    const activeClient = getConvexClient();
    const value = activeClient[prop as keyof ConvexHttpClient];
    return typeof value === "function" ? value.bind(activeClient) : value;
  },
});

export default convex;
