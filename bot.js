const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const FormData = require('form-data');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const BACKEND_URL = process.env.BACKEND_URL;

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('🤖 Bot jalan...');

const isAdmin = (id) => id.toString() === ADMIN_ID;

// START
bot.onText(/\/start/, (msg) => {
  if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, '❌ Private bot.');
  bot.sendMessage(msg.chat.id, `
🤖 *APK Builder Bot*

Kirim file ZIP project Android → aku build jadi APK.

*Command:*
/start - Menu
/status - Cek server
/build_debug - Mode Debug
/build_release - Mode Release
/help - Bantuan
  `, { parse_mode: 'Markdown' });
});

// STATUS
bot.onText(/\/status/, async (msg) => {
  if (!isAdmin(msg.from.id)) return;
  try {
    const r = await axios.get(`${BACKEND_URL}/health`, { timeout: 10000 });
    bot.sendMessage(msg.chat.id, `✅ Server online\n${JSON.stringify(r.data)}`);
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ Server offline: ${e.message}`);
  }
});

// TERIMA ZIP
let buildMode = 'debug';

bot.onText(/\/build_debug/, (msg) => {
  buildMode = 'debug';
  bot.sendMessage(msg.chat.id, '🐞 Mode DEBUG aktif. Kirim ZIP.');
});

bot.onText(/\/build_release/, (msg) => {
  buildMode = 'release';
  bot.sendMessage(msg.chat.id, '🚀 Mode RELEASE aktif. Kirim ZIP.');
});

bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg.from.id)) return bot.sendMessage(chatId, '❌ Akses ditolak.');

  const doc = msg.document;
  if (!doc.file_name.endsWith('.zip')) return bot.sendMessage(chatId, '❌ Harus ZIP!');
  if (doc.file_size > 20 * 1024 * 1024) return bot.sendMessage(chatId, '❌ Max 20MB.');

  const st = await bot.sendMessage(chatId, '📥 Download dari Telegram...');

  try {
    // Download ZIP dari Telegram
    const link = await bot.getFileLink(doc.file_id);
    const fileRes = await axios.get(link, { responseType: 'arraybuffer' });

    await bot.editMessageText('📤 Kirim ke server build...', {
      chat_id: chatId, message_id: st.message_id
    });

    // Kirim ke backend
    const form = new FormData();
    form.append('zip', Buffer.from(fileRes.data), doc.file_name);
    form.append('mode', buildMode);
    form.append('appName', 'BotBuild');
    form.append('packageName', 'com.bot.build');

    const build = await axios.post(`${BACKEND_URL}/api/build/${buildMode}`, form, {
      headers: form.getHeaders(),
      responseType: 'arraybuffer',
      timeout: 900000,
      maxContentLength: 100 * 1024 * 1024
    });

    await bot.editMessageText('📦 Build selesai! Upload APK...', {
      chat_id: chatId, message_id: st.message_id
    });

    // Kirim APK
    await bot.sendDocument(chatId, Buffer.from(build.data), {
      caption: `✅ Build ${buildMode.toUpperCase()} berhasil!`
    }, {
      filename: `app-${buildMode}.apk`,
      contentType: 'application/vnd.android.package-archive'
    });

    await bot.deleteMessage(chatId, st.message_id);

  } catch (e) {
    console.error(e);
    await bot.editMessageText(`❌ Gagal:\n${e.message}`, {
      chat_id: chatId, message_id: st.message_id
    });
  }
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, `
*Bantuan*
📦 Kirim ZIP → build APK
🐞 /build_debug → mode debug
🚀 /build_release → mode release
📊 /status → cek server
  `, { parse_mode: 'Markdown' });
});
