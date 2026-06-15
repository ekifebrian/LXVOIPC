process.env.GOOGLE_CLOUD_FIRESTORE_TELEMETRY_DISABLED = "true";

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { doc, setDoc, getDoc, query, collection, where, getDocs, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage, auth } from "./src/firebase";
import dotenv from "dotenv";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously } from "firebase/auth";
import { getApps, initializeApp, getApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import fs, { readFileSync } from "fs";

dotenv.config();

// Initialize Firebase Admin SDK using applet configurations (for other features such as Auth sync if needed)
if (getApps().length === 0) {
  try {
    const firebaseConfig = JSON.parse(readFileSync("./firebase-applet-config.json", "utf-8"));
    initializeApp({
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket
    });
    console.log("[Firebase Admin Setup] Successfully initialized Admin SDK");
  } catch (adminErr) {
    console.warn("[Firebase Admin Setup] Warning/Error initializing admin SDK:", adminErr);
  }
}

let cachedUser: any = null;
let authPromise: Promise<any> | null = null;

// Ensure client SDK is authenticated to perform storage uploads
async function getClientAuth() {
  if (cachedUser) {
    return cachedUser;
  }
  if (auth.currentUser) {
    cachedUser = auth.currentUser;
    return cachedUser;
  }
  if (authPromise) {
    return authPromise;
  }

  authPromise = (async () => {
    try {
      const userCred = await signInWithEmailAndPassword(auth, "telegram-bot-service@lxvoip.com", "botpassword123");
      console.log("[Firebase Client Auth] Authenticated telegram-bot-service successfully");
      cachedUser = userCred.user;
      return userCred.user;
    } catch (err: any) {
      if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        try {
          const userCred = await createUserWithEmailAndPassword(auth, "telegram-bot-service@lxvoip.com", "botpassword123");
          console.log("[Firebase Client Auth] Created and authenticated telegram-bot-service");
          cachedUser = userCred.user;
          return userCred.user;
        } catch (createErr: any) {
          console.warn("[Firebase Client Auth] Failed to create telegram-bot-service account:", createErr.message || createErr);
          try {
            const userCred = await signInWithEmailAndPassword(auth, "telegram-bot-service@lxvoip.com", "botpassword123");
            cachedUser = userCred.user;
            return userCred.user;
          } catch (retryErr: any) {
            console.warn("[Firebase Client Auth] Bot service retry signin failed:", retryErr.message || retryErr);
          }
        }
      } else {
        console.warn("[Firebase Client Auth] Tried to authenticate but got error:", err.message || err);
      }
    }

    // Fallback to demo admin account
    try {
      const userCred = await signInWithEmailAndPassword(auth, "admin@admin.com", "admin123");
      console.log("[Firebase Client Auth] Authenticated as admin fallback successfully");
      cachedUser = userCred.user;
      return userCred.user;
    } catch (adminErr: any) {
      if (adminErr.code === "auth/user-not-found" || adminErr.code === "auth/invalid-credential" || adminErr.code === "auth/wrong-password") {
        try {
          const userCred = await createUserWithEmailAndPassword(auth, "admin@admin.com", "admin123");
          console.log("[Firebase Client Auth] Created and authenticated demo admin account");
          cachedUser = userCred.user;
          return userCred.user;
        } catch (createAdminErr: any) {
          console.warn("[Firebase Client Auth] Admin fallback create failed:", createAdminErr.message || createAdminErr);
        }
      } else {
        console.warn("[Firebase Client Auth] Failed to log in as admin fallback:", adminErr.message || adminErr);
      }
    }

    return null;
  })();

  try {
    const user = await authPromise;
    return user;
  } finally {
    authPromise = null;
  }
}

// Durable Local Cache Config for Telegram Settings as fail-safe backup to handle Firestore authentication/permission constraints
const TELEGRAM_CONFIG_FILE = path.join(process.cwd(), "telegram-settings.json");

function getLocalSettings() {
  try {
    if (fs.existsSync(TELEGRAM_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(TELEGRAM_CONFIG_FILE, "utf-8"));
      return {
        enabled: typeof data.enabled === "boolean" ? data.enabled : true,
        forwardChatId: typeof data.forwardChatId === "string" ? data.forwardChatId : ""
      };
    }
  } catch (err) {
    console.warn("[Telegram Settings] Failed to read local fallback configs:", err);
  }
  return { enabled: true, forwardChatId: "" };
}

function saveLocalSettings(settings: { enabled?: boolean; forwardChatId?: string }) {
  try {
    const current = getLocalSettings();
    const updated = {
      enabled: typeof settings.enabled === "boolean" ? settings.enabled : current.enabled,
      forwardChatId: typeof settings.forwardChatId === "string" ? settings.forwardChatId : current.forwardChatId
    };
    fs.writeFileSync(TELEGRAM_CONFIG_FILE, JSON.stringify(updated, null, 2), "utf-8");
    console.log("[Telegram Settings] Local fallback config updated to:", updated);
  } catch (err) {
    console.warn("[Telegram Settings] Failed to write local fallback configs:", err);
  }
}

const app = express();
const PORT = 3000;

app.use(express.json());

// Ensure the local uploads directory exists and is statically served as backup
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));

// API route to let the frontend know the Telegram Bot status
app.get("/api/telegram-info", async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "YOUR_TELEGRAM_BOT_TOKEN") {
    return res.json({
      active: false,
      botUsername: null,
      instructionsUrl: process.env.APP_URL || "http://localhost:3000",
      message: "Telegram Bot is currently disabled.",
      enabled: false
    });
  }

  // Get current state from local cache, synced/fetched from Firestore where possible
  const localSettings = getLocalSettings();
  let enabled = localSettings.enabled;
  let forwardChatId = localSettings.forwardChatId;

  try {
    await getClientAuth();
    const docSnap = await getDoc(doc(db, "settings", "telegram"));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data) {
        if (typeof data.enabled === "boolean") {
          enabled = data.enabled;
        }
        if (typeof data.forwardChatId === "string") {
          forwardChatId = data.forwardChatId;
        }
        saveLocalSettings({ enabled, forwardChatId });
      }
    }
  } catch (err) {
    console.warn("[Telegram info] Firestore fetch skipped (using local fallback settings):", err);
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await response.json() as any;
    if (data.ok && data.result) {
      return res.json({
        active: true,
        botUsername: data.result.username,
        botFirstName: data.result.first_name,
        instructionsUrl: process.env.APP_URL || "http://localhost:3000",
        message: "Telegram Bot is active.",
        enabled: enabled,
        forwardChatId: forwardChatId
      });
    }
  } catch (err) {
    console.error("Error fetching bot info from Telegram:", err);
  }

  res.json({
    active: true,
    botUsername: "Bot",
    instructionsUrl: process.env.APP_URL || "http://localhost:3000",
    message: "Telegram Bot is active.",
    enabled: enabled,
    forwardChatId: forwardChatId
  });
});

