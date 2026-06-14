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

// Initialize Firebase Admin SDK using applet configurations
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

// Instantiate specific adminDb firestore client to bypass client security rules for background service tasks
let adminDb: Firestore;
try {
  const firebaseConfig = JSON.parse(readFileSync("./firebase-applet-config.json", "utf-8"));
  const databaseId = firebaseConfig.firestoreDatabaseId || "";
  const mainApp = getApps().length > 0 ? getApp() : undefined;
  adminDb = databaseId ? getFirestore(mainApp, databaseId) : getFirestore();
} catch (e) {
  adminDb = getFirestore();
}

// Ensure client SDK is authenticated to perform storage uploads
async function getClientAuth() {
  if (auth.currentUser) {
    return auth.currentUser;
  }
  try {
    const userCred = await signInWithEmailAndPassword(auth, "telegram-bot-service@lxvoip.com", "botpassword123");
    console.log("[Firebase Client Auth] Authenticated telegram-bot-service successfully");
    return userCred.user;
  } catch (err: any) {
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
      try {
        const userCred = await createUserWithEmailAndPassword(auth, "telegram-bot-service@lxvoip.com", "botpassword123");
        console.log("[Firebase Client Auth] Created and authenticated telegram-bot-service");
        return userCred.user;
      } catch (createErr) {
        console.warn("[Firebase Client Auth] Failed to create telegram-bot-service account (might already exist):", createErr);
        try {
          const userCred = await signInWithEmailAndPassword(auth, "telegram-bot-service@lxvoip.com", "botpassword123");
          return userCred.user;
        } catch (retryErr) {
          console.warn("[Firebase Client Auth] Bot service retry signin failed:", retryErr);
        }
      }
    } else {
      console.warn("[Firebase Client Auth] Tried to authenticate but got error:", err);
    }
  }

  // Fallback to demo admin account
  try {
    const userCred = await signInWithEmailAndPassword(auth, "admin@admin.com", "admin123");
    console.log("[Firebase Client Auth] Authenticated as admin fallback successfully");
    return userCred.user;
  } catch (adminErr: any) {
    if (adminErr.code === "auth/user-not-found" || adminErr.code === "auth/invalid-credential") {
      try {
        const userCred = await createUserWithEmailAndPassword(auth, "admin@admin.com", "admin123");
        console.log("[Firebase Client Auth] Created and authenticated demo admin account");
        return userCred.user;
      } catch (createAdminErr) {
        console.warn("[Firebase Client Auth] Admin fallback create failed:", createAdminErr);
      }
    } else {
      console.warn("[Firebase Client Auth] Failed to log in as admin fallback:", adminErr);
    }
  }

  return null;
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
      message: "Telegram Bot is currently disabled."
    });
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
        message: "Telegram Bot is active."
      });
    }
  } catch (err) {
    console.error("Error fetching bot info from Telegram:", err);
  }

  res.json({
    active: true,
    botUsername: "Bot",
    instructionsUrl: process.env.APP_URL || "http://localhost:3000",
    message: "Telegram Bot is active."
  });
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
    const docRef = doc(db, "telegram_sessions", cidStr);
    const docSnap = await getDoc(docRef);
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
    await sendTelegramMessage(chatId, `🤖 *Berhasil mengumpulkan ${group.mediaList.length} media dari album. Mengunggah berkas ke cloud...*`, token);

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
      await sendTelegramMessage(chatId, `❌ Gagal mengunggah satupun berkas media dari album Anda.`, token);
      return;
    }

    await sendTelegramMessage(chatId, `🤖 *Mengunduh & memproses media selesai. Menganalisis caption data lapangan dengan AI Gemini...*`, token);

    // Verify Surveyor session identity
    const dbSession = await getTelegramSession(chatId);
    const activeSession = dbSession || {
      name: username,
      email: "",
      phone: "",
      role: "unverified_telegram",
      userUid: "telegram_" + chatId
    };

    // Combine all unique captions & text
    const uniqueCaptions = Array.from(new Set(group.captions.map(c => c.trim()).filter(Boolean)));
    const uniqueTexts = Array.from(new Set(group.texts.map(t => t.trim()).filter(Boolean)));
    const combinedCaption = uniqueCaptions.join("\n") || uniqueTexts.join("\n") || `Site baru oleh ${activeSession.name}`;

    const parsedRecord = await extractStructuredRecordWithGemini(combinedCaption, activeSession.name);

    // Set the complete group's gallery list
    parsedRecord.gallery = mediaUrls;

    // Save record in Firestore
    const finalRecordId = `datacenter_telegram_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const buildingRef = doc(db, "buildings", finalRecordId);
    await setDoc(buildingRef, {
      ...parsedRecord,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      createdBy: activeSession.userUid || "telegram_" + chatId
    });

    const portalUrl = process.env.APP_URL || "https://ai.studio/build";

    const confirmationMsg = `✅ *DATA LAPANGAN ALBUM BERHASIL DISINKRONKAN!*
