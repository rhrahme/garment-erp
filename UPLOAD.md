# Upload Garment ERP to GitHub

Your project is committed locally at `~/Projects/garment-erp` (branch `main`).

Secrets and local runtime data are **not** in git (`.env.local`, SMTP/IMAP secrets, supplier replies, fabric POs, etc.).

## Option A — GitHub website (easiest)

1. Sign in at [github.com/new](https://github.com/new)
2. Repository name: `garment-erp`
3. Visibility: **Private** (recommended)
4. Do **not** add README, .gitignore, or license (already in the project)
5. Click **Create repository**
6. In Terminal:

```bash
cd ~/Projects/garment-erp
git remote add origin https://github.com/YOUR_USERNAME/garment-erp.git
git push -u origin main
```

GitHub will prompt for login (browser or personal access token).

## Option B — GitHub Desktop

1. Install [GitHub Desktop](https://desktop.github.com/)
2. **File → Add Local Repository** → `~/Projects/garment-erp`
3. **Publish repository** → choose **Private**

## Option C — GitHub CLI

```bash
brew install gh
gh auth login
cd ~/Projects/garment-erp
gh repo create garment-erp --private --source=. --remote=origin --push
```

## After upload

Clone on another machine:

```bash
git clone https://github.com/YOUR_USERNAME/garment-erp.git
cd garment-erp
cp .env.local.example .env.local   # fill in secrets locally
npm install
npm run dev
```

Copy these from your Mac (not in git):

- `.env.local`
- `smtp-secret.local.json` / `imap-secret.local.json`
- `fabric-orders.local.json`, `shipments.local.json`, `supplier-replies.local.json`
- `src/data/sales-orders.json` and `src/data/production-work-orders.json` (if you want live order data on the new machine)
