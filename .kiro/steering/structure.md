# Project Structure

```
/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout — wraps Providers, CartProvider, ProductProvider, SwRegister
│   ├── page.tsx                # Root redirect (→ /login or /pos)
│   ├── providers.tsx           # SessionProvider + ThemeProvider
│   ├── globals.css             # Tailwind base + CSS variable theme tokens
│   │
│   ├── login/                  # Public login page
│   ├── pos/                    # Cashier POS (admin-only route)
│   ├── admin/                  # Admin dashboard (admin-only route)
│   ├── checkout/               # Checkout flow
│   ├── receipt/                # Receipt print view
│   ├── kitchen-ticket/         # Kitchen ticket print view
│   ├── success/                # Post-payment success screen
│   │
│   ├── api/                    # Next.js Route Handlers (server-only)
│   │   ├── auth/[...nextauth]/ # NextAuth handler + rate-limit guard
│   │   ├── sales/              # GET/POST sales; sub-routes: [id], analytics, my, shifts
│   │   ├── shifts/             # Shift CRUD; sub-routes: [id], [id]/sales, current
│   │   ├── products/           # Menu product CRUD
│   │   ├── categories/         # Category CRUD
│   │   ├── users/              # Staff account management; sub-route: me
│   │   ├── audit-log/          # Read audit log entries
│   │   ├── void-codes/         # Void code management
│   │   └── setup-void-codes/   # One-time void code seeding
│   │
│   ├── components/             # Page-level React components (not globally reusable UI)
│   │   ├── cart-sidebar.tsx
│   │   ├── category-sidebar.tsx
│   │   ├── product-grid.tsx
│   │   ├── product-modal.tsx
│   │   ├── shift-start-modal.tsx
│   │   ├── shift-close-modal.tsx
│   │   ├── shift-summary-modal.tsx
│   │   ├── cashier-summary-dialog.tsx
│   │   ├── thermal-receipt.tsx
│   │   ├── kitchen-ticket.tsx
│   │   ├── printer-setup-dialog.tsx
│   │   ├── sales-section.tsx
│   │   ├── change-password-dialog.tsx
│   │   └── sw-register.tsx
│   │
│   ├── context/                # React context providers
│   │   ├── cart-context.tsx    # Cart state (items, totals, discount, payment)
│   │   └── product-context.tsx # Products cache + edit-mode toggle
│   │
│   ├── hooks/                  # App-specific hooks (co-located with app/)
│   │   └── use-printer-status.ts
│   │
│   └── data/                   # Static/seed data
│       └── products.tsx
│
├── components/                 # Globally reusable UI primitives
│   ├── ui/                     # shadcn/ui components (Button, Input, Dialog, etc.)
│   └── theme-provider.tsx
│
├── hooks/                      # Shared custom hooks
│   ├── use-shift.ts            # Shift lifecycle (open, close, refresh)
│   ├── use-offline-sync.ts     # Offline queue sync (localStorage → API)
│   ├── use-mobile.ts
│   └── use-toast.ts
│
├── lib/                        # Server-side utilities and shared logic
│   ├── db.ts                   # pg Pool singleton + hasColumn(), makeDeletedFilter()
│   ├── auth.ts                 # NextAuth authOptions
│   ├── audit.ts                # logEvent() — fire-and-forget audit writer
│   ├── rate-limit.ts           # In-memory rate limiter for login endpoint
│   ├── escpos.ts               # ESC/POS thermal printer command builder
│   ├── printer-connection.ts   # Printer connection helpers
│   ├── utils.ts                # cn() helper (clsx + tailwind-merge)
│   └── generated/prisma/       # Prisma-generated types (do not edit manually)
│
├── prisma/
│   └── schema.prisma           # Schema source of truth for types; migrations run via Supabase
│
├── public/                     # Static assets (icons, manifest, logo)
│
├── .env / .env.local           # Environment variables (never commit secrets)
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## Key Conventions

### Route Handlers (`app/api/`)
- Always call `getServerSession(authOptions)` at the top — return `401` if no session, `403` if wrong role
- Use `logEvent()` from `lib/audit.ts` for any state-mutating action (fire-and-forget, never throw)
- Raw SQL via `pool` from `lib/db.ts`; always parameterized (`$1, $2, …`)
- Return `NextResponse.json({ error: "..." }, { status: N })` for errors

### Client Components
- Add `"use client"` only when needed (event handlers, hooks, browser APIs)
- Auth guards: check `useSession()` status and `session.user.role`; redirect with `router.replace()` on mismatch
- Use `sonner` (`toast`) for user feedback, not `alert()`
- Currency display: `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` — or the local `fmt()` helper in admin/page.tsx

### Styling
- Utility-first Tailwind; use semantic tokens (`bg-background`, `text-muted-foreground`, etc.) over raw colors
- `cn()` from `lib/utils.ts` for conditional class merging
- Dark mode is class-based (`darkMode: ['class']`) — avoid hardcoded light/dark color values

### TypeScript
- Strict mode is on — avoid `any`; use type assertions only when necessary
- Extend NextAuth types via module augmentation (see existing `session.user.role` pattern in `lib/auth.ts`)
- Interface names for local component state use plain names (e.g. `ShiftRecord`, `ManagedOrder`) defined at the top of the file that uses them
