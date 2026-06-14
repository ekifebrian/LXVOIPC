import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { doc, setDoc, query, collection, where, getDocs, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage, auth } from "./src/firebase";
import dotenv from "dotenv";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getApps, initializeApp, getApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Firestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";

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

const app = express();
const PORT = 3000;

app.use(express.json());

// API route to let the frontend know the Telegram Bot status (Disabled)
app.get("/api/telegram-info", async (req, res) => {
  res.json({
    active: false,
    botUsername: null,
    instructionsUrl: process.env.APP_URL || "http://localhost:3000",
    message: "Telegram Bot is currently disabled."
  });
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

// Telegram message processor core (Disabled)
async function handleTelegramUpdate(update: any, token: string) {
  return;
}

async function unused_placeholder() {
  const token = "";
  const authenticatedSessions: Record<string, any> = {};
  const ensureAuthenticated = async () => {};
  const message = { chat: { id: 0 }, text: "", caption: "", from: { username: "", first_name: "" }, photo: [] as any[], video: null as any };
  const chatId = message.chat.id;
  const text = message.text || "";
  const caption = message.caption || "";
  const username = message.from.username || message.from.first_name || "User";

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
      // Look up in surveyors
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

      // If not found, look up in admins
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
        // Save the Telegram mapping into firestore for persistence via admin SDK
        await adminDb.collection("telegram_sessions").doc(String(chatId)).set({
          chatId,
          name,
          email: matchedSurveyor.email || "",
          phone: matchedSurveyor.phone || "",
          role: categoryFound,
          userUid: matchedSurveyorId,
          linkedAt: FieldValue.serverTimestamp()
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
    } catch (err) {
      console.error("Auth query issue:", err);
      await sendTelegramMessage(chatId, `⚠️ Terjadi kesalahan internal database saat mendaftarkan sesi. Hubungi teknisi kami.`, token);
    }
    return;
  }

  // 3. Media Message upload flow
  const isPhoto = message.photo && message.photo.length > 0;
  const isVideo = message.video;

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

      // Download from Telegram
      const targetFilePath = await getTelegramFilePath(fileId, token);
      if (!targetFilePath) {
        await sendTelegramMessage(chatId, `❌ Gagal mengambil path berkas dari server Telegram.`, token);
        return;
      }

      const fileBuffer = await downloadTelegramFile(targetFilePath, token);
      if (!fileBuffer || fileBuffer.length === 0) {
        await sendTelegramMessage(chatId, `❌ Gagal memproses data unduhan media.`, token);
        return;
      }

      // Store in Firebase Storage using the authenticated Client SDK (bypasses unauthenticated storage rules)
      const userUid = auth.currentUser?.uid || "telegram";
      const storageRef = ref(storage, `buildings/${userUid}/${fileName}`);
      const uploadBytesResult = await uploadBytes(storageRef, new Uint8Array(fileBuffer), { contentType: mimeType });
      const mediaUrl = await getDownloadURL(uploadBytesResult.ref);

      await sendTelegramMessage(chatId, `🤖 *Media sukses disimpan di Cloud. Menganalisis caption data lapangan dengan AI Gemini...*`, token);

      // Verify Surveyor session identity
      const activeSession = authenticatedSessions[String(chatId)] || {
        name: username,
        email: "",
        phone: "",
        role: "unverified_telegram",
        userUid: "telegram_" + chatId
      };

      // Parse details directly without AI Gemini for instant synchronized results (as requested)
      const analysisText = caption.trim() || text.trim() || `Site baru oleh ${activeSession.name}`;
      const parsedRecord = fallbackRegexParser(analysisText, activeSession.name);

      // Set the uploaded gallery file
      parsedRecord.gallery = [mediaUrl];

      // Save record in Firestore via superuser admin SDK to avoid permission_denied or credential synchronization delays
      const finalRecordId = `datacenter_telegram_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      
      await adminDb.collection("buildings").doc(finalRecordId).set({
        ...parsedRecord,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
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
  });
}

startServer();
