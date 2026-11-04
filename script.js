// Google Sheets Config
const BASE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQU7gjhliDaRfEa4I5GAhMkB3n6xW5cWcgx_CaidVG81xv1pW1ddSuR5i8reg64g2wVJrLrIx1f3RbP/pub?output=csv";
const SOFTWARE_CSV_URL = `${BASE_URL}&gid=0`;
const COURSES_CSV_URL = `${BASE_URL}&gid=291500461`;
const SYNC_INTERVAL_MS = 300000;
const TELEGRAM_BOT = "HyperTeamITE_Bot";
const TELEGRAM_REQUEST_URL = `https://t.me/${TELEGRAM_BOT}?start=request`;

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
            result.data
              .filter((row) => getField(row, "File Name") || getField(row, "Path") || Object.values(row).some((v) => v))
              .map((row) => ({ ...row, _sourceType: type })),
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

function normalizeColumnName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

// Published Sheets headers occasionally contain leading/trailing whitespace.
function getField(row, fieldName, fallback = "") {
  const expectedName = normalizeColumnName(fieldName);
  const matchingKey = Object.keys(row || {}).find((key) => normalizeColumnName(key) === expectedName);
  return matchingKey ? safeText(row[matchingKey], fallback) : fallback;
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
  return getField(row, "Source Type");
}

function isOSRow(row) {
  const text = `${getField(row, "File Name")} ${getField(row, "Category")} ${getField(row, "Path")}`.toLowerCase();
  return (
    text.includes("windows") ||
    text.includes("linux") ||
    text.includes("ubuntu") ||
    text.includes("iso") ||
    text.includes("os") ||
    text.includes("أنظمة التشغيل")
  );
}

function isValidTelegramFileUrl(value) {
  const candidate = safeText(value, "");
  if (!candidate) return false;

  try {
    const url = new URL(candidate);
    const start = url.searchParams.get("start") || "";
    return (
      url.protocol === "https:" &&
      url.hostname === "t.me" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === `/${TELEGRAM_BOT}` &&
      url.hash === "" &&
      [...url.searchParams.keys()].every((key) => key === "start") &&
      url.searchParams.getAll("start").length === 1 &&
      /^f_[A-Za-z0-9_-]{1,62}$/.test(start)
    );
  } catch {
    return false;
  }
}

function isValidYouTubeUrl(value) {
  const candidate = safeText(value, "");
  if (!candidate) return false;

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (hostname === "youtu.be" ||
        hostname === "youtube.com" ||
        hostname.endsWith(".youtube.com") ||
        hostname === "youtube-nocookie.com" ||
        hostname.endsWith(".youtube-nocookie.com"))
    );
  } catch {
    return false;
  }
}

function resolveTelegramAction(row) {
  const status = getField(row, "Telegram Status").toLowerCase();
  const telegramLink = getField(row, "Telegram Link");
  const isAvailable = status === "available" && isValidTelegramFileUrl(telegramLink);

  return isAvailable
    ? {
        url: telegramLink,
        label: "تحميل عبر تيليغرام",
        available: true,
      }
    : {
        url: TELEGRAM_REQUEST_URL,
        label: "طلب الملف عبر البوت",
        available: false,
      };
}

