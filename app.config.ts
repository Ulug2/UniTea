import { ConfigContext, ExpoConfig } from "expo/config";

// app.json holds the static config. google-services.json is gitignored (not
// committed), so EAS Build — which only uploads git-tracked files — can't see
// it at the path app.json points to. The fix is the EAS-documented one: a
// file-type secret env var (GOOGLE_SERVICES_JSON, already configured in the
// "production" EAS environment) gets hydrated to a local path on the builder
// and exposed via process.env at config-resolution time. Locally (no EAS env
// var set), this falls back to app.json's own static path, which is what
// `expo run:android` and other local builds already use.
export default ({ config }: ConfigContext): ExpoConfig => {
  // `config` is typed Partial<ExpoConfig> here even though app.json always
  // supplies the required fields (name, slug, ...) at runtime — cast rather
  // than re-declare them, since this file only needs to override one field.
  return {
    ...config,
    android: {
      ...config.android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
    },
  } as ExpoConfig;
};