// Endpoint to turn on/off the Telegram Bot webhook 24/7
app.post("/api/telegram-toggle", async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "YOUR_TELEGRAM_BOT_TOKEN") {
    return res.status(400).json({ ok: false, error: "Telegram Bot is not configured." });
  }

  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ ok: false, error: "Invalid parameters" });
  }

  // Update local config immediately so it works even if Firestore is offline or permission-denied
  saveLocalSettings({ enabled });

  try {
    // 1. Try to update Firestore settings using Client SDK in background
    await getClientAuth();
    await setDoc(doc(db, "settings", "telegram"), { enabled }, { merge: true });
  } catch (err) {
    console.warn("[Telegram save-config] Firestore background sync failed:", err);
  }

  try {
    // 2. Based on state, set or delete webhook
    const appUrl = process.env.APP_URL;
    let successMsg = enabled ? "Bot has been activated 24/7." : "Bot has been deactivated.";
    let telegramResult = null;

    if (enabled) {
      if (appUrl) {
        const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram-webhook`;
        const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
        telegramResult = await response.json() as any;
        console.log("[Telegram Switch ON] Webhook registration response:", telegramResult);
      }
    } else {
      const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
      telegramResult = await response.json() as any;
      console.log("[Telegram Switch OFF] Webhook deleted response:", telegramResult);
    }

    return res.json({ ok: true, enabled, message: successMsg, telegramResult });
  } catch (err: any) {
    console.error("Error toggling telegram bot:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to toggle bot state" });
  }
});

// Endpoint to update target Group/Channel/Chat ID from Admin Panel
app.post("/api/telegram-save-config", async (req, res) => {
  const { forwardChatId } = req.body;
  if (typeof forwardChatId !== "string") {
    return res.status(400).json({ ok: false, error: "Parameter forwardChatId wajib berupa string." });
  }

  const trimmedChatId = forwardChatId.trim();

  // Save to local configuration immediately
  saveLocalSettings({ forwardChatId: trimmedChatId });

  try {
    // Try to update Firestore in the background
    await getClientAuth();
    await setDoc(doc(db, "settings", "telegram"), { forwardChatId: trimmedChatId }, { merge: true });
  } catch (err) {
    console.warn("[Telegram save-config] Firestore background sync failed:", err);
  }

  // Always return success because we successfully processed and saved it locally!
  return res.json({ ok: true, message: "Target Chat ID berhasil diperbarui." });
});

// Endpoint to forward building data record on demand to configured Telegram chat
app.post("/api/telegram-forward", async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "YOUR_TELEGRAM_BOT_TOKEN") {
    return res.status(400).json({ ok: false, error: "Token Telegram belum dikonfigurasi di server." });
  }

  const { buildingId } = req.body;
  if (!buildingId) {
    return res.status(400).json({ ok: false, error: "Parameter buildingId tidak boleh kosong." });
  }

  try {
    // 1. Fetch Integration Settings (local with optional database lookup)
    const localSettings = getLocalSettings();
    let enabled = localSettings.enabled;
    let forwardChatId = localSettings.forwardChatId;

    try {
      await getClientAuth();
      const settingsSnap = await getDoc(doc(db, "settings", "telegram"));
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        if (data) {
          if (typeof data.enabled === "boolean") {
            enabled = data.enabled;
          }
          if (typeof data.forwardChatId === "string") {
            forwardChatId = data.forwardChatId;
          }
        }
      }
    } catch (dbErr) {
      console.warn("[Telegram forward] Firestore settings read failed (relying on local configs):", dbErr);
    }

    if (!enabled) {
      return res.status(400).json({ ok: false, error: "Integrasi Bot Telegram belum diaktifkan di setelan." });
    }

    if (!forwardChatId || forwardChatId.trim() === "") {
      return res.status(400).json({ ok: false, error: "Target Chat ID Telegram belum diatur. Silakan atur di bagian Setelan Bot Telegram terlebih dahulu." });
    }

    // 2. Fetch the corresponding site building record
    const buildingSnap = await getDoc(doc(db, "buildings", buildingId));
    if (!buildingSnap.exists()) {
      return res.status(404).json({ ok: false, error: "Rekaman situs tidak ditemukan." });
    }

    const building = buildingSnap.data() as any;

    // 3. Format message in Indonesian and Chinese using robust HTML tags (prevents Markdown syntax parse failures)
    let categoryLabel = building.category || "";
    if (categoryLabel === "survey") categoryLabel = "踩点 / SURVEY";
    else if (categoryLabel === "line") categoryLabel = "排线 / LINE";
    else if (categoryLabel === "installation") categoryLabel = "安装 / INSTALLATION";
    else categoryLabel = categoryLabel.toUpperCase();

    const escapeHtml = (text: string) => {
      if (!text) return "";
      return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    };

    const safeName = escapeHtml(building.name || "Situs Tanpa Nama");
    const safeOperator = escapeHtml(building.operator || "N/A");
    const safeOperationTime = escapeHtml(building.operationTime || "N/A");
    const safeLocation = escapeHtml(building.location || "N/A");
    const safeDescText = escapeHtml(descText);
    const safeCategoryLabel = escapeHtml(categoryLabel);

    let techSpecsHtml = "";
    if (building.category === "survey") {
      techSpecsHtml = `• 长途线路数量 (Long Distance Lines): <b>${building.longDistanceLines || 0}</b> 根\n• 本地线路数量 (Local Lines): <b>${building.localLines || 0}</b> 根`;
    } else if (building.category === "line") {
      techSpecsHtml = `• 长途电话数量 (Long Distance Phones): <b>${building.longDistancePhones || 0}</b> 台\n• 本地电话数量 (Local Phones): <b>${building.localPhones || 0}</b> 台`;
    } else if (building.category === "installation") {
      techSpecsHtml = `• Jalur Jauh (Long Distance Lines): <b>${building.longDistanceLines || 0}</b> 根\n• Jalur Lokal (Local Lines): <b>${building.localLines || 0}</b> 根\n• 总时长 (Total Duration): <b>${building.totalDuration || 0}</b> 小时`;
    }

    const textPayloadHtml = `🏢 <b>${safeName}</b>\n\n📌 <b>Kategori / 类别</b>: [${safeCategoryLabel}]\n👤 <b>Operator / 操作人</b>: ${safeOperator}\n⏰ <b>Waktu / 操作时间</b>: ${safeOperationTime}\n📍 <b>Lokasi / 地点</b>: ${safeLocation}\n\n🔌 <b>Spesifikasi Metrik Teknis / 技术指标</b>:\n${techSpecsHtml}\n\n📝 <b>Keterangan Lapangan / 描述</b>:\n${safeDescText}\n\n📋 <i>Dikirim langsung dari LXVOIP Web Admin Portal</i>`;

    // 4. Send with Photo or Media Group if gallery contains any media items
    if (building.gallery && building.gallery.length > 1) {
      await sendTelegramMediaGroup(forwardChatId, building.gallery, textPayloadHtml, token, "HTML");
    } else if (building.gallery && building.gallery.length === 1) {
      const singleMedia = building.gallery[0];
      const url = getAbsoluteMediaUrl(singleMedia);
      if (isVideoUrl(url)) {
        await sendTelegramVideo(forwardChatId, url, textPayloadHtml, token, null, "HTML");
      } else {
        await sendTelegramPhoto(forwardChatId, url, textPayloadHtml, token, null, "HTML");
      }
    } else {
      await sendTelegramMessage(forwardChatId, textPayloadHtml, token, null, "HTML");
    }

    return res.json({ ok: true, message: "Berhasil dteruskan ke Telegram!", targetChatId: forwardChatId });
  } catch (err: any) {
    console.error("Failed to forward building to telegram:", err);
    return res.status(500).json({ ok: false, error: err.message || "Gagal mengirimkan data ke Telegram." });
  }
});

// Telegram Bot Webhook Receiver
app.post("/api/telegram-webhook", async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(400).send("Telegram token not configured.");
  }
  
  try {
    const update = req.body;
    if (update) {
      await handleTelegramUpdate(update, token);
    }
    res.status(200).send("OK");
  } catch (err) {
    console.error("Error handling telegram update:", err);
    res.status(500).send("Internal Error");
  }
});

// Manual setup of Telegram Bot Webhook
app.post("/api/manual-webhook-setup", async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "YOUR_TELEGRAM_BOT_TOKEN") {
    return res.status(400).json({ ok: false, error: "Telegram Bot Token is not configured on the server." });
  }

  const { customUrl } = req.body;
  if (!customUrl || typeof customUrl !== "string" || !customUrl.startsWith("https://")) {
    return res.status(400).json({ ok: false, error: "Custom webhook URL must start with https://" });
  }

  const webhookUrl = `${customUrl.replace(/\/$/, "")}/api/telegram-webhook`;
  console.log(`[Manual Setup] Attempting to register webhook to: ${webhookUrl}`);

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const data = await response.json() as any;
    
    if (data && data.ok === false) {
      return res.status(400).json({ 
        ok: false, 
        error: `Telegram API: ${data.description || "Unauthorized/Invalid Bot Token"} (Error Code: ${data.error_code || 401})` 
      });
    }

    return res.json({ ok: true, data });
  } catch (err: any) {
    console.error("[Manual Setup] Failed to register webhook via API call:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to set webhook" });
  }
});

// Proxy endpoint for Gaode Map (Amap) Input Tips (Autocomplete) and forward geocoding
app.get("/api/amap/search", async (req, res) => {
  const queryVal = String(req.query.q || "").trim();
  if (!queryVal) {
    return res.json({ status: "ok", results: [] });
  }

  const key = process.env.AMAP_KEY;
  if (key) {
    try {
      // Fetch autocomplete inputtips
      const inputtipsUrl = `https://restapi.amap.com/v3/assistant/inputtips?keywords=${encodeURIComponent(queryVal)}&key=${key}`;
      const response = await fetch(inputtipsUrl);
      if (response.ok) {
        const data = await response.json() as any;
        if (data.status === "1" && Array.isArray(data.tips)) {
          // Format Amap inputtips
          const results = data.tips
            .filter((tip: any) => tip.location && typeof tip.location === "string" && tip.location.includes(","))
            .map((tip: any) => {
              const [lngStr, latStr] = tip.location.split(",");
              const lat = parseFloat(latStr);
              const lng = parseFloat(lngStr);
              
              // Parse out state, city, county when possible from district field (e.g. "广东省深圳市南山区")
              const distStr = tip.district || "";
              let provinceAttr = "";
              let cityAttr = "";
              let districtAttr = "";
              
              if (typeof distStr === "string") {
                const provMatch = distStr.match(/^[^省]+省/);
                provinceAttr = provMatch ? provMatch[0] : "";
                
                const cityMatch = distStr.match(/(?:省|自治区)([^市]+市)/);
                cityAttr = cityMatch ? cityMatch[1] : (distStr.includes("市") ? distStr.split("市")[0] + "市" : "");
                
                const leftover = distStr.replace(provinceAttr, "").replace(cityAttr, "");
                districtAttr = leftover || "";
              }

              return {
                type: "online",
                name: tip.name,
                description: `${distStr}${typeof tip.address === "string" ? tip.address : ""}`,
                latlng: [lat, lng],
                addressDetails: {
                  province: provinceAttr,
                  city: cityAttr,
                  district: districtAttr
                }
              };
            });

          if (results.length > 0) {
            return res.json({ source: "amap", results });
          }
        }
      }
    } catch (err) {
      console.warn("Amap inputtips lookup failed, falling back to Nominatim:", err);
    }
  }

  // Fallback to OpenStreetMap/Nominatim if AMAP_KEY is empty or fails
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryVal)}&addressdetails=1&limit=10&countrycodes=cn&accept-language=zh-CN,zh,en`;
    const response = await fetch(url, { headers: { "User-Agent": "LXVOIP-Database-Client" } });
    if (response.ok) {
      const data = await response.json() as any[];
      const results = data.map((item: any) => {
        const shortName = item.name || item.display_name.split(",")[0] || queryVal;
        const addr = item.address || {};
        const province = addr.state || addr.province || addr.region || "";
        const city = addr.city || addr.town || addr.municipality || "";
        const district = addr.county || addr.district || addr.suburb || "";
        return {
          type: "online",
          name: shortName,
          description: item.display_name,
          latlng: [parseFloat(item.lat), parseFloat(item.lon)],
          addressDetails: {
            province,
            city,
            district
          }
        };
      });
      return res.json({ source: "nominatim", results });
    }
  } catch (err) {
    console.error("Nominatim search failed:", err);
  }

  return res.json({ source: "none", results: [] });
});

// Proxy endpoint for Gaode Map (Amap) Reverse Geocoding (Regeo)
app.get("/api/amap/regeo", async (req, res) => {
  const lat = parseFloat(String(req.query.lat || ""));
  const lng = parseFloat(String(req.query.lng || ""));

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: "Invalid Coordinates" });
  }

  const key = process.env.AMAP_KEY;
  if (key) {
    try {
      const regeoUrl = `https://restapi.amap.com/v3/geocode/regeo?location=${lng},${lat}&key=${key}`;
      const response = await fetch(regeoUrl);
      if (response.ok) {
        const data = await response.json() as any;
        if (data.status === "1" && data.regeocode) {
          const comp = data.regeocode.addressComponent || {};
          let province = String(comp.province || "");
          let city = typeof comp.city === "string" ? String(comp.city) : "";
          if (!city && Array.isArray(comp.city)) {
            city = "";
          }
          const district = typeof comp.district === "string" ? String(comp.district) : "";
          
          return res.json({
            source: "amap",
            province,
            city,
            district,
            formatted_address: data.regeocode.formatted_address || ""
          });
        }
      }
    } catch (err) {
      console.warn("Amap reverse geocoding failed, falling back to Nominatim:", err);
    }
  }

  // Fallback to OSM / Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const response = await fetch(url, { headers: { "User-Agent": "LXVOIP-Database-Client", "Accept-Language": "zh-CN,zh,en" } });
    if (response.ok) {
      const data = await response.json() as any;
      const addr = data.address || {};
      const province = addr.state || addr.region || addr.province || '';
      const city = addr.city || addr.municipality || addr.city_district || addr.county || '';
      const district = addr.suburb || addr.neighbourhood || addr.village || addr.quarter || '';
      return res.json({
        source: "nominatim",
        province: province.replace(/Province|Kepulauan|Daerah Istimewa/gi, '').trim(),
        city: city.replace(/City|Kota|Kabupaten/gi, '').trim(),
        district: district.trim(),
        formatted_address: data.display_name || ""
      });
    }
  } catch (err) {
    console.error("Nominatim regeo failed:", err);
  }

  return res.json({ source: "none", province: "", city: "", district: "", formatted_address: "" });
});

