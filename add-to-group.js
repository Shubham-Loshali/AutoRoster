// WhatsApp Group Auto-Adder & Invite Dispatcher
// - Slow, human-like random delays
// - Resumes where it stopped (progress.json)
// - Auto-stops if WhatsApp starts rejecting actions
// - Directly sends group invite link via chat to bypass group addition blocks & privacy restrictions
//
// SETUP: npm install
// numbers.txt -> one phone number per line (with country code, e.g., 91XXXXXXXXXX)
// RUN:   npm start (or node add-to-group.js)

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');

// ---------- SETTINGS ----------
const GROUP_NAME   = 'Your WhatsApp Group Name';  // Exact group name
const INVITE_LINK  = '';                         // Set invite link or leave empty '' to auto-fetch
const NUMBERS_FILE = 'numbers.txt';
const PROGRESS_FILE = 'progress.json';
const DRY_RUN = false;                           // true = only log, do nothing

const DELAY_MIN_SEC = 2;                         // wait seconds between messages
const DELAY_MAX_SEC = 4;
const STARTUP_WAIT_SEC = [3, 5];                 // wait 3-5s after login before starting
const MAX_PER_RUN = 100;                         // max numbers per run
// ------------------------------

const INVITE_MESSAGES = [
  'Hello! You have been invited to join our group. Tap the link below to join:',
];

const rand = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ts = () => new Date().toLocaleTimeString();
const log = (m) => console.log(`[${ts()}] ${m}`);

const loadProgress = () =>
  fs.existsSync(PROGRESS_FILE)
    ? JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))
    : { done: {} };
const saveProgress = (p) => fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
});

let openedBrowser = false;

