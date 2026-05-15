import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.peaportfolio.app",
  appName: "PEA",
  webDir: "dist",
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  },
  server: {
    androidScheme: "https"
  }
};

export default config;
