# Legion Backend

Node.js/Express/MongoDB API for the Legion escrow platform: auth, KYC intake, 2FA,
escrow lifecycle (create → agree → fund → conditions → release), and automated
breach/dispute monitoring.

## Setup

```bash
cd backend
npm install
cp .env.example .env   # fill in real values
npm run dev
```

Requires a MongoDB connection (Atlas works well for Render deployments).

## Deploying to Render

1. Push this folder to its own GitHub repo (or a `backend/` subfolder with Render's
   root directory set to `backend`).
2. New Web Service → connect the repo → Build command `npm install` → Start command `npm start`.
3. Add all variables from `.env.example` in Render's Environment tab.
4. Point `CLIENT_URL` at your deployed Vercel frontend URL for CORS.

## Important: payment, crypto, and KYC providers are stubbed

This codebase implements the full escrow **logic** (fees, agreement, conditions,
2FA-gated release, breach monitoring) but does **not** move real money or verify
real identities on its own — no backend can legally do that by itself. Before
handling real funds you'll need to:

- **KYC/AML**: connect a licensed identity verification provider (Persona, Onfido,
  Sumsub) — see `submitKyc` / `kycWebhook` in `authController.js`.
- **Card payments**: add a real `STRIPE_SECRET_KEY` — Stripe PaymentIntents are
  already wired in `paymentController.js` using manual capture (funds are
  authorized/held, then captured on release).
- **Bank transfers**: connect a banking-as-a-service or payments provider (Wise,
  Flutterwave, Modern Treasury) — see the `bank` branches in `paymentController.js`.
- **Crypto**: connect a regulated custodian (Fireblocks, BitGo, Circle) — see the
  `crypto` branches in `paymentController.js`.
- **Licensing**: operating an escrow service that holds third-party funds is a
  regulated activity in most jurisdictions (money transmitter / escrow agent
  licensing). Consult a lawyer about which licenses you need before launch.

## Key endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create account (auto-grants `agent_admin` if email is in `ADMIN_EMAILS`) |
| POST | `/api/auth/login` | Login (returns `requiresTwoFA` if enabled) |
| POST | `/api/auth/kyc` | Submit ID + country (multipart) |
| POST | `/api/auth/2fa/setup` | Get QR code to scan |
| POST | `/api/auth/2fa/verify` | Confirm code, enables 2FA |
| POST | `/api/escrows` | Create a contract with one or more milestones |
| POST | `/api/escrows/:id/agree` | Counterparty accepts terms |
| PATCH | `/api/escrows/:id/milestones/:milestoneId/conditions/:conditionId` | Toggle a condition met |
| POST | `/api/escrows/:id/milestones/:milestoneId/release` | Release one milestone's funds (2FA-gated) |
| POST | `/api/escrows/:id/dispute` | Flag a breach (optionally scoped to a milestone) |
| GET | `/api/disputes` | Agent console: full dispute queue (`agent_admin` only) |
| GET | `/api/disputes/mine` | A user's own disputes |
| POST | `/api/disputes/:id/resolve` | Agent resolves a dispute (`agent_admin` only) |

### Milestones

Every escrow now has a `milestones` array instead of one lump amount — each milestone
carries its own amount and its own condition checklist, and releases independently
once its conditions are met and (if enabled) 2FA is confirmed. The contract's overall
fee is calculated on the total across all milestones and pro-rated per milestone at
payout time.

### Dispute console

Anyone whose email is listed in `ADMIN_EMAILS` becomes `agent_admin` on signup and can
call `GET /api/disputes` to see the full queue and `POST /api/disputes/:id/resolve` to
release remaining milestones to the beneficiary, refund the depositor, or mark a split
for manual follow-up. A cron job (`src/jobs/breachMonitor.js`) also auto-opens disputes
hourly for any active contract whose deadline has passed with unmet conditions.

A cron job (`src/jobs/breachMonitor.js`) runs hourly and auto-flags any active
contract whose deadline has passed with unmet conditions.