----------------------------------------
📌 *Nama:* ${parsedRecord.name}
📂 *Kategori:* ${parsedRecord.category.toUpperCase()}
👤 *Operator:* ${parsedRecord.operator}
📍 *Posisi:* ${parsedRecord.latitude || "0.0"}, ${parsedRecord.longitude || "0.0"}
🗺️ *Wilayah:* ${parsedRecord.province} - ${parsedRecord.city} - ${parsedRecord.district}
📝 *Deskripsi:* ${parsedRecord.description}
🖼️ *Jumlah Media:* ${mediaUrls.length} berkas berhasil disimpan di galeri!

🔗 *Buka platform utama untuk melihat langsung:*
👉 ${portalUrl}`;

    await sendTelegramMessage(chatId, confirmationMsg, token);
  } catch (err: any) {
    console.error("Failed to process Telegram media group upload:", err);
    await sendTelegramMessage(chatId, `⚠️ Gagal sinkronisasi data lapangan grup: ${err.message || err}. Harap coba kembali.`, token);
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

  // 1. Handshake commands
  if (text.startsWith("/start") || text.startsWith("/help")) {
    const welcomeText = `🤖 *Halo / 您好! Selamat datang di Bot LXVOIP Data Center!* 

Saya adalah asisten bot untuk membantu para surveyor dan admin mengunggah data survei, pengukuran kabel, dan instalasi langsung dari lapangan!

📌 *Cara Penggunaan / 使用方法:*
1. Kirim *Foto* atau *Video* lapangan Anda.
2. Di dalam *Caption (Keterangan teks)* foto tersebut, tuliskan detail datanya. Anda bebas menulis dalam format apa saja (AI Gemini akan menganalisis & mengisinya secara otomatis!), contoh:

