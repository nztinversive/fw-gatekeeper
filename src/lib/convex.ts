import { ConvexHttpClient } from "convex/browser";

const LOCAL_DEMO_CONVEX_URL = "https://demo-fw-gatekeeper.convex.cloud";

let client: ConvexHttpClient | null = null;

function isServerDemoWriteMode() {
  return process.env.NODE_ENV !== "production" && process.env.FW_DEMO_WRITE_MODE === "1";
}

export function getConvexClient() {
  if (!client) {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || (isServerDemoWriteMode() ? LOCAL_DEMO_CONVEX_URL : "");
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
