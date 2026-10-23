# WhatsApp Group Inviter

A Node.js script to automate onboarding people into a WhatsApp group without getting your session banned or logged out.

## Why this exists

If you've ever tried using `whatsapp-web.js` or Puppeteer to add 30+ phone numbers directly into a WhatsApp group using `group.addParticipants()`, you've probably run into these issues:

1. **Session Termination**: WhatsApp's backend flags mass participant additions as bot spam and sends a `logout_from_bridge` command, dropping your linked session mid-way.
2. **Privacy Settings**: Many users configure their privacy settings to "Nobody" or "My Contacts" for group invites, which causes direct additions to fail with RPC errors.
3. **Double Adds & Crashes**: If the script crashes halfway through, you have no easy way to know who was already processed without manually checking chat history.

This tool solves these problems by **delivering the invite link directly to each user's direct chat with human-like delays**, tracking all progress in a persistent state file (`progress.json`), and automatically resuming where it left off if interrupted.

---

## Features

- **No Session Logouts**: Uses direct messaging instead of group RPC calls, avoiding WhatsApp's aggressive group-spam filters.
- **Auto-Resuming (`progress.json`)**: Tracks every successfully processed contact. If you stop the script and run it again, it picks up right where it left off.
- **Browser QR Code Viewer**: Generates `qr.html` and opens it in your default browser automatically, so you can easily scan the QR code from your phone without dealing with distorted terminal characters.
- **Configurable Delays**: Randomized delays between messages to mimic human typing and pacing.
- **Auto-Fetch Group Link**: Fetches the group's invite link dynamically using the group name, or lets you specify a custom link.
- **Summary Report**: Dumps a clean summary (`final-report.txt`) of delivered invites, members already in the group, and any failures.

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/Shubham-Loshali/AutoRoster.git
cd AutoRoster
npm install
```

### 2. Add Phone Numbers

Create or edit `numbers.txt` with the phone numbers you want to reach (one per line, including the country code, digits only):

```text
919876543210
919876543211
919876543212
```

*(Note: 10-digit Indian numbers without country code will automatically have `91` prepended).*

### 3. Configure Group Details

Open `add-to-group.js` and set your group name:

```javascript
// Settings in add-to-group.js
const GROUP_NAME   = 'Hackathon Finalists 2026'; // Match your WhatsApp group name
const INVITE_LINK  = '';                         // Leave blank to auto-fetch, or paste a link
const DRY_RUN      = false;                      // Set to true to test without sending
```

You can also customize the message sent with the invite link inside the `INVITE_MESSAGES` array.

### 4. Run

```bash
npm start
```

1. Your browser will pop open showing the WhatsApp Web QR code (`qr.html`).
2. Open WhatsApp on your phone -> **Linked Devices** -> **Link a Device** and scan.
3. The script will authenticate, locate the group, and send out the invites one by one.

---

## How It Works

```
numbers.txt ──> filter already processed (progress.json)
                     │
                     ▼
          WhatsApp Web Auth (LocalAuth)
                     │
                     ▼
        Locate Target Group & Invite Link
                     │
                     ▼
          Loop with randomized delays (2-4s)
                     │
          ├── Send custom invite message to DM
          ├── Record status in progress.json
          └── Output summary report
```

---

## Configuration Reference

| Option | Default | Description |
|---|---|---|
| `GROUP_NAME` | `'Your Group Name'` | Target group title on WhatsApp |
| `INVITE_LINK` | `''` | Custom invite URL. If empty, the script fetches it automatically |
| `NUMBERS_FILE` | `'numbers.txt'` | Path to line-separated phone numbers |
| `PROGRESS_FILE` | `'progress.json'` | JSON file used to track processed numbers |
| `DELAY_MIN_SEC` | `2` | Minimum wait time (seconds) between messages |
| `DELAY_MAX_SEC` | `4` | Maximum wait time (seconds) between messages |
| `DRY_RUN` | `false` | When `true`, simulates execution without sending messages |

---

## Troubleshooting

- **Puppeteer Chrome errors on Linux/WSL**:
  If running on an Ubuntu/Debian server or WSL, you may need basic Chromium libraries:
  ```bash
  sudo apt install -y gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget
  ```

- **Need to log out or switch WhatsApp accounts?**:
  Simply delete the `.wwebjs_auth` folder:
  ```bash
  rm -rf .wwebjs_auth
  ```

---

## Disclaimer

This project is intended for legitimate communication (such as community events, hackathons, clubs, or student groups) with people who have opted in to receive updates. Automated bulk messaging can violate WhatsApp's Terms of Service if abused for spam. Use responsibly.

## License

MIT