const authenticatedSessions: Record<string, any> = {};

async function getTelegramSession(chatId: string | number): Promise<any> {
  const cidStr = String(chatId);
  if (authenticatedSessions[cidStr]) {
    return authenticatedSessions[cidStr];
  }
  try {
    await getClientAuth();
    const docSnap = await getDoc(doc(db, "telegram_sessions", cidStr));
    if (docSnap.exists()) {
      const data = docSnap.data();
      authenticatedSessions[cidStr] = data;
      return data;
    }
  } catch (err) {
    console.error("Failed to fetch telegram session from firestore:", err);
  }
  return null;
}

const messages = {
  id: {
    mediaGroupStart: "⚡️ *Grup media diterima! Sedang mengumpulkan semua foto & video dari album...*",
    mediaGroupProcessing: "🤖 *Berhasil mengumpulkan {count} media dari album. Mengunggah berkas ke cloud...*",
    mediaGroupFail: "❌ Gagal mengunggah satupun berkas media dari album Anda.",
    mediaGroupAnalysis: "🤖 *Mengunduh & memproses media selesai. Menganalisis caption data lapangan dengan AI Gemini...*",
    mediaGroupSuccessHeader: "✅ *DATA LAPANGAN ALBUM BERHASIL DISINKRONKAN!*",
    singleMediaReceived: "⚡️ *Berkas lapangan diterima! Sedang mengunggah ke server cloud...*",
    singleMediaAnalysis: "🤖 *Media sukses disimpan di Cloud. Menganalisis caption data lapangan dengan AI Gemini...*",
    singleMediaSuccessHeader: "✅ *DATA LAPANGAN BERHASIL DISINKRONKAN!*",
    authRequired: "⚠️ Silakan isi email atau telepon Anda yang terdaftar.\nFormat: `/auth [email_atau_telepon]`",
    authSearching: "🔍 Menyelidiki database Surveyor untuk \"{input}\"...",
    authNotFound: "❌ Akun \"{input}\" tidak terdaftar di sistem. Harap hubungi administrator pusat untuk mendaftarkan akun Surveyor Anda terlebih dahulu.",
    authDbError: "⚠️ Terjadi kesalahan internal database saat mendaftarkan sesi. Hubungi teknisi kami. Detail Error: {err}",
    fallbackGuidance: "💡 *Butuh bantuan?* Harap kirimkan foto atau video lapangan yang ingin didokumentasikan, sertakan informasi penting pada bagian caption/keterangan gambar!",
    syncFailed: "⚠️ Gagal sinkronisasi data lapangan: {err}. Harap coba kembali.",
    labelName: "Nama",
    labelCategory: "Kategori",
    labelOperator: "Operator",
    labelPosisi: "Posisi",
    labelWilayah: "Wilayah",
    labelDeskripsi: "Deskripsi",
    labelMediaCount: "Jumlah Media",
    mediaSavedCount: "berkas berhasil disimpan di galeri",
    portalLinkText: "Buka platform utama untuk melihat langsung"
  },
  zh: {
    mediaGroupStart: "⚡️ *群组媒体已收到！正在从相册收集所有照片与视频...*",
    mediaGroupProcessing: "🤖 *成功收集相册中的 {count} 个媒体。正在上传文件到云端...*",
    mediaGroupFail: "❌ 无法上传您相册中的任何媒体文件。",
    mediaGroupAnalysis: "🤖 *下载并处理媒体已完成。正在使用 Gemini AI 分析现场说明数据...*",
    mediaGroupSuccessHeader: "✅ *相册现场数据同步成功！*",
    singleMediaReceived: "⚡️ *现场文件已收到！正在上传至云端服务器...*",
    singleMediaAnalysis: "🤖 *媒体成功保存到云端。正在使用 Gemini AI 分析现场说明数据...*",
    singleMediaSuccessHeader: "✅ *现场数据同步成功！*",
    authRequired: "⚠️ 请填写您已注册的邮箱或电话。\n格式: `/auth [邮箱_或_电话]`",
    authSearching: "🔍 正在数据库中查询测量员 \"{input}\"...",
    authNotFound: "❌ 账户 \"{input}\" 未在系统中注册。请先联系中心管理员注册您的测量员账户。",
    authDbError: "⚠️ 注册会话时发生内部数据库错误。请联系我们的技术人员。错误详情: {err}",
    fallbackGuidance: "💡 *需要帮助吗？* 请发送您要归档的现场照片或视频，并在说明（caption）中附上重要信息！",
    syncFailed: "⚠️ 同步现场数据失败: {err}。请重试。",
    labelName: "名称",
    labelCategory: "类别",
    labelOperator: "操作员",
    labelPosisi: "位置",
    labelWilayah: "区域",
    labelDeskripsi: "描述",
    labelMediaCount: "媒体数量",
    mediaSavedCount: "个文件成功保存到图库",
    portalLinkText: "打开主平台直接查看"
  }
};