\`\`\`
Site A月湖
Kategori: survey
Operator: Eki Febriann
Provinsi: 江西省
Kota: 鹰潭市
Kecamatan: 月湖区
Latitude: -6.12
Longitude: 106.82
Deskripsi: Tiang terpasang kokoh, aman terkendali.
\`\`\`

💡 *Fitur Autentikasi Surveyor:*
Untuk menautkan akun telegram Anda dengan nama Surveyor resmi di sistem:
Ketik: \`/auth [email_atau_nomor_telepon]\`
Contoh: \`/auth surveyor@lxgroup.com\` atau \`/auth 08123456789\`

🚀 *Kirim foto sekarang untuk mencoba!*`;

    await sendTelegramMessage(chatId, welcomeText, token);
    return;
  }

  // 2. Authentication flow
  if (text.startsWith("/auth")) {
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await sendTelegramMessage(chatId, `⚠️ Silakan isi email atau telepon Anda yang terdaftar.\nFormat: \`/auth [email_atau_telepon]\``, token);
      return;
    }
    const input = parts[1].trim().toLowerCase();
    
    await sendTelegramMessage(chatId, `🔍 Menyelidiki database Surveyor untuk "${input}"...`, token);
    
    let matchedSurveyor: any = null;
    let matchedSurveyorId = "";
    let categoryFound: 'surveyor' | 'admin' = 'surveyor';

    try {
      // Look up in surveyors using standard query and getDocs from Client SDK
      const qEmail = query(collection(db, "surveyors"), where("email", "==", input));
      const snapSurveyorEmail = await getDocs(qEmail);
      if (!snapSurveyorEmail.empty) {
        matchedSurveyor = snapSurveyorEmail.docs[0].data();
        matchedSurveyorId = snapSurveyorEmail.docs[0].id;
      } else {
        const qPhone = query(collection(db, "surveyors"), where("phone", "==", input));
        const snapSurveyorPhone = await getDocs(qPhone);
        if (!snapSurveyorPhone.empty) {
          matchedSurveyor = snapSurveyorPhone.docs[0].data();
          matchedSurveyorId = snapSurveyorPhone.docs[0].id;
        }
      }

      // If not found, look up in admins using standard query and getDocs from Client SDK
      if (!matchedSurveyor) {
        const qAdmin = query(collection(db, "admins"), where("email", "==", input));
        const snapAdminEmail = await getDocs(qAdmin);
        if (!snapAdminEmail.empty) {
          matchedSurveyor = snapAdminEmail.docs[0].data();
          matchedSurveyorId = snapAdminEmail.docs[0].id;
          categoryFound = 'admin';
        }
      }

      if (matchedSurveyor) {
        const name = matchedSurveyor.name || "Staff";
        // Save the Telegram mapping into firestore for persistence via Client SDK
        const sessionRef = doc(db, "telegram_sessions", String(chatId));
        await setDoc(sessionRef, {
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
          userUid: matchedSurveyorId
        };

        const successText = `🎉 *Autentikasi Berhasil! / 验证成功！*
👤 *Nama:* ${name}
📂 *Role:* ${categoryFound.toUpperCase()}

Sekarang setiap foto atau video yang Anda kirimkan ke bot ini akan direkam atas nama Anda sebagai operator resmi!`;
        await sendTelegramMessage(chatId, successText, token);
      } else {
        await sendTelegramMessage(chatId, `❌ Akun "${input}" tidak terdaftar di sistem. Harap hubungi administrator pusat untuk mendaftarkan akun Surveyor Anda terlebih dahulu.`, token);
      }
    } catch (err: any) {
      console.error("Auth query issue:", err);
      await sendTelegramMessage(chatId, `⚠️ Terjadi kesalahan internal database saat mendaftarkan sesi. Hubungi teknisi kami. Detail Error: ${err.message || err}`, token);
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
      await sendTelegramMessage(chatId, `⚡️ *Grup media diterima! Sedang mengumpulkan semua foto & video dari album...*`, token);
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
    await sendTelegramMessage(chatId, `⚡️ *Berkas lapangan diterima! Sedang mengunggah ke server cloud...*`, token);

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

      await sendTelegramMessage(chatId, `🤖 *Media sukses disimpan di Cloud. Menganalisis caption data lapangan dengan AI Gemini...*`, token);

      // Verify Surveyor session identity
      const dbSession = await getTelegramSession(chatId);
      const activeSession = dbSession || {
        name: username,
        email: "",
        phone: "",
        role: "unverified_telegram",
        userUid: "telegram_" + chatId
      };

      // Parse details with AI Gemini for high-fidelity smart extraction if available
      const analysisText = caption.trim() || text.trim() || `Site baru oleh ${activeSession.name}`;
      const parsedRecord = await extractStructuredRecordWithGemini(analysisText, activeSession.name);

      // Set the uploaded gallery file
      parsedRecord.gallery = [mediaUrl];

      // Save record in Firestore via Client SDK to avoid telemetry & credential dependency issue
      const finalRecordId = `datacenter_telegram_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const buildingRef = doc(db, "buildings", finalRecordId);
      await setDoc(buildingRef, {
        ...parsedRecord,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        createdBy: activeSession.userUid || "telegram_" + chatId
      });

      const portalUrl = process.env.APP_URL || "https://ai.studio/build";

      const confirmationMsg = `✅ *DATA LAPANGAN BERHASIL DISINKRONKAN!*
----------------------------------------
📌 *Nama:* ${parsedRecord.name}
📂 *Kategori:* ${parsedRecord.category.toUpperCase()}
👤 *Operator:* ${parsedRecord.operator}
📍 *Posisi:* ${parsedRecord.latitude || "0.0"}, ${parsedRecord.longitude || "0.0"}
🗺️ *Wilayah:* ${parsedRecord.province} - ${parsedRecord.city} - ${parsedRecord.district}
📝 *Deskripsi:* ${parsedRecord.description}

🔗 *Buka platform utama untuk melihat langsung:*
👉 ${portalUrl}`;

      await sendTelegramMessage(chatId, confirmationMsg, token);
    } catch (err: any) {
      console.error("Failed to compile Telegram upload:", err);
      await sendTelegramMessage(chatId, `⚠️ Gagal sinkronisasi data lapangan: ${err.message || err}. Harap coba kembali.`, token);
    }
    return;
  }

  // Fallback chat guidance for random unhandled text
  if (text) {
    await sendTelegramMessage(chatId, `💡 *Butuh bantuan?* Harap kirimkan foto atau video lapangan yang ingin didokumentasikan, sertakan informasi penting pada bagian caption/keterangan gambar!`, token);
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

async function sendTelegramMessage(chatId: string | number, text: string, token: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown"
      })
    });
  } catch (err) {
    console.error("Failed to send message to telegram:", err);
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
      const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram-webhook`;
      console.log(`[Telegram Setup] Registering webhook to ${webhookUrl}...`);
      fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`)
        .then(r => {
          if (!r.ok) {
            throw new Error(`HTTP error! status: ${r.status}`);
          }
          return r.json();
        })
        .then(data => {
          console.log("[Telegram Setup] Webhook registration response:", data);
        })
        .catch(err => {
          console.error("[Telegram Setup] Failed to register webhook on boot:", err);
        });
    } else {
      console.log("[Telegram Setup] Webhook auto-registration skipped: Token or APP_URL is unconfigured/placeholder.");
    }
  });
}

startServer();
