const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptSource = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

function createClassList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
    toggle: (name, force) => {
      const enabled = force === undefined ? !values.has(name) : force;
      if (enabled) values.add(name);
      else values.delete(name);
      return enabled;
    },
  };
}

function createElement(id = "") {
  const listeners = {};
  const label = { textContent: "" };
  return {
    id,
    classList: createClassList(),
    dataset: {},
    href: "",
    innerHTML: "",
    innerText: "",
    textContent: "",
    value: "",
    style: {},
    addEventListener: (type, handler) => {
      listeners[type] = handler;
    },
    closest: () => null,
    focus: () => {},
    querySelector: (selector) => (selector === "span" ? label : null),
    scrollIntoView: () => {},
    _label: label,
    _listeners: listeners,
  };
}

function createRuntime(overrides = {}) {
  const ids = new Map();
  const getElement = (id) => {
    if (!ids.has(id)) ids.set(id, createElement(id));
    return ids.get(id);
  };
  const footer = createElement("modal-footer");
  const tabs = ["All", "Software", "Course", "OS"].map((type) => {
    const tab = createElement();
    tab.dataset.type = type;
    return tab;
  });
  const document = {
    documentElement: createElement("html"),
    getElementById: getElement,
    querySelector: (selector) => (selector === ".modal-footer" ? footer : null),
    querySelectorAll: (selector) => (selector === ".tab-btn" ? tabs : []),
  };
  const runtime = {
    URL,
    console,
    document,
    encodeURIComponent,
    decodeURIComponent,
    localStorage: { getItem: () => null, setItem: () => {} },
    setInterval: () => 1,
    window: { addEventListener: () => {}, scrollY: 0 },
    ...overrides,
  };
  runtime.globalThis = runtime;
  vm.createContext(runtime);
  vm.runInContext(scriptSource, runtime);
  return { runtime, ids, getElement, footer };
}

function evaluate(runtime, expression) {
  return vm.runInContext(expression, runtime);
}

test("Chrome uses the exact available Telegram Link", () => {
  const { runtime } = createRuntime();
  const row = {
    "File Name": "Chrome",
    "Source Type": "https://t.me/Hyper_Vault/84/133",
    "Telegram Status": "available",
    "Telegram Link": "https://t.me/HyperTeamITE_Bot?start=f_CHROME_TEST_TOKEN",
  };
  runtime.fixture = row;

  const action = evaluate(runtime, "resolveTelegramAction(fixture)");
  assert.equal(action.available, true);
  assert.equal(action.url, row["Telegram Link"]);
  assert.equal(action.label, "تحميل عبر تيليغرام");
  assert.notEqual(action.url, row["Source Type"]);
  assert.doesNotMatch(action.url, /[?&]text=/);
});

test("missing link, missing status, invalid URL, and unavailable status use request fallback", () => {
  const { runtime } = createRuntime();
  const cases = [
    { "Telegram Status": "available", "Telegram Link": "" },
    { "Telegram Link": "https://t.me/HyperTeamITE_Bot?start=f_valid" },
    { "Telegram Status": "available", "Telegram Link": "javascript:alert(1)" },
    { "Telegram Status": "available", "Telegram Link": "https://t.me/Hyper_Vault/84/133" },
    { "Telegram Status": "available", "Telegram Link": "https://t.me/HyperTeamITE_Bot?start=request" },
    { "Telegram Status": "unavailable", "Telegram Link": "https://t.me/HyperTeamITE_Bot?start=f_valid" },
    { "Telegram Status": "pending_review", "Telegram Link": "https://t.me/HyperTeamITE_Bot?start=f_valid" },
  ];

  for (const row of cases) {
    runtime.fixture = row;
    const action = evaluate(runtime, "resolveTelegramAction(fixture)");
    assert.equal(action.available, false);
    assert.equal(action.url, "https://t.me/HyperTeamITE_Bot?start=request");
    assert.equal(action.label, "طلب الملف عبر البوت");
  }
});