// Media item details for media groups
interface PendingMediaItem {
  fileId: string;
  fileName: string;
  mimeType: string;
  isPhoto: boolean;
}

interface PendingMediaGroup {
  chatId: string | number;
  username: string;
  captions: string[];
  texts: string[];
  mediaList: PendingMediaItem[];
  timer: NodeJS.Timeout | null;
  receivedAt: number;
}

const pendingMediaGroups: Record<string, PendingMediaGroup> = {};

// Helper to download a file from Telegram and upload it to Firebase Storage (with local fallback)
async function uploadSingleTelegramFile(fileId: string, fileName: string, mimeType: string, token: string): Promise<string> {
  const targetFilePath = await getTelegramFilePath(fileId, token);
  if (!targetFilePath) {
    throw new Error("Gagal mengambil path berkas dari server Telegram.");
  }

  const fileBuffer = await downloadTelegramFile(targetFilePath, token);
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error("Gagal memproses data unduhan media.");
  }

  let mediaUrl = "";
  try {
    // Ensure we have an authenticated Firebase session so Storage security rules authorize the upload
    await getClientAuth();

    // Store in Firebase Storage using the Client SDK
    const userUid = auth.currentUser?.uid || "telegram";
    const storageRef = ref(storage, `buildings/${userUid}/${fileName}`);
    const uploadBytesResult = await uploadBytes(storageRef, new Uint8Array(fileBuffer), { contentType: mimeType });
    mediaUrl = await getDownloadURL(uploadBytesResult.ref);
    console.log("[Media Upload Helper] Uploaded successfully to Firebase Storage:", mediaUrl);
  } catch (storageErr: any) {
    console.warn("[Media Upload Helper] Firebase Storage upload failed/unauthorized, falling back to local server storage:", storageErr.message || storageErr);
    
    // Save file locally on the container as robust fallback
    const localPath = path.join(process.cwd(), "uploads", fileName);
    fs.writeFileSync(localPath, Buffer.from(fileBuffer));
    
    const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    mediaUrl = appUrl ? `${appUrl}/uploads/${fileName}` : `/uploads/${fileName}`;
    console.log("[Media Upload Helper] Stored and accessible locally:", mediaUrl);
  }

  return mediaUrl;
}