// Kept as the single compatibility entry point for every Telegram action.
function makeTelegramUrl(row) {
  return resolveTelegramAction(row).url;
}
function showOfficeOnlyModal(courseName) {
  const name = decodeURIComponent(courseName);
  const modal = document.getElementById("tree-modal");
  const title = document.getElementById("modal-title");
  const content = document.getElementById("modal-tree-content");
  const footer = document.querySelector(".modal-footer");

  if (title) title.innerText = "تنبيه الكورس";
  if (content) {
    content.innerHTML = `
      <div style="text-align: center; padding: 1.5rem 0;">
        <i class="fa-solid fa-building-columns" style="font-size: 3rem; margin-bottom: 1rem; color: #e2a425;"></i>
        <h3 style="font-size: 1.25rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem;">${escapeHtml(name)}</h3>
        <p style="color: #d1d5db; font-size: 1rem; line-height: 1.6;">هذا الكورس غير متاح على يوتيوب، وهو متوفر في المكتب فقط.</p>
      </div>
    `;
  }
  if (footer) footer.style.display = "none";
  if (modal) modal.classList.remove("hidden");
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
      `${getField(row, "File Name")} ${getField(row, "Category")} ${getField(row, "Path")} ${getSourceType(row)}`.toLocaleLowerCase();
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
      const rowIndex = allData.indexOf(row);
      const name = escapeHtml(getField(row, "File Name", "بدون اسم"));
      const size = escapeHtml(getField(row, "Size", "حجم غير محدد"));
      const path = escapeHtml(getField(row, "Path", "مسار غير محدد"));
      const category = escapeHtml(getField(row, "Category", row._sourceType === "Course" ? "كورس" : "برنامج"));
      const telegramAction = resolveTelegramAction(row);
      const isCourse = row._sourceType === "Course";
      const sourceType = getSourceType(row);
      const hasYouTubeUrl = isCourse && isValidYouTubeUrl(sourceType);

      const actionButtons = [];
      if (hasYouTubeUrl) {
        actionButtons.push(`
            <a href="${escapeHtml(sourceType)}" target="_blank" rel="noopener noreferrer" class="btn-card-bot">
                <i class="fa-brands fa-youtube"></i>
                <span>مشاهدة عبر يوتيوب</span>
            </a>
          `);
      } else if (isCourse && !telegramAction.available) {
        actionButtons.push(`
            <button type="button" data-office-row-index="${rowIndex}" class="btn-card-bot">
                <i class="fa-solid fa-building-columns"></i>
                <span>متوفر في المكتب فقط</span>
            </button>
          `);
      }

      actionButtons.push(`
          <a href="${escapeHtml(telegramAction.url)}" target="_blank" rel="noopener noreferrer" class="btn-card-bot">
              <i class="fa-brands fa-telegram"></i>
              <span>${telegramAction.label}</span>
          </a>
        `);

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
                    <button type="button" data-path-row-index="${rowIndex}" class="btn-card-tree">
                        <i class="fa-solid fa-sitemap"></i>
                        <span>عرض المسار</span>
                    </button>
                    ${actionButtons.join("")}
                </div>
            </div>
        `;
    })
    .join("");
}

// MODAL PATH VIEW
function openPathModal(row) {
  const name = getField(row, "File Name", "بدون اسم");
  const path = getField(row, "Path", "مسار غير محدد");
  const telegramAction = resolveTelegramAction(row);

  document.getElementById("modal-title").innerText = name;
  const treeContainer = document.getElementById("modal-tree-content");

  treeContainer.innerHTML = `
        <div class="tree-line"><strong>الملف / المجلد:</strong> ${escapeHtml(name)}</div>
        <div class="tree-line"><strong>المسار الفعلي على الهارد:</strong><br>${escapeHtml(path)}</div>
    `;

  const footer = document.querySelector(".modal-footer");
  if (footer) footer.style.display = "flex";

  const modalBotBtn = document.getElementById("modal-bot-btn");
  if (modalBotBtn) {
    modalBotBtn.href = telegramAction.url;
    const label = modalBotBtn.querySelector("span");
    if (label) label.textContent = telegramAction.label;
  }

  document.getElementById("tree-modal").classList.remove("hidden");
}

contentGrid?.addEventListener("click", (event) => {
  const pathButton = event.target.closest("[data-path-row-index]");
  if (pathButton) {
    const row = allData[Number(pathButton.dataset.pathRowIndex)];
    if (row) openPathModal(row);
    return;
  }

  const officeButton = event.target.closest("[data-office-row-index]");
  if (officeButton) {
    const row = allData[Number(officeButton.dataset.officeRowIndex)];
    if (row) showOfficeOnlyModal(encodeURIComponent(getField(row, "File Name", "بدون اسم")));
  }
});
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
