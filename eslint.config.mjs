// @ts-check
import nextConfig from "eslint-config-next"

/**
 * ESLint flat config for Coron Grill Diners POS.
 *
 * eslint-config-next exports a 3-element flat config array. The second
 * element (index 1) registers @typescript-eslint as a plugin. We pull that
 * reference out and re-declare it in our override block so the plugin is
 * explicitly available to our custom rules regardless of which ESLint runner
 * (local CLI vs. Vercel's `next build` lint pass) resolves the config.
 */

// Extract the @typescript-eslint plugin that eslint-config-next already bundles.
// This avoids adding a direct devDependency on @typescript-eslint/eslint-plugin
// while still making the plugin object available to our rules block.
const tsPlugin = nextConfig.find((c) => c.plugins?.["@typescript-eslint"])
  ?.plugins?.["@typescript-eslint"]

/** @type {import("eslint").Linter.Config[]} */
const config = [
  // ── Ignore generated / build output ──────────────────────────────────────
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "lib/generated/**",   // Prisma-generated client — never lint this
      "public/**",
      "*.config.ts",         // tailwind.config.ts, postcss.config.ts etc.
      "prisma.config.ts",    // Prisma config — has intentional type workaround
    ],
  },

  // ── Next.js recommended (covers TS, React, hooks, next/image, etc.) ──────
  ...nextConfig,

  // ── Project-specific overrides ────────────────────────────────────────────
  {
    // Explicitly register the plugin so our @typescript-eslint/* rules below
    // are resolvable in all ESLint execution contexts (local CLI, next build,
    // Vercel CI). Without this, flat config runners that don't inherit the
    // plugin from the parent array entry will throw:
    //   "Could not find plugin '@typescript-eslint' in configuration"
    plugins: {
      ...(tsPlugin ? { "@typescript-eslint": tsPlugin } : {}),
    },
    rules: {
      // ── TypeScript ──────────────────────────────────────────────────────
      // Warn on `any` instead of error — raw SQL query rows legitimately
      // return `any` from pg and we don't want to cast every column.
      "@typescript-eslint/no-explicit-any": "warn",

      // Allow unused vars that start with _ (common throwaway pattern)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // ── React ───────────────────────────────────────────────────────────
      // Next.js 13+ App Router doesn't need React in scope
      "react/react-in-jsx-scope": "off",

      // Allow <img> in non-page files (kitchen ticket / receipt use raw img
      // tags for ESC/POS base64 printing where next/image isn't applicable)
      "@next/next/no-img-element": "warn",

      // ── General ─────────────────────────────────────────────────────────
      // Console.log is used extensively for server-side request tracing —
      // warn instead of error so CI doesn't break, but stays visible
      "no-console": ["warn", { allow: ["warn", "error"] }],

      // Prefer const where variable is never reassigned
      "prefer-const": "error",
    },
  },
]

export default config
