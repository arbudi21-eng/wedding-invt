// DOKU MCP client for the flat Rp 100.000 publish payment.
//
// Server-only. The DOKU MCP server is an HTTP JSON-RPC endpoint that may reply
// with plain JSON or SSE, so both are handled here. Requests are authenticated
// with the merchant Client-Id and a Basic token built from the DOKU API key.
//
// This module never talks to Supabase and never uses a privileged database key.
// Transaction status is only trusted when returned by DOKU itself.

// Live is the default so a production deploy without DOKU_MCP_URL still
// targets the real gateway. Set the env var to the sandbox URL for testing.
const DEFAULT_MCP_URL = 'https://mcp.doku.com/mcp';

let connection = null; // { protocolVersion, sessionId }
let requestId = 1;

function config() {
  return {
    url: String(process.env.DOKU_MCP_URL || DEFAULT_MCP_URL).replace(/\/$/, ''),
    clientId: process.env.DOKU_CLIENT_KEY || '',
    apiKey: process.env.DOKU_API_KEY || '',
  };
}

/** True when both credentials needed to talk to DOKU are present. */
export function isDokuConfigured() {
  const c = config();
  return Boolean(c.clientId && c.apiKey);
}

/**
 * A clear, Indonesian-language reason why payments cannot run right now.
 * The user-facing UI never sees raw DOKU error strings.
 */
function configError() {
  const c = config();
  if (!c.clientId || !c.apiKey) {
    return 'Pembayaran DOKU belum dikonfigurasi. Hubungi pemilik toko.';
  }
  // The MCP docs require an api_key_… credential. Older keys issued in a
  // different format connect but are rejected when a transaction is created.
  if (!/^api_key_/i.test(c.apiKey)) {
    return 'Kunci API DOKU tidak valid. Buat kunci api_key_ baru di dashboard DOKU.';
  }
  return null;
}

function parseResponse(text, contentType) {
  if (!contentType?.includes('text/event-stream')) {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: String(text).slice(0, 300) };
    }
  }

  // SSE: use the last parseable `data:` line.
  let out = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    try {
      out = JSON.parse(payload);
    } catch {
      // keep looking
    }
  }
  return out || { raw: String(text).slice(0, 300) };
}

async function rpc(method, params) {
  const c = config();
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'client-id': c.clientId,
    Authorization: `Basic ${Buffer.from(`${c.apiKey}:`).toString('base64')}`,
  };
  if (connection?.protocolVersion) headers['mcp-protocol-version'] = connection.protocolVersion;
  if (connection?.sessionId) headers['mcp-session-id'] = connection.sessionId;

  const response = await fetch(c.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: requestId++, method, params }),
    signal: AbortSignal.timeout(25000),
  });

  const sessionId = response.headers.get('mcp-session-id');
  if (sessionId) connection = { ...connection, sessionId };

  return {
    status: response.status,
    body: parseResponse(await response.text(), response.headers.get('content-type')),
  };
}

async function ensureInitialized() {
  if (connection?.protocolVersion) return;

  const { body } = await rpc('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'wedding-studio', version: '1.0.0' },
  });

  const protocolVersion = body?.result?.protocolVersion;
  if (!protocolVersion) {
    throw new Error(body?.error?.message || 'Gagal terhubung ke layanan DOKU.');
  }
  connection = { ...connection, protocolVersion };
}

function extractData(result) {
  const content = result?.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item?.type === 'text' && typeof item.text === 'string') {
        try {
          return JSON.parse(item.text);
        } catch {
          return { raw: item.text };
        }
      }
      if (item?.type === 'json' && item.data) return item.data;
    }
  }
  return result || {};
}

/** Translate raw DOKU errors into short, actionable Bahasa Indonesia. */
function humanize(message) {
  const text = String(message || '');
  if (/authorization|credential|apikey|api key|unauthor/i.test(text)) {
    return 'Kunci API DOKU tidak valid. Perbarui kunci API di pengaturan server.';
  }
  if (/temporarily unavailable|service unavailable|timeout/i.test(text)) {
    return 'Layanan DOKU sedang sibuk. Coba lagi beberapa saat.';
  }
  if (/searchfailed/i.test(text)) {
    return 'Gagal mencari transaksi di DOKU. Coba lagi.';
  }
  return text || 'Permintaan DOKU gagal.';
}

async function callTool(name, toolRequest) {
  try {
    await ensureInitialized();
    const { status, body } = await rpc('tools/call', { name, arguments: { toolRequest } });

    if (body?.error) {
      return { ok: false, error: humanize(body.error.message) };
    }
    if (status >= 400) {
      return { ok: false, error: 'Layanan DOKU tidak merespons. Coba lagi.' };
    }

    const result = body?.result || {};
    const data = extractData(result);
    if (result.isError) {
      return {
        ok: false,
        error: humanize(data?.responseMessage || data?.message || data?.raw),
      };
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: humanize(error?.message) };
  }
}

