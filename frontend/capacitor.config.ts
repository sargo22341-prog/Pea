import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.peaportfolio.app",
  appName: "PEA",
  webDir: "dist",
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
      backgroundColor: "#071014"
    },
    SystemBars: {
      insetsHandling: "disable",
      style: "DARK"
    }
  },
  server: {
    androidScheme: "https"
  }
};

export default config;
