(function () {
  "use strict";

  var EXAMPLES = [
    { label: "Prize message", text: "WINNER!! You have been selected to receive a £900 prize reward. To claim call 09061701461. Claim code KL341. Valid 12 hours only." },
    { label: "Free ringtone", text: "Free entry in 2 a weekly comp to win a ringtone. Text WIN to 80086 now! T&Cs apply, 18+ only. 16 cost 150p/msg" },
    { label: "Urgent offer", text: "URGENT! Your mobile number has won a free holiday. Click www.holiday-claim.com or call 08712460324 now to claim." },
    { label: "Plans with a friend", text: "Hey, are you still coming to dinner tonight? I'll be home around 7, let me know if you want me to pick anything up." },
    { label: "Running late", text: "Sorry I'm running late, the bus is stuck in traffic. Start without me and I'll see you in about twenty minutes." },
    { label: "Quick question", text: "Can you send me the notes from yesterday's lecture? I missed the last half hour. Thanks!" }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var messageEl = $("message"), checkBtn = $("check-btn"), noticeEl = $("notice");
  var resultEl = $("result");

  function api(path, options) {
    return fetch("/api/" + path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) { throw new Error(data.error || "Request failed (" + res.status + ")"); }
        return data;
      });
    });
  }

  function clear(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }
  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) { n.className = className; }
    if (text !== undefined) { n.textContent = text; }
    return n;
  }
  function pct(x) { return Math.round(x * 100) + "%"; }

  function showNotice(text, kind) {
    noticeEl.textContent = text;
    noticeEl.className = "notice" + (kind === "info" ? " info" : "");
    noticeEl.hidden = !text;
  }

  // ---- server status ----
  var statusEl = $("status"), statusText = $("status-text");
  function setStatus(kind, text) {
    statusEl.className = "status " + (kind || "");
    statusText.textContent = text;
  }

  function checkHealth() {
    var slow = setTimeout(function () {
      setStatus("", "Waking the server");
      showNotice("The server is waking up. A free host can take up to a minute on the first request.", "info");
    }, 3500);
    return api("health").then(function (h) {
      clearTimeout(slow);
      if (noticeEl.classList.contains("info")) { showNotice(""); }
      if (h.model_loaded) {
        setStatus("ok", h.database === "connected" ? "Server and database online" : "Server online, history off");
      } else {
        setStatus("bad", "Model not ready");
        showNotice(h.model_error || "The model is still loading. Try again in a moment.");
      }
      return h;
    }).catch(function (err) {
      clearTimeout(slow);
      setStatus("bad", "Server offline");
      showNotice(err.message);
    });
  }

  // ---- model card ----
  function loadModel() {
    return api("model-info").then(function (m) {
      $("model-name").textContent = m.model_name || m.model || "Model not trained yet";
      var dl = $("metrics"); clear(dl);
      [["Accuracy", m.accuracy], ["Precision", m.precision], ["Recall", m.recall], ["F1", m.f1]].forEach(function (p) {
        if (typeof p[1] !== "number") { return; }
        var box = el("div"); box.appendChild(el("dt", null, p[0])); box.appendChild(el("dd", null, pct(p[1])));
        dl.appendChild(box);
      });
      if (m.n_messages) {
        $("model-note").textContent = "Scored on " + m.n_test + " messages it never saw during training. " +
          "Recall is the share of real spam it catches; precision is how often a spam call is right.";
      }
      var top = $("top-spam"); clear(top);
      ((m.top_words && m.top_words.spam) || []).slice(0, 12).forEach(function (w) { top.appendChild(el("li", null, w)); });
    }).catch(function () {});
  }

  // ---- history + tally ----
  function timeAgo(iso) {
    if (!iso) { return ""; }
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) { return "just now"; }
    if (s < 3600) { return Math.floor(s / 60) + " min ago"; }
    if (s < 86400) { return Math.floor(s / 3600) + " h ago"; }
    return Math.floor(s / 86400) + " d ago";
  }

  function loadHistory() {
    return Promise.all([api("history?limit=12"), api("stats")]).then(function (r) {
      var items = r[0].items || [], stats = r[1];
      var list = $("history"); clear(list);
      items.forEach(function (it) {
        var li = el("li"), b = el("button"); b.type = "button";
        b.appendChild(el("span", "tag " + it.label, it.label === "spam" ? "Spam" : "Not spam"));
        b.appendChild(el("span", "h-text", it.message));
        b.appendChild(el("span", "h-time", timeAgo(it.created_at)));
        b.title = "Check this message again";
        b.addEventListener("click", function () { messageEl.value = it.message; updateCount(); run(); });
        li.appendChild(b); list.appendChild(li);
      });
      var off = r[0].database !== "connected" && !items.length;
      $("history-empty").textContent = off
        ? "History is off because the database is not connected. Checking messages still works."
        : "Messages you check will appear here.";
      $("history-empty").hidden = items.length > 0;
      $("clear-btn").hidden = !items.length;
      $("tally").textContent = stats.total
        ? stats.total + " checked: " + stats.spam + " spam, " + stats.ham + " not spam"
        : "";
    }).catch(function () {});
  }

  // ---- result ----
  function renderResult(r) {
    resultEl.hidden = false;

    var bubble = $("bubble"); clear(bubble);
    r.segments.forEach(function (seg) {
      var s = seg.strength || 0;
      if (Math.abs(s) >= 0.18) {
        var span = el("span", s > 0 ? "hit-spam" : "hit-ham", seg.text);
        span.style.setProperty("--s", Math.abs(s).toFixed(2));
        bubble.appendChild(span);
      } else {
        bubble.appendChild(document.createTextNode(seg.text));
      }
    });

    var spam = r.is_spam;
    $("verdict").className = "verdict " + (spam ? "is-spam" : "is-ham");
    $("verdict-word").textContent = spam ? "Spam" : "Not spam";
    $("verdict-detail").textContent = spam
      ? pct(r.spam_probability) + " chance this is spam"
      : pct(1 - r.spam_probability) + " chance this is a normal message";
    $("meter-fill").style.width = Math.max(2, r.spam_probability * 100) + "%";
    $("meter-mark").style.left = (r.threshold * 100) + "%";

    function fill(id, items, empty) {
      var ul = $(id); clear(ul);
      if (!items.length) { ul.appendChild(el("li", null, empty)); return; }
      items.forEach(function (s) { ul.appendChild(el("li", null, s.term)); });
    }
    fill("sig-spam", r.signals.spam, "Nothing stood out");
    fill("sig-ham", r.signals.ham, "Nothing stood out");
  }

  function run() {
    var text = messageEl.value.trim();
    if (!text) { showNotice("Enter a message to check."); messageEl.focus(); return; }
    showNotice("");
    checkBtn.disabled = true; checkBtn.textContent = "Checking";
    api("predict", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    }).then(function (r) {
      renderResult(r);
      resultEl.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
      return loadHistory();
    }).catch(function (err) {
      showNotice(err.message);
    }).then(function () {
      checkBtn.disabled = false; checkBtn.textContent = "Check message";
    });
  }

  function updateCount() { $("count").textContent = messageEl.value.length + " / 1000"; }

  // ---- wire up ----
  var exWrap = $("examples");
  EXAMPLES.forEach(function (ex) {
    var b = el("button", null, ex.label); b.type = "button";
    b.addEventListener("click", function () { messageEl.value = ex.text; updateCount(); run(); });
    exWrap.appendChild(b);
  });

  checkBtn.addEventListener("click", run);
  messageEl.addEventListener("input", updateCount);
  messageEl.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { run(); }
  });
  $("clear-btn").addEventListener("click", function () {
    if (!window.confirm("Delete all saved checks from the database?")) { return; }
    api("history", { method: "DELETE" }).then(loadHistory).catch(function (e) { showNotice(e.message); });
  });

  updateCount();
  checkHealth().then(function () { loadModel(); loadHistory(); });
})();
