import { Client } from "@microsoft/microsoft-graph-client";
import { MsalAuthenticationProvider } from "../auth/provider.js";
import type { AuthContext } from "../auth/msal.js";

export function createGraphClient(auth: AuthContext): Client {
  return Client.initWithMiddleware({
    authProvider: new MsalAuthenticationProvider(auth),
    defaultVersion: "v1.0",
  });
}