client.on('qr', async (qr) => {
  try {
    await QRCode.toFile('qr.png', qr, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    console.log('[QR] Saved clean QR image to qr.png');

    if (!openedBrowser) {
      openedBrowser = true;
      require('child_process').exec('cmd /c start qr.html');
      console.log('[QR] Opened qr.html in your default browser for easy scanning.');
    }
  } catch (err) {
    console.error('Failed to save qr.png:', err);
  }
  console.log('\n================ QR CODE ================');
  console.log('Scan with WhatsApp > Linked Devices (or open qr.html / qr.png):');
  qrcode.generate(qr, { small: true });
  console.log('=========================================\n');
});

client.on('authenticated', () => {
  log('Authenticated successfully with WhatsApp!');
});

client.on('loading_screen', (percent, message) => {
  log(`Loading WhatsApp Web: ${percent}% - ${message}`);
});

process.on('unhandledRejection', (err) => {
  log(`[Warning] Unhandled promise rejection: ${err?.message || err}`);
});
process.on('uncaughtException', (err) => {
  log(`[Warning] Uncaught exception: ${err?.message || err}`);
});

let isStarted = false;

client.on('ready', async () => {
  if (isStarted) {
    log('Ignoring duplicate ready event.');
    return;
  }
  isStarted = true;
  log('Connected to WhatsApp.');

  if (!fs.existsSync(NUMBERS_FILE)) {
    log(`File "${NUMBERS_FILE}" not found. Please create it with target phone numbers.`);
    process.exit(1);
  }

  const numbers = [...new Set(
    fs.readFileSync(NUMBERS_FILE, 'utf8').split(/\r?\n/)
      .map((n) => n.replace(/\D/g, '').replace(/^0+/, '')).filter(Boolean)
      .map((n) => (n.length === 10 ? '91' + n : n))
  )];
  const progress = loadProgress();
  const todo = numbers.filter((n) => !progress.done[n]).slice(0, MAX_PER_RUN);
  log(`${numbers.length} numbers total, ${todo.length} left to process.`);
  if (!todo.length) { log('Nothing to do. All numbers already processed.'); process.exit(0); }

  log(`Waiting for WhatsApp Web to sync groups...`);
  let group;
  let availableGroups = [];

  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const chatInfo = await client.pupPage.evaluate(() => {
        try {
          const chats = window.require('WAWebCollections').Chat.getModelsArray();
          return chats.map(c => ({
            id: c.id ? c.id._serialized : null,
            name: c.name || c.formattedTitle || '',
            isGroup: !!(c.isGroup || (c.id && c.id._serialized && c.id._serialized.endsWith('@g.us')))
          }));
        } catch (e) {
          return [];
        }
      });

      const groups = (chatInfo || []).filter(c => c.isGroup);
      if (groups.length > 0) {
        availableGroups = groups.map(g => g.name).filter(Boolean);
        const targetClean = GROUP_NAME.toLowerCase().trim();
        const match = groups.find(g => {
          const n = (g.name || '').toLowerCase().trim();
          return n === targetClean || n.includes(targetClean) || targetClean.includes(n);
        });

        if (match) {
          try {
            group = await client.getChatById(match.id);
            log(`Found group: "${match.name}" (${match.id})`);
            break;
          } catch (e) {
            log(`Fallback: Initializing group reference directly for "${match.name}" (${match.id})`);
            const GroupChat = require('whatsapp-web.js/src/structures/GroupChat');
            group = new GroupChat(client, {
              id: { _serialized: match.id, user: match.id.split('@')[0], server: 'g.us' },
              formattedTitle: match.name,
              isGroup: true
            });
            break;
          }
        }
      }
    } catch (e) {
      // waiting for next attempt
    }

    if (attempt % 3 === 0) {
      log(`Still syncing... (${attempt}/15)`);
    }
    await sleep(2000);
  }

  if (!group) {
    log(`Group "${GROUP_NAME}" not found after syncing.`);
    if (availableGroups.length) {
      log(`Available groups on your WhatsApp account:\n` + [...new Set(availableGroups)].map(g => `  - "${g}"`).join('\n'));
    } else {
      log('No groups found synced yet. Please verify you are in the group or check your connection.');
    }
    process.exit(1);
  }

  let inviteLink = INVITE_LINK;
  if (!inviteLink) {
    try {
      inviteLink = `https://chat.whatsapp.com/${await group.getInviteCode()}`;
      log(`Fetched invite link automatically: ${inviteLink}`);
    } catch (e) {
      log(`Warning: Could not fetch invite code automatically: ${e.message}`);
    }
  }

  const startWait = rand(...STARTUP_WAIT_SEC);
  log(`Warming up, waiting ${Math.round(startWait)}s before starting...`);
  await sleep(startWait * 1000);

  log(`Sending direct group invites to remaining ${todo.length} numbers...`);
  for (let i = 0; i < todo.length; i++) {
    const num = todo[i];
    const id = `${num}@c.us`;
    log(`(${i + 1}/${todo.length}) Processing ${num}...`);
    
    if (DRY_RUN) {
      log(`  [DRY RUN] Would send invite to ${num}`);
      progress.done[num] = 'dry_run';
      saveProgress(progress);
      continue;
    }

    try {
      await client.sendMessage(id, `${pick(INVITE_MESSAGES)}\n${inviteLink}`);
      log(`  [INVITED] ${num}`);
      progress.done[num] = 'invite_sent';
      saveProgress(progress);
      await sleep(rand(DELAY_MIN_SEC, DELAY_MAX_SEC) * 1000);
    } catch (err) {
      log(`  ERROR sending to ${num}: ${err.message}`);
    }
  }

  // ---------- FINAL REPORT ----------
  const groups = {
    added: [], invite_sent: [], already_in_group: [], not_on_whatsapp: [], dry_run: [],
  };
  Object.entries(progress.done).forEach(([n, status]) => {
    (groups[status] = groups[status] || []).push(n);
  });
  const notProcessed = numbers.filter((n) => !progress.done[n]);

  const section = (title, list) =>
    `${title} (${list.length})\n` + (list.length ? list.map((n) => `  - ${n}`).join('\n') : '  none') + '\n';

  const report =
    '===== FINAL REPORT =====\n\n' +
    section('INVITE LINK SENT', groups.invite_sent) + '\n' +
    section('ADDED DIRECTLY TO GROUP', groups.added) + '\n' +
    section('SKIPPED - already in group', groups.already_in_group) + '\n' +
    section('SKIPPED - not on WhatsApp', groups.not_on_whatsapp) + '\n' +
    (groups.dry_run.length ? section('DRY RUN (nothing done)', groups.dry_run) + '\n' : '') +
    (notProcessed.length ? section('NOT PROCESSED YET (run again)', notProcessed) + '\n' : '');

  console.log('\n' + report);
  fs.writeFileSync('final-report.txt', report);
  log('Report saved to final-report.txt');

  await client.destroy();
  process.exit(0);
});

client.on('auth_failure', (m) => { console.log('Login failed:', m); process.exit(1); });
client.on('disconnected', (r) => { log(`[Warning] Disconnected event received: ${r}`); });

client.initialize();