function normalizeStatus(row) {
  const raw = String(
    row?.latestTransactionStatus ??
      row?.transactionStatus ??
      row?.status ??
      row?.paymentStatus ??
      row?.transaction?.latestTransactionStatus ??
      row?.transaction?.transactionStatus ??
      row?.transaction?.status ??
      ''
  ).toLowerCase();

  if (['00', 'success', 'paid', 'settled', 'successful', 'captured'].includes(raw)) return 'paid';
  if (['01', '02', '03', 'pending', 'inprogress', 'in_progress', 'processing'].includes(raw)) {
    return 'pending';
  }
  if (
    ['04', '05', '06', '07', '08', '09', 'failed', 'canceled', 'cancelled', 'expired', 'void'].includes(
      raw
    )
  ) {
    return 'failed';
  }
  return 'unknown';
}

function dateParam(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** DOKU wraps query results differently across MCP versions; find any list. */
function findTransactions(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  for (const key of ['accounts', 'transactions', 'records', 'data', 'content', 'items', 'list']) {
    if (Array.isArray(data[key])) return data[key];
  }

  for (const value of Object.values(data)) {
    if (Array.isArray(value) && value.some((item) => item && typeof item === 'object')) {
      return value;
    }
    if (value && typeof value === 'object') {
      const nested = findTransactions(value);
      if (nested.length) return nested;
    }
  }

  // A single transaction returned directly.
  return normalizeStatus(data) === 'unknown' ? [] : [data];
}

/** Read an amount whether DOKU returns a string, number, or {value} object. */
function extractAmount(row) {
  const raw =
    row?.amount ??
    row?.totalAmount ??
    row?.transactionAmount ??
    row?.paidAmount ??
    row?.transaction?.amount ??
    row?.transaction?.totalAmount;
  if (raw == null) return null;
  const value = typeof raw === 'object' ? raw.value ?? raw.amount : raw;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

/**
 * Create a dynamic QRIS for the flat publish fee.
 * @returns {{ok: boolean, referenceNo?: string, partnerReferenceNo: string, qrContent?: string, error?: string}}
 */
export async function createQris({ partnerReferenceNo, amountIdr, postalCode }) {
  const invalid = configError();
  if (invalid) return { ok: false, partnerReferenceNo, error: invalid };

  const { ok, data, error } = await callTool('create_qris_payment', {
    amount: `${Number(amountIdr).toFixed(2)}`,
    partnerReferenceNo,
    postalCode: String(postalCode || '12345').replace(/\D/g, '').slice(0, 5) || '12345',
  });
  if (!ok) return { ok: false, partnerReferenceNo, error };

  const qrContent =
    data?.qrContent || data?.qrString || data?.qrCode || data?.qrContentString || data?.data?.qrContent;
  if (!qrContent) {
    return {
      ok: false,
      partnerReferenceNo,
      error: humanize(data?.responseMessage || 'DOKU tidak mengembalikan QRIS.'),
    };
  }

  return {
    ok: true,
    referenceNo: String(data.referenceNo || data.reference_number || ''),
    partnerReferenceNo: String(data.partnerReferenceNo || partnerReferenceNo),
    qrContent: String(qrContent),
  };
}

/**
 * Query DOKU for the invoice status. Only an explicit success status with the
 * exact Rp 100.000 amount is treated as paid.
 * @returns {{ok: boolean, status: 'paid'|'pending'|'failed'|'unknown', error?: string}}
 */
export async function queryQris({ partnerReferenceNo, expectedAmountIdr }) {
  const invalid = configError();
  if (invalid) return { ok: false, status: 'unknown', error: invalid };

  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { ok, data, error } = await callTool('get_transaction_by_invoice_number', {
    invoiceNumber: partnerReferenceNo,
    startDate: dateParam(from),
    endDate: dateParam(now),
    pageNumber: 1,
    pageSize: 10,
  });
  if (!ok) return { ok: false, status: 'unknown', error };

  const rows = findTransactions(data);
  const row =
    rows.find((item) =>
      String(item?.invoiceNumber || item?.partnerReferenceNo || '').includes(partnerReferenceNo)
    ) || rows[0];

  // No row yet means DOKU has not seen the payment; keep waiting.
  if (!row) return { ok: true, status: 'pending' };

  let status = normalizeStatus(row);

  // Defensive: never publish on a partial or wrong-amount payment.
  if (status === 'paid') {
    const paid = extractAmount(row);
    if (paid != null && Math.round(paid) !== Number(expectedAmountIdr)) {
      status = 'failed';
    }
  }

  return {
    ok: true,
    status,
    paidTime: String(
      row?.transactionDate || row?.paidTime || row?.transaction?.transactionDate || ''
    ),
  };
}
