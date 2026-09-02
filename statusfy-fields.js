(function () {
  var ACCOUNT = "6363339900";
  var FEED_URL =
    "https://statusfy.com/" +
    ACCOUNT +
    "/list?output=json&extensions=3,4&sort=extension";
  var OUR_EXT = "4";
  var STATUS = {
    0: { label: "Open", color: "#15803d", bg: "#dcfce7", border: "#86efac" },
    1: { label: "Delayed", color: "#854d0e", bg: "#fef9c3", border: "#fde047" },
    2: { label: "Closed", color: "#b91c1c", bg: "#fee2e2", border: "#fca5a5" },
    3: { label: "Notice", color: "#1d4ed8", bg: "#dbeafe", border: "#93c5fd" }
  };

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusMeta(code) {
    return STATUS[Number(code)] || STATUS[0];
  }

  function injectStyles() {
    if (document.getElementById("statusfy-fields-css")) return;
    var css = [
      ".statusfy-drop{overflow:hidden;}",
      ".statusfy-drop>summary{list-style:none;cursor:pointer;}",
      ".statusfy-drop>summary::-webkit-details-marker{display:none;}",
      ".statusfy-drop>summary{display:flex;align-items:center;justify-content:space-between;gap:0.75rem;}",
      ".statusfy-chevron{display:inline-block;transition:transform .15s ease;font-size:1.1rem;line-height:1;}",
      ".statusfy-drop[open]>.statusfy-summary .statusfy-chevron{transform:rotate(180deg);}",
      ".statusfy-panel{padding:0 1rem 1rem;}",
      ".statusfy-item{border-radius:1rem;border:1px solid #bbf7d0;background:#fff;padding:0.85rem 0.95rem;margin-top:0.65rem;}",
      ".statusfy-item.is-ours{box-shadow:0 0 0 2px rgba(22,101,52,.18);}",
      ".statusfy-item-top{display:flex;align-items:flex-start;justify-content:space-between;gap:0.6rem;}",
      ".statusfy-name{font-weight:700;color:#14532d;font-size:0.95rem;}",
      ".statusfy-ours{display:inline-block;margin-top:0.2rem;font-size:0.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#166534;}",
      ".statusfy-pill{flex-shrink:0;font-size:0.7rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:0.2rem 0.65rem;border-radius:999px;white-space:nowrap;}",
      ".statusfy-detail{margin:0.45rem 0 0;font-size:0.85rem;line-height:1.45;color:#334155;}",
      ".statusfy-ago{margin:0.35rem 0 0;font-size:0.75rem;color:#64748b;}",
      ".statusfy-error,.statusfy-loading{margin:0.65rem 0 0;font-size:0.85rem;color:#64748b;}",
      ".statusfy-error{color:#b91c1c;}",
      ".statusfy-full{display:inline-block;margin-top:0.75rem;font-size:0.8rem;font-weight:700;color:#15803d;text-decoration:none;}",
      ".statusfy-full:hover{text-decoration:underline;}",
      ".statusfy-live{display:inline-flex;align-items:center;gap:0.35rem;}"
    ].join("");
    var style = document.createElement("style");
    style.id = "statusfy-fields-css";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function itemHTML(item) {
    var meta = statusMeta(item.status);
    var ours = String(item.extension) === OUR_EXT;
    var name = item.name_full || item.name_short || "Sports Park";
    var clip = item.status_clip || meta.label;
    var detail = (item.status_detail || "").trim();
    var ago = (item.updated_ago || "").trim();
    var href = "https://statusfy.com/" + ACCOUNT + "/" + esc(item.extension);
    return (
      '<article class="statusfy-item' +
      (ours ? " is-ours" : "") +
      '">' +
      '<div class="statusfy-item-top">' +
      '<div><a class="statusfy-name" href="' +
      href +
      '" target="_blank" rel="noopener">' +
      esc(name) +
      "</a>" +
      (ours
        ? '<div class="statusfy-ours">Our fields · games 8B · practice 8C</div>'
        : "") +
      "</div>" +
      '<span class="statusfy-pill" style="background:' +
      meta.bg +
      ";color:" +
      meta.color +
      ";border:1px solid " +
      meta.border +
      ';">' +
      esc(clip) +
      "</span>" +
      "</div>" +
      (detail ? '<p class="statusfy-detail">' + esc(detail) + "</p>" : "") +
      (ago ? '<p class="statusfy-ago">Updated ' + esc(ago) + "</p>" : "") +
      "</article>"
    );
  }

  function sortItems(items) {
    return items.slice().sort(function (a, b) {
      var aOurs = String(a.extension) === OUR_EXT ? 0 : 1;
      var bOurs = String(b.extension) === OUR_EXT ? 0 : 1;
      if (aOurs !== bOurs) return aOurs - bOurs;
      return Number(a.extension) - Number(b.extension);
    });
  }

  function render(root, items) {
    var list = sortItems(items);
    if (!list.length) {
      root.innerHTML =
        '<p class="statusfy-error">No Sports Park status is available right now.</p>';
      return;
    }
    root.innerHTML =
      list.map(itemHTML).join("") +
      '<a class="statusfy-full" href="https://statusfy.com/' +
      ACCOUNT +
      '" target="_blank" rel="noopener">Open full O’Fallon Statusfy →</a>';

    var ours = list.filter(function (item) {
      return String(item.extension) === OUR_EXT;
    })[0];
    var summary = document.getElementById("statusfy-summary");
    if (summary && ours) {
      var meta = statusMeta(ours.status);
      var clip = ours.status_clip || meta.label;
      summary.innerHTML =
        '<span class="statusfy-live"><span style="width:0.5rem;height:0.5rem;border-radius:999px;background:' +
        meta.color +
        ';display:inline-block;"></span>' +
        esc(clip) +
        (ours.updated_ago ? " · " + esc(ours.updated_ago) : "") +
        "</span>";
    }
  }

  function load() {
    var root = document.getElementById("statusfy-fields");
    if (!root) return;
    root.innerHTML = '<p class="statusfy-loading">Checking Sports Park fields…</p>';
    fetch(FEED_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("status " + res.status);
        return res.json();
      })
      .then(function (data) {
        render(root, Array.isArray(data) ? data : []);
      })
      .catch(function () {
        root.innerHTML =
          '<p class="statusfy-error">Couldn’t load live field status. <a href="https://statusfy.com/' +
          ACCOUNT +
          '/4" target="_blank" rel="noopener">Check Statusfy directly</a>.</p>';
      });
  }

  function init() {
    injectStyles();
    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
