import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | null = null;

export function getConvexClient() {
  const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!deploymentUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required to create the Convex client.");
  }

  client ??= new ConvexHttpClient(deploymentUrl);
  return client;
}

const convex = new Proxy({} as ConvexHttpClient, {
  get(_target, property) {
    const convexClient = getConvexClient();
    const value = convexClient[property as keyof ConvexHttpClient];

    return typeof value === "function" ? value.bind(convexClient) : value;
  },
});

export default convex;
