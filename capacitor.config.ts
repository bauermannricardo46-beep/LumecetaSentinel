import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lumeceta.sentinel',
  appName: 'Lumeceta Sentinel',
  webDir: 'www',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  plugins: {
    // Use Capacitor's native HTTP stack for the Android APK.
    // This avoids WebView fetch/CORS failures when the APK talks to
    // the local Lumeceta backend over the LAN.
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