// Processor for group/album messages sent as a media group
async function processMediaGroup(group: PendingMediaGroup, token: string) {
  const chatId = group.chatId;
  const username = group.username;

  try {
    // Determine language from session
    const dbSession = await getTelegramSession(chatId);
    const lang: 'id' | 'zh' = (dbSession && dbSession.lang === "zh") ? "zh" : "id";
    const msg = messages[lang];

    await sendTelegramMessage(chatId, msg.mediaGroupProcessing.replace("{count}", String(group.mediaList.length)), token);

    // Upload all files in parallel
    const uploadPromises = group.mediaList.map(async (media) => {
      try {
        const url = await uploadSingleTelegramFile(media.fileId, media.fileName, media.mimeType, token);
        return url;
      } catch (err: any) {
        console.warn(`[Process Media Group] Failed to upload a file: ${media.fileName}. Error:`, err.message || err);
        return null;
      }
    });

    const results = await Promise.all(uploadPromises);
    const mediaUrls = results.filter((url): url is string => url !== null);

    if (mediaUrls.length === 0) {
      await sendTelegramMessage(chatId, msg.mediaGroupFail, token);
      return;
    }

    await sendTelegramMessage(chatId, msg.mediaGroupAnalysis, token);

    const activeSession = dbSession || {
      name: username,
      email: "",
      phone: "",
      role: "unverified_telegram",
      userUid: "telegram_" + chatId,
      lang: "id"
    };

    // Combine all unique captions & text
    const uniqueCaptions = Array.from(new Set(group.captions.map(c => c.trim()).filter(Boolean)));
    const uniqueTexts = Array.from(new Set(group.texts.map(t => t.trim()).filter(Boolean)));
    const combinedCaption = uniqueCaptions.join("\n") || uniqueTexts.join("\n") || `Site baru oleh ${activeSession.name}`;

    const parsedRecord = await extractStructuredRecordWithGemini(combinedCaption, activeSession.name);

    // Set the complete group's gallery list
    parsedRecord.gallery = mediaUrls;

    // Save record in Firestore using Client SDK
    const finalRecordId = `datacenter_telegram_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await getClientAuth();
    await setDoc(doc(db, "buildings", finalRecordId), {
      ...parsedRecord,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      createdBy: activeSession.userUid || "telegram_" + chatId
    });

    const portalUrl = process.env.APP_URL || "https://ai.studio/build";

    const confirmationMsg = `${msg.mediaGroupSuccessHeader}
----------------------------------------
📌 *${msg.labelName}:* ${parsedRecord.name}
📂 *${msg.labelCategory}:* ${parsedRecord.category.toUpperCase()}
👤 *${msg.labelOperator}:* ${parsedRecord.operator}
📍 *${msg.labelPosisi}:* ${parsedRecord.latitude || "0.0"}, ${parsedRecord.longitude || "0.0"}
🗺️ *${msg.labelWilayah}:* ${parsedRecord.province} - ${parsedRecord.city} - ${parsedRecord.district}
📝 *${msg.labelDeskripsi}:* ${parsedRecord.description}
🖼️ *${msg.labelMediaCount}:* ${mediaUrls.length} ${msg.mediaSavedCount}!

🔗 *${msg.portalLinkText}:*
👉 ${portalUrl}`;

    await sendTelegramMessage(chatId, confirmationMsg, token);
  } catch (err: any) {
    console.error("Failed to process Telegram media group upload:", err);
    try {
      const dbSession = await getTelegramSession(chatId);
      const lang: 'id' | 'zh' = (dbSession && dbSession.lang === "zh") ? "zh" : "id";
      const msg = messages[lang];
      await sendTelegramMessage(chatId, msg.syncFailed.replace("{err}", err.message || err), token);
    } catch (innerErr) {
      await sendTelegramMessage(chatId, `⚠️ Gagal sinkronisasi: ${err.message || err}`, token);
    }
  }
}

// Telegram message processor core (Active)
async function handleTelegramUpdate(update: any, token: string) {
  const message = update.message || update.edited_message;
  if (!message || !message.chat) {
    return;
  }

  const chatId = message.chat.id;
  const text = message.text || "";
  const caption = message.caption || "";
  const username = (message.from && (message.from.username || message.from.first_name)) || "User";

  // Load language settings for this session
  const dbSession = await getTelegramSession(chatId);
  const lang: 'id' | 'zh' = (dbSession && dbSession.lang === "zh") ? "zh" : "id";
  const msg = messages[lang];

  // Language Selection Actions (triggered from keyboard buttons or manually)
  if (text === "🇮🇩 Bahasa Indonesia" || text === "/lang_id") {
    await getClientAuth();
    await setDoc(doc(db, "telegram_sessions", String(chatId)), { lang: "id" }, { merge: true });
    
    // Update local memory cache helper
    if (authenticatedSessions[String(chatId)]) {
      authenticatedSessions[String(chatId)].lang = "id";
    } else {
      authenticatedSessions[String(chatId)] = { lang: "id" };
    }

    const welcomeText = `Selamat datang di Bot LXVOIP Database !!

Cara penggunaan
Ketik

1. /auth [email]
2. upload/forward foto beserta captionya seperti contoh`;

    const guidePhotoUrl = "https://i.postimg.cc/52c42fvc/8F42ED6D-13EE-473A-ADC6-D2FEC07B29DB.png";
    await sendTelegramPhoto(chatId, guidePhotoUrl, welcomeText, token, { remove_keyboard: true });
    return;
  }

  if (text === "🇨🇳 中文" || text === "/lang_zh") {
    await getClientAuth();
    await setDoc(doc(db, "telegram_sessions", String(chatId)), { lang: "zh" }, { merge: true });
    
    // Update local memory cache helper
    if (authenticatedSessions[String(chatId)]) {
      authenticatedSessions[String(chatId)].lang = "zh";
    } else {
      authenticatedSessions[String(chatId)] = { lang: "zh" };
    }

    const welcomeText = `欢迎使用 LXVOIP 数据库机器人 !!

使用方法
输入

1. /auth [邮箱]
2. 像示例一样上传/转发照片及其说明（caption）`;

    const guidePhotoUrl = "https://i.postimg.cc/52c42fvc/8F42ED6D-13EE-473A-ADC6-D2FEC07B29DB.png";
    await sendTelegramPhoto(chatId, guidePhotoUrl, welcomeText, token, { remove_keyboard: true });
    return;
  }

  // 1. Handshake commands
  if (text.startsWith("/start") || text.startsWith("/help") || text.startsWith("/lang")) {
    const replyKeyboard = {
      keyboard: [
        [ { text: "🇮🇩 Bahasa Indonesia" }, { text: "🇨🇳 中文" } ]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    };
    await sendTelegramMessage(chatId, "Pilihlah bahasa Anda / 请选择您的语言:", token, replyKeyboard);
    return;
  }

  // 2. Authentication flow
  if (text.startsWith("/auth")) {
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await sendTelegramMessage(chatId, msg.authRequired, token);
      return;
    }
    const input = parts[1].trim().toLowerCase();
    
    await sendTelegramMessage(chatId, msg.authSearching.replace("{input}", input), token);
    
    let matchedSurveyor: any = null;
    let matchedSurveyorId = "";
    let categoryFound: 'surveyor' | 'admin' = 'surveyor';

    try {
      await getClientAuth();
      // Look up in surveyors standard query from Client SDK
      const snapSurveyorEmail = await getDocs(query(collection(db, "surveyors"), where("email", "==", input)));
      if (!snapSurveyorEmail.empty) {
        matchedSurveyor = snapSurveyorEmail.docs[0].data();
        matchedSurveyorId = snapSurveyorEmail.docs[0].id;
      } else {
        const snapSurveyorPhone = await getDocs(query(collection(db, "surveyors"), where("phone", "==", input)));
        if (!snapSurveyorPhone.empty) {
          matchedSurveyor = snapSurveyorPhone.docs[0].data();
          matchedSurveyorId = snapSurveyorPhone.docs[0].id;
        }
      }

      // If not found, look up in admins standard query from Client SDK
      if (!matchedSurveyor) {
        const snapAdminEmail = await getDocs(query(collection(db, "admins"), where("email", "==", input)));
        if (!snapAdminEmail.empty) {
          matchedSurveyor = snapAdminEmail.docs[0].data();
          matchedSurveyorId = snapAdminEmail.docs[0].id;
          categoryFound = 'admin';
        }
      }

      if (matchedSurveyor) {
        const name = matchedSurveyor.name || "Staff";
        // Save the Telegram mapping into firestore for persistence via Client SDK
        await getClientAuth();
        await setDoc(doc(db, "telegram_sessions", String(chatId)), {
          chatId,
          name,
          email: matchedSurveyor.email || "",
          phone: matchedSurveyor.phone || "",
          role: categoryFound,
          userUid: matchedSurveyorId,
          linkedAt: serverTimestamp()
        }, { merge: true });

        // Update local memory cache
        authenticatedSessions[String(chatId)] = {
          name,
          email: matchedSurveyor.email || "",
          phone: matchedSurveyor.phone || "",
          role: categoryFound,
          userUid: matchedSurveyorId,
          lang: lang
        };

        const successText = `🎉 *Autentikasi Berhasil! / 验证成功！*
👤 *Nama / 姓名:* ${name}
📂 *Role / 角色:* ${categoryFound.toUpperCase()}

${lang === "zh" ? "现在，您发送给此机器人的每张照片或视频都将以您的名义记录为官方操作员！" : "Sekarang setiap foto atau video yang Anda kirimkan ke bot ini akan direkam atas nama Anda sebagai operator resmi!"}`;
        await sendTelegramMessage(chatId, successText, token);
      } else {
        await sendTelegramMessage(chatId, msg.authNotFound.replace("{input}", input), token);
      }
    } catch (err: any) {
      console.error("Auth query issue:", err);
      await sendTelegramMessage(chatId, msg.authDbError.replace("{err}", err.message || err), token);
    }
    return;
  }

  // 3. Media Message upload flow
  const isPhoto = message.photo && message.photo.length > 0;
  const isVideo = message.video;
  const mediaGroupId = message.media_group_id;

  if (mediaGroupId && (isPhoto || isVideo)) {
    // If it belongs to a media group/album, buffer it first
    if (!pendingMediaGroups[mediaGroupId]) {
      pendingMediaGroups[mediaGroupId] = {
        chatId,
        username,
        captions: [],
        texts: [],
        mediaList: [],
        timer: null,
        receivedAt: Date.now()
      };
      
      // Notify only once per group
      await sendTelegramMessage(chatId, msg.mediaGroupStart, token);
    }

    const groupRef = pendingMediaGroups[mediaGroupId];

    // Append media item
    if (isPhoto) {
      const photoObj = message.photo[message.photo.length - 1];
      const fileId = photoObj.file_id;
      const fileName = `media_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.jpg`;
      const mimeType = "image/jpeg";
      groupRef.mediaList.push({ fileId, fileName, mimeType, isPhoto: true });
    } else if (isVideo) {
      const fileId = isVideo.file_id;
      const fileName = `media_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${isVideo.file_name || "video.mp4"}`;
      const mimeType = isVideo.mime_type || "video/mp4";
      groupRef.mediaList.push({ fileId, fileName, mimeType, isPhoto: false });
    }

    if (caption) {
      groupRef.captions.push(caption);
    }
    if (text) {
      groupRef.texts.push(text);
    }

    // Reset debounce timer
    if (groupRef.timer) {
      clearTimeout(groupRef.timer);
    }

    groupRef.timer = setTimeout(() => {
      const liveGroup = pendingMediaGroups[mediaGroupId];
      if (liveGroup) {
        delete pendingMediaGroups[mediaGroupId];
        processMediaGroup(liveGroup, token).catch(e => {
          console.error("Error in processMediaGroup promise:", e);
        });
      }
    }, 2000);

    return;
  }

  if (isPhoto || isVideo) {
    // Acknowledge receipt
    await sendTelegramMessage(chatId, msg.singleMediaReceived, token);

    try {
      let fileId = "";
      let fileName = "";
      let mimeType = "";

      if (isPhoto) {
        // Take the largest photo size available
        const photoObj = message.photo[message.photo.length - 1];
        fileId = photoObj.file_id;
        fileName = `tg_photo_${Date.now()}.jpg`;
        mimeType = "image/jpeg";
      } else {
        fileId = isVideo.file_id;
        fileName = `tg_video_${Date.now()}_${isVideo.file_name || "video.mp4"}`;
        mimeType = isVideo.mime_type || "video/mp4";
      }

      // Upload file cleanly using helper
      const mediaUrl = await uploadSingleTelegramFile(fileId, fileName, mimeType, token);

      await sendTelegramMessage(chatId, msg.singleMediaAnalysis, token);

      // Verify Surveyor session identity
      const activeSession = dbSession || {
        name: username,
        email: "",
        phone: "",
        role: "unverified_telegram",
        userUid: "telegram_" + chatId,
        lang: "id"
      };

      // Parse details with AI Gemini for high-fidelity smart extraction if available
      const analysisText = caption.trim() || text.trim() || `Site baru oleh ${activeSession.name}`;
      const parsedRecord = await extractStructuredRecordWithGemini(analysisText, activeSession.name);

      // Set the uploaded gallery file
      parsedRecord.gallery = [mediaUrl];

      // Save record in Firestore via Client SDK
      const finalRecordId = `datacenter_telegram_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await getClientAuth();
      await setDoc(doc(db, "buildings", finalRecordId), {
        ...parsedRecord,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        createdBy: activeSession.userUid || "telegram_" + chatId
      });

      const portalUrl = process.env.APP_URL || "https://ai.studio/build";

      const confirmationMsg = `${msg.singleMediaSuccessHeader}
----------------------------------------
📌 *${msg.labelName}:* ${parsedRecord.name}
📂 *${msg.labelCategory}:* ${parsedRecord.category.toUpperCase()}
👤 *${msg.labelOperator}:* ${parsedRecord.operator}
📍 *${msg.labelPosisi}:* ${parsedRecord.latitude || "0.0"}, ${parsedRecord.longitude || "0.0"}
🗺️ *${msg.labelWilayah}:* ${parsedRecord.province} - ${parsedRecord.city} - ${parsedRecord.district}
📝 *${msg.labelDeskripsi}:* ${parsedRecord.description}

🔗 *${msg.portalLinkText}:*
👉 ${portalUrl}`;

      await sendTelegramMessage(chatId, confirmationMsg, token);
    } catch (err: any) {
      console.error("Failed to compile Telegram upload:", err);
      await sendTelegramMessage(chatId, msg.syncFailed.replace("{err}", err.message || err), token);
    }
    return;
  }

  // Fallback chat guidance for random unhandled text
  if (text) {
    await sendTelegramMessage(chatId, msg.fallbackGuidance, token);
  }
}

