# Kitchens

A walkable digital food hall. Wilsons is kitchen #1. Everyone else pays rent for a spot on the street.

## Run it locally

```bash
cd ~/kitchens
./start.sh
```

- Hall: http://localhost:8765
- Dashboard: http://localhost:8765/dashboard.html  
  Password: `wilsons` — change this before you go live
- My kitchen: http://localhost:8765/my.html

`python3 -m http.server` is not enough. You need `./start.sh` (it runs `server.py`).

## Stripe (do this before going live)

Leases are monthly subscriptions: Stall **$149**, Kitchen **$249**, Corner **$399**. A shop only appears on the street after Stripe takes the first payment.

### 1. Get test keys

1. Create an account at [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Stay in **Test mode** (toggle in the Stripe dashboard)
3. [https://dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) → copy **Secret key** (`sk_test_…`)

### 2. Put keys on this Mac

```bash
cd ~/kitchens
cp .env.example .env
```

Edit `.env` and paste your secret key:

```
STRIPE_SECRET_KEY=sk_test_your_key_here
PUBLIC_URL=http://localhost:8765
```

### 3. Webhooks (so renewals and failed cards update the street)

Install the Stripe CLI: [https://stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli)

```bash
stripe login
stripe listen --forward-to localhost:8765/api/stripe/webhook
```

Copy the `whsec_…` it prints into `.env`:

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

Restart `./start.sh`. Keep `stripe listen` running in another Terminal while you test.

### 4. Test a payment

1. Open the hall, claim a kitchen, click **Pay with Stripe**
2. Card: `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP
3. You land on `/paid.html` with your **PIN**
4. The shop should show on the street after a refresh

Switch to **live keys** (`sk_live_…`) only on the production host, plus a live webhook endpoint in Stripe pointing at `https://YOUR-DOMAIN/api/stripe/webhook`.

## Lease security

When someone claims a shop they get a **6-digit PIN**. Managing that shop requires **email + PIN** (or the private link shown at claim time). Email alone is not enough.

You can see a tenant’s PIN in the dashboard if they lose it.

## Ship it / make it live (Render)

The app is one Python file plus static pages. A `render.yaml` in this repo tells Render how to run it.

1. Push this folder to a **private** GitHub repo (do not commit `.env`).
2. Sign up at [https://render.com](https://render.com) with GitHub.
3. **New → Blueprint** and select the repo, **or** **New → Web Service** and fill:
   - Language: **Python 3**
   - Build: `pip install -r requirements.txt`
   - Start: `python3 server.py`
   - Instance: **Free** is fine for the first public URL
4. After the first deploy, Render gives you `https://something.onrender.com`.
5. Open `/dashboard.html`, sign in with `wilsons`, **change the password**.
6. Leave Stripe env vars empty until you are ready to take real rent. The hall still walks; Pay with Stripe stays off.

Optional later (paid Render instance):

- Add a **persistent disk** at `/var/data` and set `DATA_DIR=/var/data` so emails and leases survive deploys.
- Set `PUBLIC_URL=https://your-onrender-url` (or your custom domain).
- Put live Stripe keys on the service (not in git): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Custom domain under the service’s **Settings**.

Free instances sleep after a few minutes idle. The first visitor after sleep waits ~30 seconds. Upgrade to a starter instance when you want it always awake.

### Other hosts

#### Railway

1. New project → Deploy from GitHub.
2. Start command: `python3 server.py`.
3. Volume at `/app/data`, env `DATA_DIR=/app/data`.
4. Set `PUBLIC_URL` to the Railway HTTPS URL.

#### A VPS (DigitalOcean, Hetzner, etc.)

On the server:

```bash
sudo apt update && sudo apt install -y python3 nginx certbot python3-certbot-nginx
# copy the kitchens folder to /var/www/kitchens
cd /var/www/kitchens
python3 server.py   # test on :8765 first
```

Systemd service `/etc/systemd/system/kitchens.service`:

```
[Unit]
Description=Kitchens
After=network.target

[Service]
WorkingDirectory=/var/www/kitchens
Environment=PORT=8765
ExecStart=/usr/bin/python3 /var/www/kitchens/server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl enable --now kitchens
```

Nginx site (replace the domain):

```
server {
  listen 80;
  server_name kitchens.yourdomain.com;
  location / {
    proxy_pass http://127.0.0.1:8765;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```

```bash
sudo certbot --nginx -d kitchens.yourdomain.com
```

Point the domain’s **A record** at the VPS IP.

### After it’s live

1. Open `https://your-domain/dashboard.html`
2. Change the dashboard password
3. Walk the street on your phone and claim a test kitchen
4. Confirm `/my.html` asks for email **and** PIN
5. Share the hall URL — that’s the public site

Leases and emails are stored in `data/claims.json` and `data/emails.json`. Keep that folder on a disk that doesn’t wipe on deploy.