test("column lookup tolerates extra whitespace", () => {
  const { runtime } = createRuntime();
  runtime.fixture = {
    " Telegram Status ": " available ",
    "Telegram Link ": " https://t.me/HyperTeamITE_Bot?start=f_token-123 ",
  };
  const action = evaluate(runtime, "resolveTelegramAction(fixture)");
  assert.equal(action.available, true);
  assert.equal(action.url, "https://t.me/HyperTeamITE_Bot?start=f_token-123");
});

test("course actions distinguish YouTube from an original Telegram source", () => {
  const { runtime, getElement } = createRuntime();
  runtime.youtubeOnly = {
    "File Name": "YouTube course",
    Path: "Courses/YouTube",
    "Source Type": "https://www.youtube.com/watch?v=abc",
    _sourceType: "Course",
  };
  runtime.youtubeAndTelegram = {
    "File Name": "Registered course",
    Path: "Courses/Registered",
    "Source Type": "https://youtu.be/abc",
    "Telegram Status": "available",
    "Telegram Link": "https://t.me/HyperTeamITE_Bot?start=f_courseToken",
    _sourceType: "Course",
  };
  runtime.vaultSource = {
    "File Name": "Vault source",
    Path: "Software/Vault",
    "Source Type": "https://t.me/Hyper_Vault/84/133",
    _sourceType: "Software",
  };

  evaluate(runtime, "allData = [youtubeOnly, youtubeAndTelegram, vaultSource]; renderResults()");
  const html = getElement("content-grid").innerHTML;
  assert.match(html, /https:\/\/www\.youtube\.com\/watch\?v=abc/);
  assert.match(html, /https:\/\/youtu\.be\/abc/);
  assert.match(html, /https:\/\/t\.me\/HyperTeamITE_Bot\?start=f_courseToken/);
  assert.match(html, /طلب الملف عبر البوت/);
  assert.doesNotMatch(html, /href="https:\/\/t\.me\/Hyper_Vault\/84\/133"/);
});

test("path modal resolves the same available link and label as the card", () => {
  const { runtime, getElement } = createRuntime();
  runtime.fixture = {
    "File Name": "Chrome",
    Path: "Software/Browsers/Chrome.zip",
    "Telegram Status": "available",
    "Telegram Link": "https://t.me/HyperTeamITE_Bot?start=f_modalToken",
  };

  evaluate(runtime, "openPathModal(fixture)");
  assert.equal(getElement("modal-bot-btn").href, runtime.fixture["Telegram Link"]);
  assert.equal(getElement("modal-bot-btn")._label.textContent, "تحميل عبر تيليغرام");
  assert.doesNotMatch(getElement("modal-bot-btn").href, /[?&]text=/);
});

test("search, filtering, and a mocked catalog refresh remain functional", async () => {
  const fixtureRows = {
    software: [
      {
        " File Name ": "Chrome",
        Path: "Browsers/Chrome",
        Category: "Browser",
        "Telegram Status": "available",
        "Telegram Link": "https://t.me/HyperTeamITE_Bot?start=f_refreshToken",
      },
    ],
    course: [{ "File Name": "JavaScript", Path: "Courses/JS", "Source Type ": "https://youtu.be/js", Category: "Web" }],
  };
  const { runtime, getElement } = createRuntime({
    fetch: async (url) => ({
      ok: true,
      text: async () => (url.includes("gid=291500461") ? "course" : "software"),
    }),
    Papa: {
      parse: (text, options) => options.complete({ data: fixtureRows[text], errors: [] }),
    },
  });

  await evaluate(runtime, "loadData()");
  assert.equal(getElement("totalCount").textContent, 2);
  assert.equal(getElement("softwareCount").textContent, 1);
  assert.equal(getElement("courseCount").textContent, 1);
  assert.match(getElement("content-grid").innerHTML, /f_refreshToken/);

  getElement("searchInput").value = "chrome";
  evaluate(runtime, "renderResults()");
  assert.match(getElement("content-grid").innerHTML, /Chrome/);
  assert.doesNotMatch(getElement("content-grid").innerHTML, /JavaScript/);

  getElement("searchInput").value = "";
  evaluate(runtime, 'activeType = "Course"; renderResults()');
  assert.match(getElement("content-grid").innerHTML, /JavaScript/);
  assert.doesNotMatch(getElement("content-grid").innerHTML, /Chrome/);
});
