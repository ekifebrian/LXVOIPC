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
  enabled?: boolean;
}

export default function TelegramBotConfig({ lang }: TelegramBotConfigProps) {
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // Target Chat ID state fields
  const [forwardChatIdInput, setForwardChatIdInput] = useState('');
  const [isSavingChatId, setIsSavingChatId] = useState(false);
  const [saveChatIdSuccess, setSaveChatIdSuccess] = useState(false);
  const [saveChatIdError, setSaveChatIdError] = useState<string | null>(null);

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
      if (data && data.forwardChatId) {
        setForwardChatIdInput(data.forwardChatId);
      }
    } catch (err) {
      console.error('Failed to fetch telegram bot info:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBotState = async (nextState: boolean) => {
    setIsToggling(true);
    setWebhookError(null);
    setWebhookResult(null);
    try {
      const res = await fetch('/api/telegram-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setBotInfo(prev => prev ? { ...prev, enabled: data.enabled } : null);
        if (data.telegramResult) {
          setWebhookResult(data.telegramResult);
        }
      } else {
        setWebhookError(data.error || 'Gagal merubah status bot.');
      }
    } catch (err: any) {
      setWebhookError(err.message || 'Gagal mengirimkan perintah ke server.');
    } finally {
      setIsToggling(false);
    }
  };

  const handleSaveChatId = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingChatId(true);
    setSaveChatIdSuccess(false);
    setSaveChatIdError(null);
    try {
      const res = await fetch('/api/telegram-save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forwardChatId: forwardChatIdInput })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSaveChatIdSuccess(true);
        setBotInfo(prev => prev ? { ...prev, forwardChatId: forwardChatIdInput } : null);
        setTimeout(() => setSaveChatIdSuccess(false), 3000);
      } else {
        setSaveChatIdError(data.error || 'Gagal menyimpan Chat ID.');
      }
    } catch (err: any) {
      setSaveChatIdError(err.message || 'Gagal mengirimkan data ke server.');
    } finally {
      setIsSavingChatId(false);
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
      
      const resText = await res.text();
      let data: any = {};
      try {
        data = resText ? JSON.parse(resText) : {};
      } catch (parseErr) {
        throw new Error(isIndo
          ? `Server VPS mengembalikan respon non-JSON (Status ${res.status}). Silakan periksa apakah backend Anda berjalan dengan baik di VPS.`
          : `VPS Server implementation returned non-JSON response (Status ${res.status}). Please check if your backend application is running properly.`);
      }

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

      {/* BOT STATUS BANNER WITH ON/OFF TOGGLE SWITCH */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`md:col-span-2 p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition duration-200 ${
          botInfo?.active && botInfo?.enabled !== false
            ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' 
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          <div className="flex items-center gap-4">
            <div className="relative flex h-3 w-3 shrink-0">
              {botInfo?.active && botInfo?.enabled !== false && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${botInfo?.active && botInfo?.enabled !== false ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
            </div>
            <div className="flex-grow">
              <span className="text-[10px] font-black uppercase tracking-wider block text-slate-400">{statusLabel}</span>
              <span className="text-sm font-black block mt-0.5">
                {botInfo?.active 
                  ? (botInfo?.enabled !== false 
                      ? (isIndo ? 'Aktif (Berjalan 24/7)' : '已启用 (24/7 运行中)') 
                      : (isIndo ? 'Dimatikan (OFF)' : '已关停 (OFF)'))
                  : inactiveLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-end sm:self-center">
            {/* Toggle Power Pill */}
            {botInfo?.active && (
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-3xs select-none">
                <span className="text-xs font-bold text-slate-500 shrink-0">
                  {isIndo ? 'Daya Bot:' : '电源开关:'}
                </span>
                <button
                  onClick={() => toggleBotState(!(botInfo?.enabled !== false))}
                  disabled={isToggling}
                  type="button"
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    botInfo?.enabled !== false ? 'bg-emerald-500' : 'bg-slate-300'
                  } ${isToggling ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      botInfo?.enabled !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className={`text-xs font-black uppercase shrink-0 min-w-[24px] ${botInfo?.enabled !== false ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {botInfo?.enabled !== false ? 'ON' : 'OFF'}
                </span>
              </div>
            )}

            {botInfo?.active && botInfo?.enabled !== false && botInfo.botUsername && (
              <a
                href={`https://t.me/${botInfo.botUsername}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3 rounded-lg transition shrink-0 shadow-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {openBotText}
              </a>
            )}
          </div>
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

      {/* TARGET CHAT ID FORWARDING CONFIGURATION */}
      <div id="telegram_chat_id_config_form" className="bg-slate-50 rounded-2xl border border-slate-200/50 p-5 flex flex-col gap-4">
        <div>
          <h3 className="font-sans font-black text-sm text-slate-900 flex items-center gap-1.5">
            <Send className="w-4.5 h-4.5 text-blue-600 animate-pulse" />
            {isIndo ? 'Target Chat ID Penerusan Laporan' : '设置一键转发 Telegram 目标 ID'}
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">
            {isIndo
              ? 'Masukkan ID Chat target (bisa berupa ID Pengguna, ID Group/Supergroup negatif seperti -100xxxxxxxxxx, atau Channel Telegram) di mana bot akan meneruskan laporan data saat Anda mengklik tombol "Kirim Sekarang ke Telegram" di panel situs.'
              : '输入接收一键转发的目标 Telegram 会话 ID（例如个人 Chat ID、带负号的群组/超级群组 ID 如 -100xxxxxxxxxx，也可以是公开频道名）。配置完成后，在各个数据详情页点击“立即发送至 Telegram”即可通过本机器人完成推送转发。'}
          </p>
        </div>

        <form onSubmit={handleSaveChatId} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-grow">
            <input
              type="text"
              value={forwardChatIdInput}
              onChange={(e) => setForwardChatIdInput(e.target.value)}
              placeholder="-1001234567890"
              required
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-800 placeholder-slate-400 font-mono shadow-xs focus:ring-1 focus:ring-blue-500 focus:outline-none transition h-10"
            />
          </div>
          <button
            type="submit"
            disabled={isSavingChatId}
            className="bg-slate-900 hover:bg-slate-800 text-white font-black text-xs py-2 px-5 rounded-xl flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer h-10 min-w-[120px]"
          >
            {isSavingChatId ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {isIndo ? 'Menyimpan...' : '保存中...'}
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                {isIndo ? 'Simpan Setelan' : '保存设置'}
              </>
            )}
          </button>
        </form>

        {saveChatIdSuccess && (
          <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4 text-emerald-800 text-xs flex gap-3 animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 w-full">
              <span className="font-extrabold">{isIndo ? 'Sukses Memperbarui Target Chat ID!' : '成功更新转发目标 ID！'}</span>
              <span className="text-[11px] text-slate-600 font-medium">
                {isIndo ? 'Bot sekarang siap meneruskan laporan ke target!' : '机器人已准备好将后续网页上的一键转发传达至该会话！'}
              </span>
            </div>
          </div>
        )}

        {saveChatIdError && (
          <div className="bg-rose-50 rounded-xl border border-rose-100 p-4 text-rose-800 text-xs flex gap-3 animate-fade-in">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 w-full font-medium">
              <span className="font-extrabold">{isIndo ? 'Gagal Menyimpan' : '更新目标失败'}</span>
              <span className="text-[11px] text-rose-700">
                {saveChatIdError}
              </span>
            </div>
          </div>
        )}
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


    </div>
  );
}
