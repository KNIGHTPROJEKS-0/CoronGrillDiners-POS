// @ts-check
import nextConfig from "eslint-config-next"

/**
 * ESLint flat config for Coron Grill Diners POS.
 *
 * Extends the official Next.js recommended ruleset (which already bundles
 * @typescript-eslint, eslint-plugin-react, eslint-plugin-react-hooks, and
 * eslint-plugin-next).  Additional project-specific overrides are layered on
 * top so we get real, actionable feedback without noise.
 */

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
