// ตั้งค่า URL ของ Google Apps Script Web App (ลงท้ายด้วย /exec)
// นำ URL ที่ได้ตอน Deploy > New deployment > Web app มาใส่ตรงนี้
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyZGGTCIMLEOiSrXu-DCR3gvqisvvIouTUbe6_QFYG2sZg2m87OomXUC5WW03GlEPX_/exec";

/**
 * เรียก API ฝั่ง Google Apps Script
 * ใช้ Content-Type: text/plain โดยตั้งใจ เพื่อไม่ให้ browser ยิง CORS preflight (OPTIONS)
 * ซึ่ง Google Apps Script Web App ไม่รองรับการตอบ preflight โดยตรง
 */
async function callApi(action, payload = {}) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload }),
  });
  if (!res.ok) {
    throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ (" + res.status + ")");
  }
  return res.json();
}
