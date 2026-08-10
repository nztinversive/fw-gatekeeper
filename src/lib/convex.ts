import 'server-only';

import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { ConvexHttpClient } from "convex/browser";

const LOCAL_DEMO_CONVEX_URL = "https://demo-fw-gatekeeper.convex.cloud";

function isServerDemoWriteMode() {
  return process.env.NODE_ENV !== "production" && process.env.FW_DEMO_WRITE_MODE === "1";
}

function getConvexUrl() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || (isServerDemoWriteMode() ? LOCAL_DEMO_CONVEX_URL : "");
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required to use Convex.");
  }

  return convexUrl;
}

async function getRequestConvexClient() {
  const client = new ConvexHttpClient(getConvexUrl());
  const token = await convexAuthNextjsToken();
  if (token) {
    client.setAuth(token);
  }
  return client;
}

const authenticatedMethods = new Set(['query', 'mutation', 'action']);

const convex = new Proxy({} as ConvexHttpClient, {
  get(_target, property) {
    if (typeof property !== 'string' || !authenticatedMethods.has(property)) {
      throw new Error(`Unsupported Convex server client operation: ${String(property)}`);
    }

    return async (...args: unknown[]) => {
      const client = await getRequestConvexClient();
      const method = Reflect.get(client, property) as (...methodArgs: unknown[]) => unknown;
      return Reflect.apply(method, client, args);
    };
  },
});

export default convex;
