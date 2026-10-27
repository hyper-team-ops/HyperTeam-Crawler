const BASE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQU7gjhliDaRfEa4I5GAhMkB3n6xW5cWcgx_CaidVG81xv1pW1ddSuR5i8reg64g2wVJrLrIx1f3RbP/pub?output=csv";
const SOFTWARE_CSV_URL = `${BASE_URL}&gid=0`;
const COURSES_CSV_URL = `${BASE_URL}&gid=291500461`;
const SYNC_INTERVAL_MS = 300000;
const TELEGRAM_BOT = "HyperTeamITE_Bot";

let allData = [];
let activeType = "All";
let loadedOnce = false;

const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const resultsBody = document.getElementById("resultsBody");
const resultCount = document.getElementById("resultCount");
const syncStatus = document.getElementById("syncStatus");
const tabs = [...document.querySelectorAll(".tab-btn")];

function fetchSheet(url, type) {
  return new Promise((resolve, reject) => {
    const separator = url.includes("?") ? "&" : "?";
    Papa.parse(`${url}${separator}t=${Date.now()}`, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors?.length && !result.data.length) {
          reject(new Error(result.errors[0].message));
          return;
        }
        resolve(result.data
          .filter(row => row["File Name"] || row["Path"])
          .map(row => ({ ...row, _sourceType: type })));
      },
      error: reject
    });
  });
}

async function loadData() {
  syncStatus.textContent = "جارٍ تحديث البيانات...";
  try {
    const [software, courses] = await Promise.all([
      fetchSheet(SOFTWARE_CSV_URL, "Software"),
      fetchSheet(COURSES_CSV_URL, "Course")
    ]);
    allData = [...software, ...courses];
    document.getElementById("softwareCount").textContent = software.length;
    document.getElementById("courseCount").textContent = courses.length;
    loadedOnce = true;
    syncStatus.textContent = `آخر تحديث ${new Date().toLocaleTimeString("ar", {hour:"2-digit", minute:"2-digit"})}`;
    renderResults();
  } catch (error) {
    console.error("Failed to load Google Sheets:", error);
    syncStatus.textContent = "تعذّر تحميل البيانات";
    if (!loadedOnce) {
      resultsBody.innerHTML = `<tr><td colspan="5" class="empty-state">لم نتمكن من تحميل البيانات من Google Sheets. تحقق من نشر الورقتين ومن صلاحية روابط CSV.</td></tr>`;
    }
  }
}

function formatSize(value) {
  return (value || "").toString().trim() || "—";
}
function safeText(value, fallback = "—") {
  return (value ?? "").toString().trim() || fallback;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[char]);
}
function getSourceType(row) {
  // The source-type column is currently blank/incomplete in the supplied workbook.
  // Prefer its exact value; use the file name as a usable fallback until the team fills it.
  return safeText(row["Source Type"] || row["Source Type "] || row["SourceType"], safeText(row["File Name"], "Unknown"));
}
function makeTelegramUrl(row, action) {
  const sourceType = getSourceType(row);
  const kind = row._sourceType === "Course" ? "Course" : "Software";
  const prefix = action === "youtube" ? "YouTube course request" : "File request";
  const message = `${prefix}\nType: ${kind}\nSource Type: ${sourceType}`;
  // Telegram's share link opens Telegram's recipient chooser with the message prefilled.
  // The user chooses @HyperTeamITE_Bot and taps Send.
  return `https://t.me/HyperTeamITE_Bot?text=${encodeURIComponent(message)}`;
}
const telegramIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.8 3.2 18.5 20c-.25 1.2-.95 1.5-1.92.95l-5.3-3.9-2.56 2.46c-.28.28-.51.51-1.05.51l.38-5.4 9.82-8.88c.43-.38-.1-.59-.66-.21L5.06 13.1.01 11.52c-1.1-.34-1.12-1.1.23-1.62L19.98 2.3c.91-.33 1.71.22 1.42.9Z"/></svg>`;
const youtubeIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z"/></svg>`;

function renderResults() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const filtered = allData.filter(row => {
    const typeMatch = activeType === "All" || row._sourceType === activeType;
    const searchable = `${row["File Name"] || ""} ${row["Category"] || ""} ${row["Source Type"] || ""}`.toLocaleLowerCase();
    return typeMatch && (!query || searchable.includes(query));
  });

  clearSearchBtn.hidden = !query;
  resultCount.textContent = filtered.length
    ? `${filtered.length} نتيجة`
    : (query ? "لا توجد نتائج مطابقة" : "لا توجد عناصر في هذا القسم");

  if (!filtered.length) {
    resultsBody.innerHTML = `<tr><td colspan="5" class="empty-state">${allData.length ? "لم نعثر على نتائج. جرّب كلمة بحث أخرى أو اختر قسمًا مختلفًا." : "لا توجد بيانات للعرض حاليًا."}</td></tr>`;
    return;
  }

  resultsBody.innerHTML = filtered.slice(0, 250).map(row => {
    const name = escapeHtml(safeText(row["File Name"], "بدون اسم"));
    const size = escapeHtml(formatSize(row["Size"]));
    const path = escapeHtml(safeText(row["Path"]));
    const category = escapeHtml(safeText(row["Category"], "غير مصنّف"));
    const telegramUrl = makeTelegramUrl(row, "telegram");
    const isCourse = row._sourceType === "Course";
    const youtubeUrl = makeTelegramUrl(row, "youtube");
    return `<tr>
      <td class="file-name">${name}</td>
      <td class="file-size">${size}</td>
      <td class="file-path" dir="auto">${path}</td>
      <td><span class="category-pill">${category}</span></td>
      <td><div class="action-icons">
        <a class="action-link telegram" href="${telegramUrl}" target="_blank" rel="noopener noreferrer" aria-label="طلب ${name} عبر Telegram" title="طلب عبر Telegram">${telegramIcon}</a>
        ${isCourse ? `<a class="action-link youtube" href="${youtubeUrl}" target="_blank" rel="noopener noreferrer" aria-label="طلب كورس ${name} عبر YouTube" title="طلب الكورس">${youtubeIcon}</a>` : ""}
      </div></td>
    </tr>`;
  }).join("");
}

tabs.forEach(tab => tab.addEventListener("click", () => {
  activeType = tab.dataset.type;
  tabs.forEach(item => item.classList.toggle("active", item === tab));
  renderResults();
  if (activeType !== "All") document.getElementById("library").scrollIntoView({behavior:"smooth", block:"start"});
}));
searchInput.addEventListener("input", renderResults);
clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  renderResults();
  searchInput.focus();
});
document.getElementById("startBrowsing").addEventListener("click", () => {
  document.getElementById("library").scrollIntoView({behavior:"smooth", block:"start"});
  document.getElementById("searchInput").focus({preventScroll:true});
});
loadData();
setInterval(loadData, SYNC_INTERVAL_MS);










// 1. تفعيل زر تبديل الوضع الليلي والنهاري
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = themeToggleBtn.querySelector('.theme-icon');

themeToggleBtn.addEventListener('click', () => {
  const isLight = document.body.getAttribute('data-theme') === 'light';
  if (isLight) {
    document.body.removeAttribute('data-theme');
    themeIcon.textContent = '🌙';
  } else {
    document.body.setAttribute('data-theme', 'light');
    themeIcon.textContent = '☀️';
  }
});

// 2. تغيير الخط السفلي عند الانتقال والتنقل بين الأقسام
const navLinks = document.querySelectorAll('.nav-link');

navLinks.forEach(link => {
  link.addEventListener('click', function() {
    navLinks.forEach(item => item.classList.remove('active'));
    this.classList.add('active');
  });
});
