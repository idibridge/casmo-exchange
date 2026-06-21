// Единая точка приёма заявок с форм casmo.io, roka-dfa.io и cryptosdacha.ru.
// Шлёт каждую заявку в Telegram на все chat_id, перечисленные в TELEGRAM_CHAT_IDS.

const ALLOWED_ORIGINS = [
  'https://casmo.io',
  'https://www.casmo.io',
  'https://roka-dfa.io',
  'https://www.roka-dfa.io',
  'https://cryptosdacha.ru',
  'https://www.cryptosdacha.ru',
];

const SITE_LABELS = {
  casmo: '🟣 CASMO',
  roka: '🔵 ROKA',
  cryptosdacha: '🟢 КриптоСдача',
};

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const body = req.body || {};
  const { site, name, contact, amount, direction, message, hp } = body;

  // honeypot: скрытое поле, которое боты обычно заполняют, а люди — нет.
  // если оно непустое — молча отвечаем "успех" и ничего не отправляем.
  if (hp) {
    console.warn('Honeypot triggered, lead dropped silently:', { site, contact });
    return res.status(200).json({ ok: true });
  }

  if (!contact || String(contact).trim().length < 2) {
    return res.status(400).json({ error: 'missing_contact' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = (process.env.TELEGRAM_CHAT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!token || chatIds.length === 0) {
    console.error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_IDS is not set');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  const label = SITE_LABELS[site] || `❓ ${site || 'unknown source'}`;
  const lines = [
    `${label} — новая заявка`,
    name ? `Имя: ${name}` : null,
    `Контакт: ${contact}`,
    amount ? `Сумма: ${amount}` : null,
    direction ? `Направление: ${direction}` : null,
    message ? `Комментарий: ${message}` : null,
  ].filter(Boolean);
  const text = lines.join('\n');

  try {
    const results = await Promise.all(
      chatIds.map((chatId) =>
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
        }).then((r) => r.json())
      )
    );

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      console.error('Telegram send failures:', JSON.stringify(failed));
    }
    if (failed.length === results.length) {
      return res.status(502).json({ error: 'telegram_send_failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Lead handler error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
