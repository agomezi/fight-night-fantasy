// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions run under Deno, with imports the app's resolver cannot follow.
    ignores: ['dist/*', 'supabase/functions/*'],
  },
]);
