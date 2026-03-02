import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { AppConfig } from "./config";

export const authClient = createAuthClient({
  baseURL: AppConfig.url ?? "http://localhost:3000",
  plugins: [organizationClient()],
});
