import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.peaportfolio.app",
  appName: "PEA",
  webDir: "dist",
  server: {
    androidScheme: "https"
  }
};

export default config;
