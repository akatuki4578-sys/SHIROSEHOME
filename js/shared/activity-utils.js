const MIN_MONTH = 2026 * 12 + 9;
const pad = (n) => String(n).padStart(2, "0");
const dateString = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const monthIndex = (d) => d.getFullYear() * 12 + d.getMonth();
const colors = { blue: "bg-blue-100 text-blue-900", purple: "bg-purple-100 text-purple-900", amber: "bg-amber-100 text-amber-900", green: "bg-green-100 text-green-900", rose: "bg-rose-100 text-rose-900", gray: "bg-gray-100 text-gray-800" };
const colorNames = { blue: "青", purple: "紫", amber: "黄", green: "緑", rose: "赤", gray: "灰" };
const isFixedType = (type) => ["stream", "collab", "rest"].includes(type?.system_key ?? "");
const displayEventTitle = (event, type) => event.title.trim() || type?.name || "予定";
const isStreamType = (type) => type?.system_key === "stream" || type?.system_key === "collab";
const formatDuration = (minutes) => `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
const inputClass = "mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm";
const buttonClass = "rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-40";

export { MIN_MONTH, pad, dateString, monthIndex, colors, colorNames, isFixedType, displayEventTitle, isStreamType, formatDuration, inputClass, buttonClass };
