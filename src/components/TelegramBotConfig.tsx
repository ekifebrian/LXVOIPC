import React, { useState, useEffect } from 'react';
import { Bot, Check, Copy, ExternalLink, HelpCircle, RefreshCw, Send, ShieldAlert, Sparkles, UserCheck, Globe, Terminal, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Language } from '../languages';

interface TelegramBotConfigProps {
  lang: Language;
}

interface BotInfo {
  active: boolean;
  botUsername: string | null;
  botFirstName?: string;
  instructionsUrl: string;
  message: string;
}

export default function TelegramBotConfig({ lang }: TelegramBotConfigProps) {
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // VPS Webhook manual registration fields
  const [customUrl, setCustomUrl] = useState('https://lxvoip.kirim-cepat.xyz');
  const [isSettingWebhook, setIsSettingWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<any>(null);
  const [webhookError, setWebhookError] = useState<string | null>(null);

  const fetchBotInfo = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/telegram-info');
      const data = await response.json();
      setBotInfo(data);
    } catch (err) {
      console.error('Failed to fetch telegram bot info:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBotInfo();
  }, []);

  const handleRegisterWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSettingWebhook(true);
    setWebhookResult(null);
    setWebhookError(null);

    try {
      const res = await fetch('/api/manual-webhook-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customUrl })
      });
      const data = await res.json();
      if (!res.ok) {
        setWebhookError(data.error || 'Failed to register webhook. Make sure Bot Token is configured.');
      } else {
        setWebhookResult(data.data);
      }
    } catch (err: any) {
      setWebhookError(err.message || 'Network error occurred');
    } finally {
      setIsSettingWebhook(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const isIndo = lang === 'id';

  const titleText = isIndo ? 'Integrasi Bot Telegram' : '电报机器人集成 (Telegram Bot)';
  const descText = isIndo 
    ? 'Kelola dan pelajari cara mengirimkan survei, kabel, dan instalasi langsung dari lapangan menggunakan Telegram Bot.' 
    : '在此了解、链接并管理外勤测量员及管理员如何直接通过 Telegram 电报机器人回传现场多维勘探测线及施工数据。';

  const statusLabel = isIndo ? 'Status Integrasi Bot' : '机器人对接状态';
  const activeLabel = isIndo ? 'Aktif' : '已启用 (Active)';
  const inactiveLabel = isIndo ? 'Nonaktif' : '未启用 / 缺失Token';
  
  const botUserLabel = isIndo ? 'Username Bot' : '机器人用户名';
  const openBotText = isIndo ? 'Buka Bot Telegram' : '在 Telegram 中打开';
  
  const authTitle = isIndo ? '🔑 Langkah 1: Hubungkan Akun Surveyor (Autentikasi)' : '🔑 步骤一：绑定外勤人员账号 (身份认证)';
  const authDesc = isIndo
    ? 'Sebelum mengirim data, surveyor wajib menghubungkan Telegram mereka ke sistem agar tercatat sebagai operator resmi.'
    : '在外勤人员向机器人投递图片前，需建立电报会话与系统“踩点员/管理员”账号映射，以便系统正确归属其操作名称。';

  const sendTitle = isIndo ? '📸 Langkah 2: Kirim Foto/Video & Caption Lapangan' : '📸 步骤二：向机器人发送现场多图/视频及简本文字';
  const sendDesc = isIndo
    ? 'Kirim media lapangan Anda. Pada caption, tulis detail lokasi dengan format bebas. AI Gemini akan otomatis memilah!'
    : '在 Telegram 聊天窗口中发送勘探现场照片或视频附件，同时在“附言 (Caption)”输入框中填写现场说明或地理信息，AI Gemini 将会自动从文字中提取字段填充至数据库。';

  return (
    <div id="telegram_bot_config_card" className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col gap-6 shadow-3xs animate-fade-in text-slate-700">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-sans font-black text-xl text-slate-900 flex items-center gap-2">
            <Bot className="w-6 h-6 text-blue-600" />
            {titleText}
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">{descText}</p>
        </div>
        <button
          onClick={fetchBotInfo}
          disabled={isLoading}
          className="flex items-center gap-1.5 self-start sm:self-center bg-slate-50 border border-slate-200 hover:bg-slate-100/85 hover:border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {isIndo ? 'Segarkan' : '刷新状态'}
        </button>
      </div>

      {/* BOT STATUS BANNER */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`md:col-span-2 p-5 rounded-2xl border flex items-center gap-4 transition duration-200 ${
          botInfo?.active 
            ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' 
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          <div className="relative flex h-3 w-3 shrink-0">
            {botInfo?.active && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${botInfo?.active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
          </div>
          <div className="flex-grow">
            <span className="text-[10px] font-black uppercase tracking-wider block text-slate-400">{statusLabel}</span>
            <span className="text-sm font-black block mt-0.5">
              {botInfo?.active ? activeLabel : inactiveLabel}
            </span>
          </div>
          {botInfo?.active && botInfo.botUsername && (
            <a
              href={`https://t.me/${botInfo.botUsername}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3 rounded-lg transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {openBotText}
            </a>
          )}
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center justify-between gap-4 shadow-3xs">
          <div>
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">{botUserLabel}</span>
            <span className="text-sm font-bold text-slate-900 block mt-1 select-all">
              {botInfo?.active && botInfo.botUsername ? `@${botInfo.botUsername}` : '—'}
            </span>
          </div>
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
            <Send className="w-5 h-5" />
          </div>
        </div>
      </div>

      {!botInfo?.active && (
        <div className="bg-amber-50 rounded-2xl border border-amber-200/60 p-4 flex gap-3 text-amber-900">
          <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs flex flex-col gap-1.5">
            <span className="font-extrabold block">
              {isIndo ? 'Token Bot Telegram Belum Diatur' : '电报机器人尚未就绪'}
            </span>
            <span>
              {isIndo 
                ? 'Silakan tambahkan variabel lingkungan `TELEGRAM_BOT_TOKEN` di panel rahasia AI Studio. Mintalah token dari @BotFather di Telegram lalu terapkan.'
                : '系统在其运行环境中检测到您未设定或仍处于占位符状态的 `TELEGRAM_BOT_TOKEN` 环境变量。请前往 AI Studio 左下角 Secrets / Key 设定看板或 VPS 環境，配置真实的电报 Authorization Token，重启服务器后即可开始运作。'}
            </span>
          </div>
        </div>
      )}

      {/* MANUAL/VPS WEBHOOK INTEGRATION PANEL */}
      <div id="vps_webhook_config_form" className="bg-slate-50 rounded-2xl border border-slate-200/50 p-5 flex flex-col gap-4">
        <div>
          <h3 className="font-sans font-black text-sm text-slate-900 flex items-center gap-1.5">
            <Globe className="w-4.5 h-4.5 text-blue-600" />
            {isIndo ? 'Konfigurasi Webhook VPS (Wajib HTTPS)' : '配置部署在 VPS 上的 HTTPS Webhook'}
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">
            {isIndo
              ? 'Telegram mewajibkan HTTPS (SSL) untuk menyambungkan webhook. Jika Anda mendeploy sistem di VPS seperti http://154.38.116.170/, Anda wajib menghubungkan domain dengan SSL (contoh: https://eki.my.id atau nama domain lain) ke IP VPS tersebut melalui SSL/TLS (Certbot / Cloudflare), lalu daftarkan URL-nya di bawah.'
              : 'Telegram 机器人要求 Webhook 的目标传输地址必须是通过 SSL 加密的 https:// 链接。如需让部署在 VPS 中的电报接收器实时生效，请先为 154.38.116.170 绑定域名及 HTTPS，并在下方填入该 HTTPS 域名。'}
          </p>
        </div>

        <form onSubmit={handleRegisterWebhook} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-grow">
            <input
              type="text"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://eki.my.id"
              required
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-800 placeholder-slate-400 font-mono shadow-xs focus:ring-1 focus:ring-blue-500 focus:outline-none transition h-10"
            />
          </div>
          <button
            type="submit"
            disabled={isSettingWebhook}
            className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs py-2 px-5 rounded-xl flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer disabled:opacity-50 h-10"
          >
            {isSettingWebhook ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {isIndo ? 'Menghubungkan...' : '配置中...'}
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                {isIndo ? 'Hubungkan Webhook' : 'Aktivasi Webhook'}
              </>
            )}
          </button>
        </form>

        {/* FEEDBACK STATE FROM TELEGRAM API */}
        {webhookResult && (
          <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4 text-emerald-800 text-xs flex gap-3 animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 w-full overflow-hidden">
              <span className="font-extrabold">{isIndo ? 'Sukses Mendaftarkan Webhook!' : '成功自 Telegram 处建立 Webhook 映射！'}</span>
              <span className="text-[11px] text-slate-600 break-all font-mono">
                {JSON.stringify(webhookResult)}
              </span>
            </div>
          </div>
        )}

        {webhookError && (
          <div className="bg-rose-50 rounded-xl border border-rose-100 p-4 text-rose-800 text-xs flex gap-3 animate-fade-in">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 w-full">
              <span className="font-extrabold">{isIndo ? 'Gagal Menghubungkan' : '更新 Webhook 失败'}</span>
              <span className="text-[11px] text-rose-700">
                {webhookError}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* DETAILED USER GUIDE / TUTORIAL FOR FIELD ENGINEERS */}
      <div className="flex flex-col gap-4 border-t border-slate-100 pt-6">
        <h3 className="font-sans font-black text-sm text-slate-900 flex items-center gap-1.5 select-none">
          <HelpCircle className="w-4 h-4 text-blue-600" />
          {isIndo ? 'Panduan Penggunaan Untuk Tim Lapangan' : '外勤测量员电报离线回传使用说明'}
        </h3>

        {/* STEP 1: AUTHENTICATION */}
        <div className="p-5 bg-slate-50/50 border border-slate-200/40 rounded-2xl flex flex-col gap-3.5">
          <div className="flex items-start gap-3">
            <UserCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <h4 className="text-xs font-black text-slate-950">{authTitle}</h4>
              <span className="text-[11px] text-slate-400 mt-0.5">{authDesc}</span>
            </div>
          </div>
          <div className="bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-[11px] flex items-center justify-between gap-4 border border-slate-800 shadow-inner-xs">
            <code className="select-all block">/auth surveyor@lxgroup.com</code>
            <button
              onClick={() => handleCopy('/auth surveyor@lxgroup.com', 'auth_ex')}
              className="text-slate-400 hover:text-white transition"
              title="Copy Command"
            >
              {copiedText === 'auth_ex' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 italic">
            {isIndo 
              ? '*Catatan: Anda juga bisa menulis nomor telepon resmi terdaftar sebagai parameter.' 
              : '* 提示：该命令后可跟您在后台系统中注册的任一 Surveyor 账号邮箱物理字符串或电话号码。会话一经关联终身有效。'}
          </p>
        </div>

        {/* STEP 2: REPORT SUBMISSION WITH CAPTION PARSING */}
        <div className="p-5 bg-slate-50/50 border border-slate-200/40 rounded-2xl flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <h4 className="text-xs font-black text-slate-950">{sendTitle}</h4>
              <span className="text-[11px] text-slate-400 mt-0.5">{sendDesc}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                {isIndo ? 'Contoh Format Bebas (Awal Baris)' : '推荐布局示例 A：多行非标签格式 (智能识别)'}
              </span>
              <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-[11px] h-36 flex flex-col justify-between border border-slate-800">
                <pre className="text-left whitespace-pre-wrap select-all">
{`江西抚州6
抚州市临川区政务中心
进行了现场光纤光传输布线工作。
有长途线路2根，本地安装32根。`}
                </pre>
                <button
                  onClick={() => handleCopy(`江西抚州6\n抚州市临川区政务中心\n进行了现场光纤光传输布线工作。\n有长途线路2根，本地安装32根。`, 'caption_ex_a')}
                  className="self-end text-slate-400 hover:text-white transition"
                >
                  {copiedText === 'caption_ex_a' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                {isIndo ? 'Contoh Format Berlabel' : '推荐布局示例 B：标准标签格式 (精确匹配)'}
              </span>
              <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-[11px] h-36 flex flex-col justify-between border border-slate-800">
                <pre className="text-left whitespace-pre-wrap select-all block">
{`Site A月湖
Kategori: survey
Operator: Eki Febriann
Provinsi: 江西省
Kota: 鹰潭市
Kecamatan: 月湖区`}
                </pre>
                <button
                  onClick={() => handleCopy(`Site A月湖\nKategori: survey\nOperator: Eki Febriann\nProvinsi: 江西省\nKota: 鹰潭市\nKecamatan: 月湖区`, 'caption_ex_b')}
                  className="self-end text-slate-400 hover:text-white transition"
                >
                  {copiedText === 'caption_ex_b' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 bg-white border border-slate-100 rounded-xl p-3 flex flex-col gap-2 shadow-inner-xs">
            <span className="font-extrabold flex items-center gap-1 select-none">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              {isIndo ? 'Mengapa menggunakan AI Gemini?' : '🤔 为什么可以通过 AI 自动提取字段？'}
            </span>
            <span>
              {isIndo
                ? 'Karena bot ini ditenagai model Gemini 2.5 Flash yang sangat cerdas di server. Dia akan menerjemahkan caption bebas Anda menjadi format database yang rapi, menentukan koordinat GPS yang sesuai secara otomatis, dan mengunggah gambar Anda ke Cloud Storage secara real-time.'
                : '因为本项目搭载了高度成熟的 @google/genai 大语言模型！其能够毫秒级拆解分析外勤人员发送的随笔性中文或印尼语描述信息，自动规范省、市、区，通过地理名字库推算并填充准确的位置坐标(GPS)，并将您的多媒体文件上传存储至 Cloud Storage 存盘中。'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
