// Google Sheets Config
const BASE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQU7gjhliDaRfEa4I5GAhMkB3n6xW5cWcgx_CaidVG81xv1pW1ddSuR5i8reg64g2wVJrLrIx1f3RbP/pub?output=csv";
const SOFTWARE_CSV_URL = `${BASE_URL}&gid=0`;
const COURSES_CSV_URL = `${BASE_URL}&gid=291500461`;
const SYNC_INTERVAL_MS = 300000;
const TELEGRAM_BOT = "HyperTeamITE_Bot";

let allData = [];
let activeType = "All";
let loadedOnce = false;

// DOM Elements
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const contentGrid = document.getElementById("content-grid");
const resultCount = document.getElementById("resultCount");
const syncStatus = document.getElementById("syncStatus");
const tabs = [...document.querySelectorAll(".tab-btn")];

// FETCH SHEET DATA VIA PAPAPARSE
function fetchSheet(url, type) {
  return new Promise(async (resolve, reject) => {
    try {
      const separator = url.includes("?") ? "&" : "?";
      const fullUrl = `${url}${separator}t=${Date.now()}`;

      // جلب النص عبر fetch أولاً
      const response = await fetch(fullUrl);
      if (!response.ok) {
        throw new Error(`خطأ في الاستجابة: ${response.status}`);
      }
      const csvText = await response.text();

      // تحليل نص الـ CSV بواسطة PapaParse
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          if (result.errors?.length && !result.data.length) {
            reject(new Error(result.errors[0].message));
            return;
          }
          resolve(
            result.data.filter((row) => row["File Name"] || row["Path"]).map((row) => ({ ...row, _sourceType: type })),
          );
        },
        error: reject,
      });
    } catch (err) {
      reject(err);
    }
  });
}

// LOAD DATA FROM GOOGLE SHEETS
async function loadData() {
  if (syncStatus) syncStatus.textContent = "جارٍ تحديث البيانات المباشرة من الشيت...";
  try {
    const [software, courses] = await Promise.all([
      fetchSheet(SOFTWARE_CSV_URL, "Software"),
      fetchSheet(COURSES_CSV_URL, "Course"),
    ]);
    allData = [...software, ...courses];

    // Update stats counters
    const totalElem = document.getElementById("totalCount");
    const softElem = document.getElementById("softwareCount");
    const courseElem = document.getElementById("courseCount");

    if (totalElem) totalElem.textContent = allData.length;
    if (softElem) softElem.textContent = software.length;
    if (courseElem) courseElem.textContent = courses.length;

    loadedOnce = true;
    if (syncStatus) {
      syncStatus.textContent = `آخر تحديث تلقائي للشيت: ${new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}`;
    }
    renderResults();
  } catch (error) {
    console.error("Failed to load Google Sheets:", error);
    if (syncStatus) syncStatus.textContent = "تعذّر تحميل البيانات المباشرة";
    if (!loadedOnce && contentGrid) {
      contentGrid.innerHTML = `
                <div class="empty-state-box">
                    <i class="fa-solid fa-triangle-exclamation empty-state-icon"></i>
                    <div class="empty-state-title">تعذّر التحميل</div>
                    <p>لم نتمكن من تحميل البيانات من Google Sheets. تحقق من نشر الشيت وصلاحيات الروابط.</p>
                </div>
            `;
    }
  }
}