// Telegram API Helper calls
async function getTelegramFilePath(fileId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const data = await res.json() as any;
    if (data.ok && data.result) {
      return data.result.file_path;
    }
  } catch (err) {
    console.error("Error fetching file path:", err);
  }
  return null;
}

async function downloadTelegramFile(filePath: string, token: string): Promise<Buffer | null> {
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("Error downloading file:", err);
  }
  return null;
}

async function sendTelegramMessage(chatId: string | number, text: string, token: string, replyMarkup?: any, parseMode: string = "Markdown") {
  try {
    const payload: any = {
      chat_id: chatId,
      text: text,
      parse_mode: parseMode
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error("Failed to send message to telegram:", err);
  }
}

async function sendTelegramPhoto(chatId: string | number, photoUrl: string, caption: string, token: string, replyMarkup?: any, parseMode: string = "Markdown") {
  try {
    const payload: any = {
      chat_id: chatId,
      photo: photoUrl,
      caption: caption,
      parse_mode: parseMode
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn("[Telegram sendPhoto Error, falling back to sendMessage]:", errText);
      await sendTelegramMessage(chatId, caption, token, replyMarkup, parseMode);
    }
  } catch (err) {
    console.error("Failed to send photo to Telegram, falling back to text:", err);
    await sendTelegramMessage(chatId, caption, token, replyMarkup, parseMode);
  }
}

function isVideoUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:video/')) {
    return true;
  }
  const cleanUrl = url.split('?')[0].toLowerCase();
  return cleanUrl.endsWith('.mp4') || 
         cleanUrl.endsWith('.webm') || 
         cleanUrl.endsWith('.ogg') || 
         cleanUrl.endsWith('.mov') ||
         cleanUrl.includes('youtube.com/embed/') || 
         cleanUrl.includes('youtube.com/watch') || 
         cleanUrl.includes('youtu.be/');
}

