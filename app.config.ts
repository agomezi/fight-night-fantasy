import type { ConfigContext, ExpoConfig } from "expo/config";

// app.json holds the static config; the identifiers come from the environment
// (.env locally, EAS environment variables on build servers) so they stay out
// of the repo. See .env.example.
//
// EAS CLI skips .env when it evaluates this file, so load it here; variables
// already set (e.g. by EAS) win. On EAS build servers there is no .env.
try {
  process.loadEnvFile(".env");
} catch {}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} — copy .env.example to .env and fill it in`);
  return value;
}

// The iOS URL scheme Google sign-in redirects to is the iOS client ID reversed.
function googleIosUrlScheme(clientId: string): string {
  return clientId.split(".").reverse().join(".");
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const bundleId = required("APP_BUNDLE_ID");

  return {
    ...config,
    name: config.name!,
    slug: config.slug!,
    ios: { ...config.ios, bundleIdentifier: bundleId },
    android: { ...config.android, package: bundleId },
    plugins: [
      ...(config.plugins ?? []),
      [
        "@react-native-google-signin/google-signin",
        { iosUrlScheme: googleIosUrlScheme(required("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID")) },
      ],
    ],
    extra: {
      ...config.extra,
      eas: { projectId: required("EAS_PROJECT_ID") },
    },
  };
};