// HELPER FUNCTIONS
function safeText(value, fallback = "—") {
  return (value ?? "").toString().trim() || fallback;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

function getSourceType(row) {
  return safeText(
    row["Source Type"] || row["Source Type "] || row["SourceType"],
    safeText(row["File Name"], "Unknown"),
  );
}

function isOSRow(row) {
  const text = `${row["File Name"] || ""} ${row["Category"] || ""} ${row["Path"] || ""}`.toLowerCase();
  return (
    text.includes("windows") ||
    text.includes("linux") ||
    text.includes("ubuntu") ||
    text.includes("iso") ||
    text.includes("os") ||
    text.includes("أنظمة التشغيل")
  );
}

function makeTelegramUrl(row) {
  const sourceType = getSourceType(row);
  const kind = row._sourceType === "Course" ? "Course" : "Software";
  const fileName = safeText(row["File Name"], "بدون اسم");
  const message = `طلب ملف/كورس جديد:\nاسم الملف: ${fileName}\nالنوع: ${kind}\nالمصدر: ${sourceType}`;
  return `https://t.me/${TELEGRAM_BOT}?text=${encodeURIComponent(message)}`;
}

// RENDER REAL GOOGLE SHEETS DATA INTO YOUR HTML CARDS
function renderResults() {
  if (!contentGrid) return;
  const query = searchInput.value.trim().toLocaleLowerCase();

  const filtered = allData.filter((row) => {
    let typeMatch = false;

    if (activeType === "All") {
      typeMatch = true;
    } else if (activeType === "OS") {
      typeMatch = isOSRow(row);
    } else {
      typeMatch = row._sourceType === activeType;
    }

    const searchable =
      `${row["File Name"] || ""} ${row["Category"] || ""} ${row["Path"] || ""} ${row["Source Type"] || ""}`.toLocaleLowerCase();
    return typeMatch && (!query || searchable.includes(query));
  });

  if (clearSearchBtn) clearSearchBtn.classList.toggle("hidden", !query);

  if (resultCount) {
    resultCount.textContent = filtered.length
      ? `تم العثور على ${filtered.length} عنصر من Google Sheets`
      : query
        ? "لا توجد نتائج مطابقة لبحثك"
        : "لا توجد عناصر في هذا التصنيف";
  }

  if (!filtered.length) {
    contentGrid.innerHTML = `
            <div class="empty-state-box">
                <i class="fa-solid fa-folder-open empty-state-icon"></i>
                <div class="empty-state-title">لا توجد نتائج</div>
                <p>${allData.length ? "لم نعثر على نتائج مطابقة. جرّب كلمة بحث أخرى أو غير التصنيف." : "لا توجد بيانات للعرض حالياً."}</p>
            </div>
        `;
    return;
  }

  contentGrid.innerHTML = filtered
    .slice(0, 150)
    .map((row) => {
      const name = escapeHtml(safeText(row["File Name"], "بدون اسم"));
      const size = escapeHtml(safeText(row["Size"], "حجم غير محدد"));
      const path = escapeHtml(safeText(row["Path"], "مسار غير محدد"));
      const category = escapeHtml(safeText(row["Category"], row._sourceType === "Course" ? "كورس" : "برنامج"));
      const telegramUrl = makeTelegramUrl(row);

      return `
            <div class="card-item">
                <div>
                    <div class="card-header">
                        <span class="card-size">${size}</span>
                        <span class="card-category">${category}</span>
                    </div>

                    <h3 class="card-title">${name}</h3>

                    <p class="card-desc" title="${path}">
                        <i class="fa-solid fa-folder text-gold ml-1"></i> ${path}
                    </p>

                    <div class="card-tags">
                        <span class="tag-badge">#${row._sourceType}</span>
                        ${isOSRow(row) ? '<span class="tag-badge">#OS</span>' : ""}
                    </div>
                </div>

                <div class="card-footer">
<button onclick="openPathModal('${encodeURIComponent(name)}', '${encodeURIComponent(path)}', '${encodeURIComponent(telegramUrl)}')" class="btn-card-tree">                        <i class="fa-solid fa-sitemap"></i>
                        <span>عرض المسار</span>
                    </button>

                    <a href="${telegramUrl}" target="_blank" class="btn-card-bot">
                        <i class="fa-brands fa-telegram"></i>
                        <span>طلب عبر البوت</span>
                    </a>
                </div>
            </div>
        `;
    })
    .join("");
}

// MODAL PATH VIEW
// MODAL PATH VIEW
function openPathModal(encodedName, encodedPath, encodedTelegramUrl) { // <-- 1. أضفنا البرامتر هنا
    const name = decodeURIComponent(encodedName);
    const path = decodeURIComponent(encodedPath);
    const telegramUrl = encodedTelegramUrl ? decodeURIComponent(encodedTelegramUrl) : `https://t.me/${TELEGRAM_BOT}`;

    document.getElementById('modal-title').innerText = name;
    const treeContainer = document.getElementById('modal-tree-content');

    treeContainer.innerHTML = `
        <div class="tree-line"><strong>الملف / المجلد:</strong> ${name}</div>
        <div class="tree-line"><strong>المسار الفعلي على الهارد:</strong><br>${path}</div>
    `;

    const modalBotBtn = document.getElementById('modal-bot-btn');
    if (modalBotBtn) {
        modalBotBtn.href = telegramUrl;
    }

    document.getElementById('tree-modal').classList.remove('hidden');
}
document.getElementById("close-modal")?.addEventListener("click", () => {
  document.getElementById("tree-modal").classList.add("hidden");
});

// FILTER TABS LOGIC
tabs.forEach((tab) =>
  tab.addEventListener("click", () => {
    activeType = tab.dataset.type;
    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    renderResults();
  }),
);

// SEARCH INPUT LISTENERS
searchInput?.addEventListener("input", renderResults);
clearSearchBtn?.addEventListener("click", () => {
  searchInput.value = "";
  renderResults();
  searchInput.focus();
});

// START BROWSING BUTTON
document.getElementById("startBrowsing")?.addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("hard-drives").scrollIntoView({ behavior: "smooth", block: "start" });
  searchInput.focus({ preventScroll: true });
});

