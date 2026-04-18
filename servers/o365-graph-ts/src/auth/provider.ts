import type { AuthenticationProvider } from "@microsoft/microsoft-graph-client";
import { acquireToken, type AuthContext } from "./msal.js";

export class MsalAuthenticationProvider implements AuthenticationProvider {
  constructor(private readonly ctx: AuthContext) {}

  async getAccessToken(): Promise<string> {
    return acquireToken(this.ctx);
  }
}