function getAbsoluteMediaUrl(item: any): string {
  if (!item) return "";
  let url = typeof item === 'string' ? item : (item.url || "");
  if (!url) return "";
  // Check if url is a relative pathname starting with "/"
  if (url.startsWith("/")) {
    const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    return `${appUrl}${url}`;
  }
  return url;
}

function isItemVideo(item: any): boolean {
  if (!item) return false;
  if (typeof item !== "string" && item.type === "video") {
    return true;
  }
  const url = typeof item === "string" ? item : (item.url || "");
  return isVideoUrl(url);
}

async function sendTelegramVideo(chatId: string | number, videoUrl: string, caption: string, token: string, replyMarkup?: any, parseMode: string = "Markdown") {
  try {
    const payload: any = {
      chat_id: chatId,
      video: videoUrl,
      caption: caption,
      parse_mode: parseMode
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn("[Telegram sendVideo Error, falling back to sendMessage]:", errText);
      await sendTelegramMessage(chatId, caption, token, replyMarkup, parseMode);
    }
  } catch (err) {
    console.error("Failed to send video to Telegram, falling back to text:", err);
    await sendTelegramMessage(chatId, caption, token, replyMarkup, parseMode);
  }
}

async function sendTelegramMediaGroup(chatId: string | number, mediaList: any[], caption: string, token: string, parseMode: string = "Markdown") {
  try {
    // Filter and sanitize media items to ensure we don't send empty or invalid items
    const validItems = mediaList.filter(item => {
      const url = getAbsoluteMediaUrl(item);
      return url && url.trim() !== "";
    });

    const truncatedMedia = validItems.slice(0, 10);
    const mediaPayload = truncatedMedia.map((item, index) => {
      const url = getAbsoluteMediaUrl(item);
      const isVideo = isItemVideo(item);
      
      const mediaItem: any = {
        type: isVideo ? "video" : "photo",
        media: url
      };
      
      if (index === 0) {
        mediaItem.caption = caption;
        mediaItem.parse_mode = parseMode;
      }
      return mediaItem;
    });

    // 1. Try sending as standard plain JSON nested array (the correct way for application/json)
    let res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        media: mediaPayload
      })
    });

    // 2. If standard way fails, try double-stringified JSON format fallback
    if (!res.ok) {
      const errText = await res.text();
      console.warn("[Telegram sendMediaGroup standard JSON failed, retrying double-stringified array fallback... Error details]:", errText);
      
      res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          media: JSON.stringify(mediaPayload)
        })
      });
    }

    // 3. If BOTH formats failed, fallback sequentially to individual media items
    if (!res.ok) {
      const errResultText = await res.text();
      console.warn("[Telegram sendMediaGroup completely failed, falling back to sequential individual media messages! Response]:", errResultText);
      
      const firstItem = truncatedMedia[0];
      const url = getAbsoluteMediaUrl(firstItem);
      if (isItemVideo(firstItem)) {
        await sendTelegramVideo(chatId, url, caption, token, null, parseMode);
      } else {
        await sendTelegramPhoto(chatId, url, caption, token, null, parseMode);
      }
      
      if (truncatedMedia.length > 1) {
        for (let i = 1; i < truncatedMedia.length; i++) {
          const innerItem = truncatedMedia[i];
          const itemUrl = getAbsoluteMediaUrl(innerItem);
          if (isItemVideo(innerItem)) {
            await sendTelegramVideo(chatId, itemUrl, "", token, null, parseMode);
          } else {
            await sendTelegramPhoto(chatId, itemUrl, "", token, null, parseMode);
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to send media group to Telegram:", err);
    await sendTelegramMessage(chatId, caption, token, null, parseMode);
  }
}

// AI Gemini analysis call using @google/genai module
async function extractStructuredRecordWithGemini(userCaption: string, activeUserName: string): Promise<any> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.warn("GEMINI_API_KEY absent, calling fallback parser.");
    return fallbackRegexParser(userCaption, activeUserName);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const systemInstruction = `You are an expert parsing module for the LXVOIP multi-dimensional data platform.
Your objective is to analyze the user's caption of an engineering action, and output a valid JSON record complying with our database schema.
Languages supported: Indonesian, Chinese (Mandarin), English. 

The user caption often follows a specific multi-line layout:
- Line 1: Location/Region short string, often Province + City + Index/Floor (e.g., "江西抚州6" or "山东济南开发区"). Translate or map this to standardized Chinese characters:
  - Province (e.g., "江西" -> "江西省")
  - City (e.g., "抚州" -> "抚州市")
  - If there is a trailing number (e.g., "6" at the end of "江西抚州6"), interpret it as the 'installedLines' or floors, or use it when applicable.
- Line 2: The Site / Building / Unit Name (e.g., "抚州市政务服务中心"). Use this exactly as the site 'name'.
- Line 3 and beyond: The detailed notes, description, or instructions (e.g., "图1图2是大楼外面... 剩下楼层你们自己探索..."). This is the detailed 'description'.

Alternatively, the user might specify with explicit labels e.g., "nama: [nama]", "provinsi: [provinsi]", etc. Handle both formats robustly.

Fields to extract:
1. name (Site Name or Site Title, default: "Situs Telegram" or "电报现场")
2. category (must be exactly one of 'survey', 'line', or 'installation'. Default is 'survey')
3. operator (name of the field engineer. If not mentioned in caption, use "${activeUserName}")
4. province (Province in China, e.g., "江西省")
5. city (City in China, e.g., "抚州市")
6. district (District in China, e.g., "临川区" for Fuzhou or "月湖区" for Yingtan)
7. latitude (decimal float coordinate. Use 27.9863 for Fuzhou, Jiangxi or 28.2435 for Yingtan, Jiangxi if not explicitly specified)
8. longitude (decimal float coordinate. Use 116.3584 for Fuzhou, Jiangxi or 117.0351 for Yingtan, Jiangxi if not explicitly specified)
9. description (notes/detailed information of what is shown/done)
10. longDistanceLines (integer)
11. localLines (integer)
12. longDistancePhones (integer)
13. localPhones (integer)
14. installedLines (integer)
15. totalDuration (number hours)

Please translate/normalize the province/city/district inputs to accurate standard Chinese characters if you detect names like Shandong -> 山东省, Jiujiang -> 九江市, Yingtan -> 鹰潭市, Yuehu -> 月湖区, Fuzhou -> 抚州市.
If Indonesian descriptions represent locations, parse them correctly.

Return ONLY structured JSON conforming to the requested response schema.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userCaption,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            category: { type: Type.STRING },
            operator: { type: Type.STRING },
            province: { type: Type.STRING },
            city: { type: Type.STRING },
            district: { type: Type.STRING },
            latitude: { type: Type.NUMBER },
            longitude: { type: Type.NUMBER },
            description: { type: Type.STRING },
            longDistanceLines: { type: Type.INTEGER },
            localLines: { type: Type.INTEGER },
            longDistancePhones: { type: Type.INTEGER },
            localPhones: { type: Type.INTEGER },
            installedLines: { type: Type.INTEGER },
            totalDuration: { type: Type.NUMBER }
          },
          required: ["name", "category", "operator", "province", "city", "district", "description"]
        }
      }
    });

    if (response && response.text) {
      const parsed = JSON.parse(response.text.trim());
      // Re-validate category values
      const validCategories = ['survey', 'line', 'installation'];
      if (!validCategories.includes(parsed.category)) {
        parsed.category = 'survey';
      }
      parsed.floors = parsed.category === 'installation' ? (parsed.installedLines || 1) : 1;
      parsed.location = `${parsed.province} ${parsed.city} ${parsed.district}`;
      return parsed;
    }
  } catch (error) {
    console.error("Gemini Parsing failed: ", error);
  }

  return fallbackRegexParser(userCaption, activeUserName);
}

// Fallback plain regex parser if Gemini is key-less or down
function fallbackRegexParser(caption: string, username: string): any {
  let category: 'survey' | 'line' | 'installation' = 'survey';
  if (/line|kabel|sambungan/i.test(caption)) category = 'line';
  else if (/install|pasang|selesai/i.test(caption)) category = 'installation';

  const lines = caption.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Try line-by-line smart mapping if we don't have colon colons
  let finalName = "Telegram " + (category.toUpperCase());
  let province = "江西省";
  let city = "鹰潭市";
  let district = "月湖区";
  let lat = 28.2435;
  let lng = 117.0351;
  let description = caption;
  let installedLines = 1;

  // Check if formatting is without colons (e.g. Jiangxi Fuzhou 6)
  if (lines.length >= 2 && !caption.includes(':') && !caption.includes('：')) {
    let locLine = lines[0];
    const nameLine = lines[1];
    
    // Extract trailing number if present, e.g., "6" at the end of "江西抚州6"
    const numberMatch = locLine.match(/(\d+)$/);
    if (numberMatch) {
      installedLines = parseInt(numberMatch[1], 10);
      locLine = locLine.replace(/\d+$/, '').trim();
    }
    
    // Simple checks for province and city mapping
    if (locLine.includes("江西") || locLine.includes("Jiangxi")) {
      province = "江西省";
    } else if (locLine.includes("山东") || locLine.includes("Shandong")) {
      province = "山东省";
    }
    
    if (locLine.includes("抚州") || locLine.includes("Fuzhou")) {
      city = "抚州市";
      district = "临川区";
      lat = 27.9863;
      lng = 116.3584;
    } else if (locLine.includes("鹰潭") || locLine.includes("Yingtan")) {
      city = "鹰潭市";
      district = "月湖区";
      lat = 28.2435;
      lng = 117.0351;
    }
    
    finalName = nameLine;
    
    if (lines.length > 2) {
      description = lines.slice(2).join('\n');
    }
  } else {
    // Traditional colon search
    const nameMatch = caption.match(/nama\s*[:：]\s*([^\n]+)/i);
    const provinceMatch = caption.match(/provinsi\s*[:：]\s*([^\n]+)/i);
    const cityMatch = caption.match(/kota\s*[:：]\s*([^\n]+)/i);
    const districtMatch = caption.match(/kecamatan|district\s*[:：]\s*([^\n]+)/i);

    const latMatch = caption.match(/lat(?:itude)?\s*[:：]\s*(-?\d+(?:\.\d+)?)/i);
    const lngMatch = caption.match(/lon(?:gitude)?|lng\s*[:：]\s*(-?\d+(?:\.\d+)?)/i);

    if (nameMatch) finalName = nameMatch[1].trim();
    if (provinceMatch) province = provinceMatch[1].trim();
    if (cityMatch) {
      city = cityMatch[1].trim();
      if (city.includes("抚州") || city.includes("Fuzhou")) {
        city = "抚州市";
        district = "临川区";
        lat = 27.9863;
        lng = 116.3584;
      }
    }
    if (districtMatch) district = districtMatch[1].trim();
    if (latMatch) lat = parseFloat(latMatch[1]);
    if (lngMatch) lng = parseFloat(lngMatch[1]);
  }

  const operatorMatch = caption.match(/operator\s*[:：]\s*([^\n]+)/i);
  const finalOperator = operatorMatch ? operatorMatch[1].trim() : username;

  return {
    name: finalName,
    category,
    operator: finalOperator,
    province,
    city,
    district,
    location: `${province} ${city} ${district}`,
    latitude: lat,
    longitude: lng,
    description: description,
    installedLines: installedLines,
    floors: installedLines,
    longDistanceLines: 0,
    localLines: 0,
    longDistancePhones: 0,
    localPhones: 0,
    totalDuration: 0
  };
}

// Spawns Vite development middleware or static production server
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`⚡️ Fullstack LXVOIP Application listening on http://0.0.0.0:${PORT}`);

    // Register Telegram Bot Webhook on boot automatically
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const appUrl = process.env.APP_URL;
    if (token && token !== "YOUR_TELEGRAM_BOT_TOKEN" && appUrl && appUrl !== "MY_APP_URL") {
      const localSettings = getLocalSettings();
      let enabled = localSettings.enabled;

      getClientAuth()
        .then(() => getDoc(doc(db, "settings", "telegram")))
        .then((docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data && typeof data.enabled === "boolean") {
              enabled = data.enabled;
              saveLocalSettings({ enabled });
            }
          }
        })
        .catch((dbErr) => {
          console.warn("[Telegram Setup] Database check failed, relying on local configuration:", dbErr);
        })
        .finally(() => {
          if (enabled) {
            const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram-webhook`;
            console.log(`[Telegram Setup] Bot is enabled. Registering webhook to ${webhookUrl}...`);
            fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`)
              .then(r => r.json())
              .then(data => console.log("[Telegram Setup] Webhook registration response:", data))
              .catch(err => console.error("[Telegram Setup] Failed to register webhook on boot:", err));
          } else {
            console.log("[Telegram Setup] Bot is DISABLED. Deleting webhook...");
            fetch(`https://api.telegram.org/bot${token}/deleteWebhook`)
              .then(r => r.json())
              .then(data => console.log("[Telegram Setup] Webhook deleted on start:", data))
              .catch(err => console.error("[Telegram Setup] Failed to delete webhook on boot:", err));
          }
        });
    } else {
      console.log("[Telegram Setup] Webhook auto-registration skipped: Token or APP_URL is unconfigured/placeholder.");
    }
  });
}

startServer();