// DARK / LIGHT THEME TOGGLE LOGIC (WITH LOCALSTORAGE)
const themeToggleBtn = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const htmlElem = document.documentElement;

const savedTheme = localStorage.getItem("theme");
if (savedTheme === "light") {
  htmlElem.classList.remove("dark");
  htmlElem.classList.add("light");
  if (themeIcon) themeIcon.className = "fa-solid fa-sun";
} else {
  htmlElem.classList.remove("light");
  htmlElem.classList.add("dark");
  if (themeIcon) themeIcon.className = "fa-solid fa-moon";
}

themeToggleBtn?.addEventListener("click", () => {
  if (htmlElem.classList.contains("dark")) {
    htmlElem.classList.remove("dark");
    htmlElem.classList.add("light");
    if (themeIcon) themeIcon.className = "fa-solid fa-sun";
    localStorage.setItem("theme", "light");
  } else {
    htmlElem.classList.remove("light");
    htmlElem.classList.add("dark");
    if (themeIcon) themeIcon.className = "fa-solid fa-moon";
    localStorage.setItem("theme", "dark");
  }
});

// MOBILE MENU TOGGLE
const mobileBtn = document.getElementById("mobile-menu-btn");
const mobileMenu = document.getElementById("mobile-menu");

mobileBtn?.addEventListener("click", () => {
  mobileMenu.classList.toggle("hidden");
});

// SINGLE DYNAMIC ACTIVE NAV ON SCROLL & CLICK
const sections = document.querySelectorAll("section");
const navLinks = document.querySelectorAll(".nav-desktop .nav-link");
const mobileLinks = document.querySelectorAll(".nav-mobile .mobile-link");
const allLinks = [...navLinks, ...mobileLinks];

function setActiveNav(targetHref) {
  allLinks.forEach((link) => {
    if (link.getAttribute("href") === targetHref) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
}

allLinks.forEach((link) => {
  link.addEventListener("click", function () {
    const targetHref = this.getAttribute("href");
    if (targetHref.startsWith("#")) {
      setActiveNav(targetHref);
      if (mobileMenu && !mobileMenu.classList.contains("hidden")) {
        mobileMenu.classList.add("hidden");
      }
    }
  });
});

function handleScrollNav() {
  let scrollPosition = window.scrollY + 200;

  sections.forEach((section) => {
    const sectionTop = section.offsetTop;
    const sectionHeight = section.offsetHeight;
    const sectionId = section.getAttribute("id");

    if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
      setActiveNav(`#${sectionId}`);
    }
  });
}

window.addEventListener("scroll", handleScrollNav);

// INITIAL RENDER & START AUTO SYNC
window.onload = function () {
  loadData();
  setInterval(loadData, SYNC_INTERVAL_MS);
};
