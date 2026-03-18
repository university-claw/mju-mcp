import { resolveLmsRuntimeConfig, type LmsRuntimeConfig } from "../config.js";
import { MjuLmsSsoClient } from "../lms/sso-client.js";

export interface AppContext {
  lmsConfig: LmsRuntimeConfig;
  createLmsClient(): MjuLmsSsoClient;
}

export function createAppContext(
  lmsConfig: LmsRuntimeConfig = resolveLmsRuntimeConfig()
): AppContext {
  return {
    lmsConfig,
    createLmsClient() {
      return new MjuLmsSsoClient(lmsConfig);
    }
  };
}
