/* 分子生物学自学网页 — 学习/答题/错题本/手写/统计/备份
   纯前端，localStorage 本地存储。 */
(function () {
  "use strict";

  /* ---------- constants ---------- */
  var CAUSES = [
    ["concept", "概念不清"],
    ["memory", "记忆错误"],
    ["understand", "理解偏差"],
    ["careless", "审题失误"],
    ["other", "其他"]
  ];
  var PREFIX = "molbio_";

  /* ---------- storage ---------- */
  function jget(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn("存储失败", e); } }
  function skey(cid, kind) { return PREFIX + kind + ":" + cid; }
  function touch(cid) { jset(skey(cid, "last"), Date.now()); }

  function mcqStore(cid) { return jget(skey(cid, "mcq"), {}); }
  function judgeStore(cid) { return jget(skey(cid, "judge"), {}); }
  function fillStore(cid) { return jget(skey(cid, "fill"), {}); }
  function selfStore(cid) { return jget(skey(cid, "self"), {}); }
  function seenStore(cid) { return jget(skey(cid, "seen"), {}); }
  function textStore(cid) { return jget(skey(cid, "text"), {}); }
  function saveText(cid, qid, val) {
    var s = textStore(cid); s[qid] = val; jset(skey(cid, "text"), s); touch(cid);
  }
  function wrongList(cid) { return jget(skey(cid, "wrong"), []); }
  function setWrong(cid, arr) { jset(skey(cid, "wrong"), arr); }

  function addWrong(cid, entry) {
    var arr = wrongList(cid).filter(function (e) { return e.id !== entry.id; });
    arr.push(entry);
    setWrong(cid, arr);
  }
  function clearWrong(cid, id) {
    setWrong(cid, wrongList(cid).filter(function (e) { return e.id !== id; }));
  }

  /* ---------- 不懂 / 待问 ---------- */
  function confusedStore(cid) { return jget(skey(cid, "confused"), {}); }
  function setConfusedStore(cid, o) { jset(skey(cid, "confused"), o); }
  function isConfused(cid, kp) { return !!confusedStore(cid)[kp]; }
  function toggleConfused(cid, kp, note) {
    var o = confusedStore(cid);
    if (o[kp]) { delete o[kp]; }
    else { o[kp] = { note: note || "", ts: Date.now() }; }
    setConfusedStore(cid, o);
    return !!o[kp];
  }
  function confusedCount(cid) { return Object.keys(confusedStore(cid)).length; }
  function confusedAll() {
    var out = {};
    (window.MANIFEST || []).forEach(function (m) {
      var cs = confusedStore(m.id);
      Object.keys(cs).forEach(function (kp) { out[kp] = cs[kp]; });
    });
    return out;
  }

  /* ---------- 间隔复习 / 掌握度 / 打卡 状态层 ---------- */
  var SRS_KEY = PREFIX + "srs", KPS_KEY = PREFIX + "kpStats",
    STREAK_KEY = PREFIX + "streak", TASK_KEY = PREFIX + "tasks";
  var DAY = 86400000;

  function srsAll() { return jget(SRS_KEY, {}); }
  function srsSave(o) { jset(SRS_KEY, o); }
  function srsGet(id) { return srsAll()[id]; }
  /* rating: 2=会 1=模糊 0=不会 */
  function srsRate(id, rating) {
    if (!id) return null;
    var o = srsAll();
    var c = o[id] || { ease: 2.5, ivl: 0, reps: 0, lapses: 0, due: 0, last: 0 };
    var now = Date.now();
    if (rating >= 2) {
      c.reps = (c.reps || 0) + 1;
      if (c.reps <= 1) c.ivl = 1;
      else if (c.reps === 2) c.ivl = 3;
      else c.ivl = Math.round((c.ivl || 1) * (c.ease || 2.5));
      c.ease = Math.min(2.8, (c.ease || 2.5) + 0.1);
    } else if (rating === 1) {
      c.ivl = Math.max(1, Math.round((c.ivl || 1) * 0.6));
      c.ease = Math.max(1.3, (c.ease || 2.5) - 0.15);
    } else {
      c.reps = 0; c.ivl = 0; c.lapses = (c.lapses || 0) + 1;
      c.ease = Math.max(1.3, (c.ease || 2.5) - 0.2);
    }
    c.last = now; c.due = now + c.ivl * DAY;
    o[id] = c; srsSave(o);
    bumpTask("review");
    return c;
  }
  function srsDue() {
    var now = Date.now(), o = srsAll(), out = [];
    for (var k in o) if (o[k] && o[k].due <= now) out.push(k);
    return out;
  }
  function srsCount() { return Object.keys(srsAll()).length; }

  /* ---------- 闪卡作答记录 ---------- */
  function fcAnsAll() { return jget(PREFIX + "fcans", {}); }
  function fcAnsGet(id) { return fcAnsAll()[id]; }
  function fcAnsSave(id, mode, input, ok) {
    var o = fcAnsAll(), c = o[id] || { n: 0, okN: 0, attempts: [] };
    c.n++; if (ok) c.okN++;
    c.last = input; c.lastOk = ok; c.lastTs = Date.now(); c.lastMode = mode;
    c.attempts.push({ ts: Date.now(), mode: mode, input: input, ok: ok });
    if (c.attempts.length > 10) c.attempts.shift();
    o[id] = c; jset(PREFIX + "fcans", o);
  }

  function kpAll() { return jget(KPS_KEY, {}); }
  function kpRecord(kp, correct) {
    if (!kp) return;
    var o = kpAll(), c = o[kp] || { ok: 0, n: 0 };
    c.n++; if (correct) c.ok++;
    o[kp] = c; jset(KPS_KEY, o);
    bumpTask("practice");
    if (typeof window.__refreshHeat === "function") window.__refreshHeat();
  }
  /* 0~1 掌握度：正确率(0.6) + 复习强度(0.4) */
  function kpMastery(kp) {
    var c = kpAll()[kp], s = srsGet(kp);
    var acc = (c && c.n) ? c.ok / c.n : null;
    var strength = s ? Math.min(1, (s.reps || 0) / 4) : 0;
    if (acc == null) return strength;
    return 0.6 * acc + 0.4 * strength;
  }

  function todayStr(d) { d = d || new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function bumpTask(kind) {
    var all = jget(TASK_KEY, {}), t = todayStr();
    if (!all[t]) all[t] = { read: 0, review: 0, practice: 0 };
    all[t][kind] = (all[t][kind] || 0) + 1;
    jset(TASK_KEY, all);
    var st = jget(STREAK_KEY, { days: {}, last: "" });
    if (!st.days[t]) st.days[t] = 1; else st.days[t]++;
    st.last = t; jset(STREAK_KEY, st);
  }
  function taskState() {
    var all = jget(TASK_KEY, {}), t = todayStr();
    return all[t] || { read: 0, review: 0, practice: 0 };
  }
  function streakCount() {
    var st = jget(STREAK_KEY, { days: {} }), n = 0, d = new Date();
    for (var i = 0; i < 3650; i++) {
      if (st.days[todayStr(d)]) { n++; d.setDate(d.getDate() - 1); } else break;
    }
    return n;
  }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (m) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]; }); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function chNames() { var m = {}; (window.MANIFEST || []).forEach(function (x) { m[x.id] = x.title; }); return m; }

  function lev(a, b) {
    a = String(a); b = String(b);
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    var prev = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }
  function ratio(a, b) { a = String(a); b = String(b); var m = Math.max(a.length, b.length); return m ? 1 - lev(a, b) / m : 1; }

  function norm(s) {
    return String(s).toLowerCase()
      .replace(/[，,、;；\/|]+/g, " ")
      .replace(/[（）()【】\[\]{}“”"'’·:：.。\-—_~!！?？]/g, "")
      .replace(/\s+/g, " ").trim();
  }
  function tokens(s) { return norm(s).split(" ").filter(Boolean); }

  /* fuzzy match: exact / all-token-contained / per-token similarity */
  function fuzzyMatch(expected, user) {
    if (!user || !String(user).trim()) return false;
    var e = tokens(expected), u = norm(user), ut = u.split(" ").filter(Boolean);
    if (norm(expected) === u) return true;
    if (e.length && e.every(function (t) { return u.indexOf(t) >= 0; })) return true;
    if (e.length === ut.length && e.every(function (t, i) {
      return ratio(t, ut[i]) >= 0.8 || t.indexOf(ut[i]) >= 0 || ut[i].indexOf(t) >= 0;
    })) return true;
    // single-answer long string
    if (e.length === 1 && ratio(e[0], u) >= 0.82) return true;
    return false;
  }

  /* ================= handwriting ================= */
  var HW = {
    data: {}, cid: null,
    init: function (cid) { this.cid = cid; this.data = jget(skey(cid, "hw"), {}); },
    save: function () { jset(skey(this.cid, "hw"), this.data); },
    get: function (key) { return this.data[key] || []; },
    set: function (key, strokes) { this.data[key] = strokes; this.save(); },
    attach: function (canvas, key) {
      var self = this;
      canvas.dataset.key = key;
      function draw() {
        var dpr = window.devicePixelRatio || 1;
        var r = canvas.getBoundingClientRect();
        if (!r.width) return;
        canvas.width = r.width * dpr; canvas.height = r.height * dpr;
        var ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, r.width, r.height);
        ctx.strokeStyle = "#1a2b45"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
        var strokes = self.get(key);
        strokes.forEach(function (st) {
          if (!st.length) return;
          if (st.length === 1) { ctx.beginPath(); ctx.arc(st[0][0] * r.width, st[0][1] * r.height, 1.6, 0, 7); ctx.fill(); return; }
          ctx.beginPath();
          st.forEach(function (p, i) { var x = p[0] * r.width, y = p[1] * r.height; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
          ctx.stroke();
        });
      }
      function pos(e) { var r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
      var drawing = false, cur = null;
      canvas.addEventListener("pointerdown", function (e) {
        e.preventDefault(); canvas.setPointerCapture(e.pointerId); drawing = true;
        var p = pos(e);
        if (canvas.dataset.eraser === "1") { self.erase(key, p); draw(); return; }
        cur = [p]; var arr = self.get(key).slice(); arr.push(cur); self.data[key] = arr; draw();
      });
      canvas.addEventListener("pointermove", function (e) {
        if (!drawing) return; e.preventDefault();
        var p = pos(e);
        if (canvas.dataset.eraser === "1") { self.erase(key, p); draw(); return; }
        cur.push(p); draw();
      });
      function end() { if (!drawing) return; drawing = false; cur = null; self.save(); }
      canvas.addEventListener("pointerup", end);
      canvas.addEventListener("pointercancel", end);
      canvas.addEventListener("pointerleave", function () { if (drawing) end(); });
      canvas._redraw = draw; draw();
    },
    erase: function (key, p) {
      var arr = this.get(key).filter(function (st) {
        return !st.some(function (q) { return Math.abs(q[0] - p[0]) < 0.03 && Math.abs(q[1] - p[1]) < 0.05; });
      });
      this.data[key] = arr; this.save();
    },
    undo: function (key) { var arr = this.get(key); arr.pop(); this.data[key] = arr; this.save(); }
  };

  function hwBox(cid, key, tall) {
    var box = el("div", "hwbox");
    var bar = el("div", "hwbar");
    bar.appendChild(el("span", "lbl", "✍️ 手写作答/批注（触控笔/手指）"));
    var bEr = el("button", "", "橡皮：关"), bUn = el("button", "", "撤销"), bCl = el("button", "", "清空");
    bar.appendChild(bEr); bar.appendChild(bUn); bar.appendChild(bCl);
    var cv = el("canvas", "hw" + (tall ? " tall" : ""));
    box.appendChild(bar); box.appendChild(cv);
    bEr.onclick = function () {
      var on = cv.dataset.eraser === "1"; cv.dataset.eraser = on ? "0" : "1";
      bEr.textContent = "橡皮：" + (on ? "关" : "开"); bEr.classList.toggle("on", !on);
    };
    bUn.onclick = function () { HW.undo(key); cv._redraw(); };
    bCl.onclick = function () { if (confirm("清空本框手写？")) { HW.set(key, []); cv._redraw(); } };
    setTimeout(function () { HW.attach(cv, key); }, 0);
    window.addEventListener("resize", function () { if (cv._redraw) cv._redraw(); });
    return box;
  }

  /* ================= error-cause selector ================= */
  function causeBox(cid, qid, onPick) {
    var box = el("div", "causes"); box.style.display = "none";
    box.appendChild(el("span", "lab", "错因："));
    var entry = wrongList(cid).filter(function (e) { return e.id === qid; })[0];
    CAUSES.forEach(function (c) {
      var b = el("button", "", c[1]);
      if (entry && entry.cause === c[0]) b.classList.add("on");
      b.onclick = function () {
        Array.prototype.forEach.call(box.querySelectorAll("button"), function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        var arr = wrongList(cid);
        arr.forEach(function (e) { if (e.id === qid) e.cause = c[0]; });
        setWrong(cid, arr);
        if (onPick) onPick(c[0]);
      };
      box.appendChild(b);
    });
    return box;
  }

  /* ================= MCQ ================= */
  function renderMCQ(cid, q, idx) {
    var box = el("div", "q"); box.id = "q_" + q.id;
    box.appendChild(el("p", "qq", "第 " + idx + " 题 " + esc(q.q) + (q.mod ? '<span class="src">[' + esc(q.mod) + "]</span>" : "")));
    var opts = el("div", "mcq");
    q.o.forEach(function (o) {
      var letter = o.trim().charAt(0);
      var b = el("button", "mopt", esc(o));
      b.dataset.l = letter;
      b.onclick = function () { gradeMCQ(cid, q, box, letter); };
      opts.appendChild(b);
    });
    box.appendChild(opts);
    var res = el("div", "mres"); res.style.display = "none"; box.appendChild(res);
    var cb = causeBox(cid, q.id); box.appendChild(cb);
    box._cause = cb; box._res = res;
    return box;
  }

  function gradeMCQ(cid, q, box, chosen) {
    var correct = String(q.a).trim();
    var ok = chosen === correct;
    var store = mcqStore(cid);
    var rec = store[q.id] || { ok: 0, miss: 0 };
    rec.last = chosen;
    if (ok) { rec.ok++; rec.miss = Math.max(0, rec.miss - 1); } else { rec.miss++; rec.ok = Math.max(0, rec.ok - 1); }
    store[q.id] = rec; jset(skey(cid, "mcq"), store); touch(cid);

    Array.prototype.forEach.call(box.querySelectorAll(".mopt"), function (b) {
      b.classList.remove("sel", "right", "wrong");
      if (b.dataset.l === chosen) b.classList.add(ok ? "right" : "wrong");
      if (!ok && b.dataset.l === correct) b.classList.add("right");
      if (b.dataset.l === chosen) b.classList.add("sel");
    });
    var res = box._res; res.style.display = "block";
    res.innerHTML = (ok ? '<span class="ok">✔ 正确</span>' : '<span class="no">✘ 错误</span>（正确答案：<b>' + esc(correct) + "</b>）") +
      '<div style="margin-top:4px">解析：' + esc(q.e || "") + "</div>";
    box._cause.style.display = ok ? "none" : "flex";
    if (!ok) {
      addWrong(cid, { id: q.id, type: "mcq", q: q.q, correct: correct, chosen: chosen, cause: "", ts: Date.now() });
    } else {
      clearWrong(cid, q.id);
    }
    kpRecord(q.kp, ok);
    if (!ok) srsRate(q.id, 0); else if (srsGet(q.id)) srsRate(q.id, 2);
  }

  /* ================= 判断题 ================= */
  function renderJudge(cid, q, idx) {
    var box = el("div", "q"); box.id = "q_" + q.id;
    box.appendChild(el("p", "qq", "第 " + idx + " 题（判断对错） " + esc(q.q)));
    var opts = el("div", "mcq");
    ["对", "错"].forEach(function (v) {
      var b = el("button", "mopt", v); b.dataset.l = v;
      b.onclick = function () { gradeJudge(cid, q, box, v); };
      opts.appendChild(b);
    });
    box.appendChild(opts);
    var res = el("div", "mres"); res.style.display = "none"; box.appendChild(res);
    var cb = causeBox(cid, q.id); box.appendChild(cb);
    box._cause = cb; box._res = res;
    return box;
  }
  function gradeJudge(cid, q, box, chosen) {
    var correct = String(q.a).trim();
    var ok = chosen === correct;
    var store = judgeStore(cid);
    var rec = store[q.id] || { ok: 0, miss: 0 };
    rec.last = chosen;
    if (ok) { rec.ok++; rec.miss = Math.max(0, rec.miss - 1); } else { rec.miss++; rec.ok = Math.max(0, rec.ok - 1); }
    store[q.id] = rec; jset(skey(cid, "judge"), store); touch(cid);
    Array.prototype.forEach.call(box.querySelectorAll(".mopt"), function (b) {
      b.classList.remove("sel", "right", "wrong");
      if (b.dataset.l === chosen) b.classList.add(ok ? "right" : "wrong");
      if (!ok && b.dataset.l === correct) b.classList.add("right");
      if (b.dataset.l === chosen) b.classList.add("sel");
    });
    var res = box._res; res.style.display = "block";
    res.innerHTML = (ok ? '<span class="ok">✔ 正确</span>' : '<span class="no">✘ 错误</span>（正确答案：<b>' + esc(correct) + "</b>）") +
      '<div style="margin-top:4px">解析：' + esc(q.e || "") + "</div>";
    box._cause.style.display = ok ? "none" : "flex";
    if (!ok) addWrong(cid, { id: q.id, type: "judge", q: q.q, correct: correct, chosen: chosen, cause: "", ts: Date.now() });
    else clearWrong(cid, q.id);
    kpRecord(q.kp, ok);
    if (!ok) srsRate(q.id, 0); else if (srsGet(q.id)) srsRate(q.id, 2);
  }

  /* ================= fill ================= */
  function renderFill(cid, q, idx) {
    var box = el("div", "q"); box.id = "q_" + q.id;
    box.appendChild(el("p", "qq", "第 " + idx + " 题 " + esc(q.q)));
    var inp = el("input", "ans"); inp.placeholder = "输入答案（多个空用逗号分隔）"; box.appendChild(inp);
    var bar = el("div", "self");
    var bChk = el("button", "ok", "检查"), bShow = el("button", "", "显示答案");
    bar.appendChild(bChk); bar.appendChild(bShow); box.appendChild(bar);
    var det = el("details", "sol");
    det.innerHTML = '<summary>参考答案</summary><div class="ansbox"><b>' + esc(q.a) + "</b></div>";
    box.appendChild(det);
    var res = el("div", "mres"); res.style.display = "none"; box.appendChild(res);
    var cb = causeBox(cid, q.id); box.appendChild(cb);
    box.appendChild(hwBox(cid, q.id));

    box._check = function () {
      var ok = fuzzyMatch(q.a, inp.value);
      var store = fillStore(cid); var rec = store[q.id] || { ok: 0, miss: 0 };
      rec.last = inp.value;
      if (ok) { rec.ok++; rec.miss = Math.max(0, rec.miss - 1); } else { rec.miss++; rec.ok = Math.max(0, rec.ok - 1); }
      store[q.id] = rec; jset(skey(cid, "fill"), store); touch(cid);
      inp.classList.remove("right", "wrong"); inp.classList.add(ok ? "right" : "wrong");
      res.style.display = "block";
      res.innerHTML = ok ? '<span class="ok">✔ 正确</span>' : '<span class="no">✘ 与参考答案不完全一致</span>，可点“显示答案”核对。';
      cb.style.display = ok ? "none" : "flex";
      if (ok) { clearWrong(cid, q.id); } else { addWrong(cid, { id: q.id, type: "fill", q: q.q, correct: q.a, chosen: inp.value, cause: "", ts: Date.now() }); }
      kpRecord(q.kp, ok);
      if (!ok) srsRate(q.id, 0); else if (srsGet(q.id)) srsRate(q.id, 2);
    };
    bChk.onclick = box._check;
    bShow.onclick = function () { det.open = true; };
    return box;
  }

  /* ================= self-assessed (short/calc/term) ================= */
  function renderSelf(cid, q, idx, kind) {
    var box = el("div", "q"); box.id = "q_" + q.id;
    var title, answerHTML, kps = "";
    if (kind === "term") {
      title = "名词解释 " + idx + "：" + esc(q.term);
      answerHTML = "<b>标准定义：</b><br>" + esc(q.def).replace(/\n/g, "<br>");
      kps = q.kps || "";
    } else {
      title = (kind === "short" ? "简答题 " : "论述/推导 ") + idx + "：" + esc(q.q);
      answerHTML = "<b>参考答案：</b><br>" + esc(kind === "calc" ? (q.steps || q.a) : q.a).replace(/\n/g, "<br>");
    }
    box.appendChild(el("p", "qq", title));
    var ta = el("textarea", "ta");
    ta.placeholder = (kind === "term")
      ? "在此用键盘输入你的定义（先自己写，再展开标准定义核对；内容会自动保存）"
      : "在此用键盘输入你的答案要点（先自己写，再展开参考答案核对；内容会自动保存）";
    ta.rows = 5;
    ta.value = textStore(cid)[q.id] || "";
    ta.addEventListener("input", function () { saveText(cid, q.id, ta.value); });
    box.appendChild(ta);
    var tbar = el("div", "self");
    var bClr = el("button", "", "清空输入");
    bClr.onclick = function () { if (confirm("清空已输入的答案？")) { ta.value = ""; saveText(cid, q.id, ""); } };
    tbar.appendChild(bClr);
    box.appendChild(tbar);
    var det = el("details", "sol");
    det.innerHTML = '<summary>参考答案 / 踩分点</summary><div class="ansbox">' + answerHTML + "</div>" +
      (kps ? '<div class="kps">' + esc(kps) + "</div>" : "");
    box.appendChild(det);
    var bar = el("div", "self");
    var bOk = el("button", "ok", "✓ 我会（掌握）"), bNo = el("button", "no", "✗ 我不会");
    bar.appendChild(bOk); bar.appendChild(bNo); box.appendChild(bar);
    var cb = causeBox(cid, q.id); box.appendChild(cb);
    box.appendChild(hwBox(cid, q.id, kind !== "term"));

    function mark(state) {
      var store = selfStore(cid); var rec = store[q.id] || { ok: 0, miss: 0 };
      if (state === "ok") { rec.ok++; rec.miss = Math.max(0, rec.miss - 1); } else { rec.miss++; rec.ok = Math.max(0, rec.ok - 1); }
      rec.state = state; store[q.id] = rec; jset(skey(cid, "self"), store); touch(cid);
      bOk.classList.toggle("on", state === "ok"); bNo.classList.toggle("on", state === "no");
      cb.style.display = state === "no" ? "flex" : "none";
      if (state === "no") {
        addWrong(cid, { id: q.id, type: kind, q: (kind === "term" ? q.term : q.q), correct: (kind === "term" ? q.def : (kind === "calc" ? (q.a || q.steps) : q.a)), chosen: "(自评不会)", cause: "", ts: Date.now() });
      } else { clearWrong(cid, q.id); }
      kpRecord(q.kp, state === "ok");
      if (state === "no") srsRate(q.id, 0); else if (srsGet(q.id)) srsRate(q.id, 2);
    }
    bOk.onclick = function () { mark("ok"); };
    bNo.onclick = function () { mark("no"); };
    var st = selfStore(cid)[q.id];
    if (st && st.state) { bOk.classList.toggle("on", st.state === "ok"); bNo.classList.toggle("on", st.state === "no"); if (st.state === "no") cb.style.display = "flex"; }
    return box;
  }

  /* ================= stats ================= */
  function chapterStats(cid, ch) {
    var seen = seenStore(cid);
    var totalSlides = 0; ch.modules.forEach(function (m) { totalSlides += m.slides.length; });
    var seenN = 0; ch.modules.forEach(function (m) { m.slides.forEach(function (s) { if (seen[cid + "_s" + m.i + "_" + s.i]) seenN++; }); });
    var mc = mcqStore(cid), fi = fillStore(cid), se = selfStore(cid);
    var ok = 0, miss = 0;
    [mc, judgeStore(cid), fi, se].forEach(function (st) { Object.keys(st).forEach(function (k) { ok += st[k].ok || 0; miss += st[k].miss || 0; }); });
    var wb = wrongList(cid);
    return { slides: totalSlides, seen: seenN, ok: ok, miss: miss, wrong: wb.length,
             rate: (ok + miss) ? Math.round(ok * 100 / (ok + miss)) : null };
  }

  function renderStats(cid, ch, host) {
    var s = chapterStats(cid, ch);
    host.innerHTML =
      '<h3 style="margin-top:0">📊 本章学习统计</h3>' +
      '<p><span class="pill">概念页 ' + s.seen + "/" + s.slides + '</span>' +
      '<span class="pill">答对 ' + s.ok + '</span>' +
      '<span class="pill">答错 ' + s.miss + '</span>' +
      '<span class="pill">正确率 ' + (s.rate == null ? "—" : s.rate + "%") + '</span>' +
      '<span class="pill">错题本 ' + s.wrong + " 题</span></p>";
  }

  /* ================= wrong book (chapter drawer) ================= */
  function openWrongDrawer(cid, ch) {
    var old = document.getElementById("wbd"); if (old) old.remove();
    var d = el("div", "statsbox"); d.id = "wbd";
    d.style.cssText = "position:fixed;top:0;right:0;bottom:0;width:min(420px,94vw);overflow:auto;z-index:1500;box-shadow:-4px 0 16px rgba(0,0,0,.18);border-radius:0;margin:0";
    var head = el("div", "");
    head.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b style="color:var(--blue)">📕 错题本</b><button class="navbtn" style="width:auto;margin:0" id="wbClose">关闭</button></div>';
    d.appendChild(head);
    var list = wrongList(cid);
    var qmap = {};
    ch.mcq.forEach(function (q) { qmap[q.id] = q; });
    if (!list.length) { d.appendChild(el("p", "empty", "暂无错题，继续加油！")); }
    list.slice().reverse().forEach(function (e) {
      var item = el("div", "wb-entry");
      var q = qmap[e.id];
      var extra = q ? ("<div style='margin-top:4px'>选项：" + q.o.map(esc).join("　") + "</div>") : "";
      item.innerHTML = '<div class="wq">' + esc(e.q) + '<span class="pill">' + esc(e.type) + "</span>" +
        (e.cause ? '<span class="cause-tag">' + esc((CAUSES.filter(function (c) { return c[0] === e.cause; })[0] || ["", "其他"])[1]) + "</span>" : "") + "</div>" +
        extra +
        '<div class="wa">正确答案：<b>' + esc(e.correct) + "</b></div>" +
        (e.chosen ? '<div class="wa">你的作答：' + esc(e.chosen) + "</div>" : "");
      var act = el("div", "act");
      var bm = el("button", "", "标记已掌握");
      bm.onclick = function () { clearWrong(cid, e.id); item.remove(); };
      act.appendChild(bm); item.appendChild(act);
      d.appendChild(item);
    });
    document.body.appendChild(d);
    document.getElementById("wbClose").onclick = function () { d.remove(); };
  }

  /* ================= backup / restore ================= */
  function backupChapter(cid) {
    var out = {};
    ["mcq", "judge", "fill", "self", "seen", "text", "wrong", "hw", "last"].forEach(function (k) {
      var v = jget(skey(cid, k), null); if (v != null) out[skey(cid, k)] = v;
    });
    var blob = new Blob([JSON.stringify({ v: 1, cid: cid, data: out }, null, 1)], { type: "application/json" });
    var a = el("a"); a.href = URL.createObjectURL(blob); a.download = cid + "-backup.json"; a.click();
  }
  function restoreFile(cid, file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var obj = JSON.parse(r.result); var d = obj.data || obj;
        Object.keys(d).forEach(function (k) { if (k.indexOf(PREFIX) === 0) jset(k, d[k]); });
        alert("恢复成功，页面将刷新。"); location.reload();
      } catch (e) { alert("文件解析失败：" + e.message); }
    };
    r.readAsText(file);
  }

  /* ================= export PDF (questions + student answers) ================= */
  var PRINT_CSS =
    "*{box-sizing:border-box}" +
    "body{font-family:'Microsoft YaHei','PingFang SC',sans-serif;color:#111;font-size:12px;line-height:1.65;margin:0}" +
    "h1{font-size:20px;color:#1f5c8b;border-bottom:2px solid #1f5c8b;padding-bottom:6px;margin:0 0 6px}" +
    "h2{font-size:16px;color:#7a2a24;border-left:5px solid #c0392b;padding-left:8px;margin:0 0 8px}" +
    "h3{font-size:13.5px;color:#1f5c8b;margin:14px 0 6px}" +
    ".meta{color:#666;font-size:11px;margin:4px 0 14px}" +
    "section.module{page-break-before:always}" +
    "section.module:first-of-type{page-break-before:avoid}" +
    ".q{border:1px solid #ccc;border-radius:6px;padding:8px 10px;margin:8px 0;page-break-inside:avoid}" +
    ".qt{font-weight:700;margin-bottom:4px}" +
    ".opts{margin:2px 0 4px}" +
    ".stu{color:#0a6b2e;margin-top:3px}" +
    ".ans{color:#b0301f;margin-top:3px}" +
    ".exp{color:#555;font-size:11px;margin-top:3px}" +
    ".hwimg{max-width:100%;border:1px solid #ddd;border-radius:4px;margin-top:4px}" +
    "@media print{@page{size:A4;margin:14mm}}";

  function strokesToDataURL(strokes, w, h) {
    if (!strokes || !strokes.length) return null;
    var cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    var ctx = cv.getContext("2d");
    ctx.fillStyle = "#fffdf7"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#1a2b45"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    strokes.forEach(function (st) {
      if (!st.length) return;
      if (st.length === 1) { ctx.beginPath(); ctx.arc(st[0][0] * w, st[0][1] * h, 1.6, 0, 7); ctx.fill(); return; }
      ctx.beginPath();
      st.forEach(function (p, i) { var x = p[0] * w, y = p[1] * h; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    });
    return cv.toDataURL("image/png");
  }

  function buildChapterDoc(cid, ch) {
    var mc = mcqStore(cid), fi = fillStore(cid), se = selfStore(cid), tx = textStore(cid), jg = judgeStore(cid);
    var hw = jget(skey(cid, "hw"), {});
    var P = [];
    P.push('<h1>' + esc(ch.title) + '</h1>');
    P.push('<p class="meta">题目与我的作答 ｜ 导出时间：' + esc(new Date().toLocaleString("zh-CN")) + '</p>');
    ch.modules.forEach(function (m) {
      P.push('<section class="module">');
      P.push('<h2>' + esc(m.name) + '</h2>');
      if (m.mcq && m.mcq.length) {
        P.push('<h3>一、选择题</h3>');
        m.mcq.forEach(function (q, i) {
          var rec = mc[q.id] || {};
          P.push('<div class="q"><div class="qt">' + (i + 1) + '. ' + esc(q.q) + '</div>');
          P.push('<div class="opts">' + q.o.map(function (o) { return '<div>' + esc(o) + '</div>'; }).join('') + '</div>');
          P.push('<div class="stu">我的作答：<b>' + esc(rec.last || "（未作答）") + '</b></div>');
          P.push('<div class="ans">正确答案：' + esc(q.a) + '</div>');
          if (q.e) P.push('<div class="exp">解析：' + esc(q.e) + '</div>');
          var im = strokesToDataURL(hw[q.id], 900, 150);
          if (im) P.push('<img class="hwimg" src="' + im + '">');
          P.push('</div>');
        });
      }
      if (m.judge && m.judge.length) {
        P.push('<h3>二、判断题</h3>');
        m.judge.forEach(function (q, i) {
          var rec = jg[q.id] || {};
          P.push('<div class="q"><div class="qt">' + (i + 1) + '. ' + esc(q.q) + '</div>');
          P.push('<div class="stu">我的作答：<b>' + esc(rec.last || "（未作答）") + '</b></div>');
          P.push('<div class="ans">正确答案：' + esc(q.a) + '</div>');
          if (q.e) P.push('<div class="exp">解析：' + esc(q.e) + '</div>');
          P.push('</div>');
        });
      }
      if (m.fill && m.fill.length) {
        P.push('<h3>三、填空题</h3>');
        m.fill.forEach(function (q, i) {
          var rec = fi[q.id] || {};
          P.push('<div class="q"><div class="qt">' + (i + 1) + '. ' + esc(q.q) + '</div>');
          P.push('<div class="stu">我的作答：<b>' + esc(rec.last || tx[q.id] || "（未作答）") + '</b></div>');
          P.push('<div class="ans">参考答案：' + esc(q.a) + '</div>');
          var im = strokesToDataURL(hw[q.id], 900, 150);
          if (im) P.push('<img class="hwimg" src="' + im + '">');
          P.push('</div>');
        });
      }
      function selfSec(title, arr, kind) {
        if (!arr || !arr.length) return;
        P.push('<h3>' + title + '</h3>');
        arr.forEach(function (q, i) {
          var st = se[q.id] || {};
          var qtext = kind === "term" ? q.term : q.q;
          var ans = kind === "term" ? q.def : (kind === "calc" ? (q.steps || q.a) : q.a);
          P.push('<div class="q"><div class="qt">' + (i + 1) + '. ' + esc(qtext) + '</div>');
          P.push('<div class="stu">我的作答：<br>' + esc(tx[q.id] || "（未作答）").replace(/\n/g, "<br>") + '</div>');
          P.push('<div class="stu">自评：' + (st.state === "ok" ? "会" : st.state === "no" ? "不会" : "未评") + '</div>');
          P.push('<div class="ans">参考答案：<br>' + esc(ans).replace(/\n/g, "<br>") + '</div>');
          if (q.kps) P.push('<div class="exp">踩分点：' + esc(q.kps) + '</div>');
          var im = strokesToDataURL(hw[q.id], 900, 230);
          if (im) P.push('<img class="hwimg" src="' + im + '">');
          P.push('</div>');
        });
      }
      selfSec("四、简答题", m.short, "short");
      selfSec("五、论述 / 推导题", m.calc, "calc");
      selfSec("六、名词解释", m.term, "term");
      P.push('</section>');
    });
    return P.join("");
  }

  function printDoc(bodyHtml, title, css) {
    var html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + (css || PRINT_CSS) + '</style></head><body>' + bodyHtml + '</body></html>';
    var iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    var doc = iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(function () {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
      catch (e) { alert("打印失败：" + e.message); }
      setTimeout(function () { iframe.remove(); }, 60000);
    }, 300);
  }

  function exportChapterPDF(cid) {
    var ch = window.CHAPTERS[cid];
    printDoc(buildChapterDoc(cid, ch), ch.title + " 题目与作答");
  }

  function exportAllPDF() {
    var M = window.MANIFEST || [];
    var P = ['<h1>分子生物学 · 全部章节（题目与我的作答）</h1>', '<p class="meta">导出时间：' + esc(new Date().toLocaleString("zh-CN")) + '</p>'];
    M.forEach(function (m) { var ch = window.CHAPTERS[m.id]; if (ch) P.push(buildChapterDoc(m.id, ch)); });
    printDoc(P.join(""), "分子生物学 全部题目与作答");
  }

  /* ================= 闪卡 PDF 导出（按章） ================= */
  var CARDS_CSS =
    "body{font-family:'Microsoft YaHei','PingFang SC',sans-serif;color:#111;font-size:12px;line-height:1.6;margin:0}" +
    "h1{font-size:20px;color:#1f5c8b;border-bottom:2px solid #1f5c8b;padding-bottom:6px;margin:0 0 6px}" +
    "h2{font-size:15px;color:#7a2a24;border-left:5px solid #c0392b;padding-left:8px;margin:16px 0 8px;page-break-after:avoid}" +
    ".meta{color:#666;font-size:11px;margin:4px 0 12px}" +
    ".fc{padding:5px 10px;margin:5px 0;page-break-inside:avoid;border-bottom:1px dashed #ddd}" +
    ".fcn{color:#1f5c8b;font-weight:700}" +
    ".fcq{font-weight:700;color:#111}" +
    ".fca{color:#0a6b2e;margin-top:2px}" +
    ".fcm{color:#9a6b00;font-size:11px;margin-top:2px}" +
    "@media print{@page{size:A4;margin:14mm}}";

  function buildCardsDoc(cid, ch) {
    var cards = buildCards().filter(function (c) { return c.ch === cid; });
    var byMod = {};
    cards.forEach(function (c) { var k = (c.mod == null ? "z" : c.mod); (byMod[k] = byMod[k] || []).push(c); });
    var P = ['<h1>' + esc(ch.title) + ' · 闪卡</h1>',
      '<p class="meta">共 ' + cards.length + ' 张 · 导出时间：' + esc(new Date().toLocaleString("zh-CN")) + ' · 数据存本机</p>'];
    Object.keys(byMod).sort(function (a, b) { return (a === "z" ? 99 : a) - (b === "z" ? 99 : b); }).forEach(function (mi) {
      var arr = byMod[mi];
      P.push('<h2>' + esc(arr[0].modName || "其他") + "（" + arr.length + "）</h2>");
      arr.forEach(function (c, i) {
        var back = String(c.back || "").replace(/<img[^>]*>/g, "");
        P.push('<div class="fc"><div class="fcq"><span class="fcn">' + (i + 1) + ".</span> " + esc(c.front) +
          '</div><div class="fca">' + back + "</div></div>");
      });
    });
    return P.join("");
  }
  function exportCardsPDF(cid) {
    var ch = window.CHAPTERS[cid]; if (!ch) return;
    printDoc(buildCardsDoc(cid, ch), ch.title + " 闪卡", CARDS_CSS);
  }
  function exportAllCardsPDF() {
    var M = window.MANIFEST || [];
    var P = ['<h1>分子生物学 · 全部闪卡</h1>', '<p class="meta">导出时间：' + esc(new Date().toLocaleString("zh-CN")) + '</p>'];
    M.forEach(function (m) { var ch = window.CHAPTERS[m.id]; if (ch) P.push(buildCardsDoc(m.id, ch)); });
    printDoc(P.join(""), "分子生物学 全部闪卡", CARDS_CSS);
  }

  /* ================= chapter page ================= */
  /* ---------- 本页自测（选做）与掌握度热力图 ---------- */
  function pickCheckpoint(qByKp, kp) {
    var arr = qByKp[kp]; if (!arr) return null;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].kind === "mcq" || arr[i].kind === "judge" || arr[i].kind === "fill") return arr[i];
    }
    return null;
  }
  function renderCheckpoint(cid, kp, qByKp, slide) {
    var pick = pickCheckpoint(qByKp, kp);
    var q, kind;
    if (pick) { q = pick.q; kind = pick.kind; }
    else if (slide && slide.check) { q = slide.check; kind = "mcq"; }
    else return null;
    var box = el("div", "checkpoint");
    box.appendChild(el("div", "cp-h", "🎯 本页自测（选做，不计入已读）"));
    var done = false;
    var fb = el("div", "cp-fb");
    function optLetter(o) { return String(o).trim().charAt(0); }
    function answerText() {
      if (kind === "mcq") {
        for (var i = 0; i < (q.o || []).length; i++) if (optLetter(q.o[i]) === String(q.a).trim()) return q.o[i];
        return String(q.a);
      }
      return q.a != null ? String(q.a) : "";
    }
    function grade(correct, opts, chosenEl) {
      if (done) return; done = true;
      kpRecord(kp, correct);
      if (!correct) srsRate(q.id, 0); else if (srsGet(q.id)) srsRate(q.id, 2);
      if (opts) {
        Array.prototype.forEach.call(opts.children, function (b) {
          var isRight = (kind === "judge") ? (b.textContent.trim() === String(q.a).trim()) : (optLetter(b.textContent) === String(q.a).trim());
          if (isRight) b.classList.add("right");
        });
        if (chosenEl && !correct) chosenEl.classList.add("wrong");
      }
      fb.innerHTML = (correct ? '<span class="ok">✔ 正确</span>' : '<span class="no">✘ 错误</span>') +
        '　正确答案：<b>' + esc(answerText()) + "</b>" +
        (q.e ? '<div style="margin-top:4px">解析：' + esc(q.e) + "</div>" : "");
    }
    if (kind === "mcq") {
      box.appendChild(el("div", "cp-q", esc(q.q)));
      var opts = el("div", "cp-opts");
      q.o.forEach(function (o, i) { var b = el("button", "cp-opt", esc(o)); b.onclick = function () { grade(optLetter(o) === String(q.a).trim(), opts, b); }; opts.appendChild(b); });
      box.appendChild(opts);
    } else if (kind === "judge") {
      box.appendChild(el("div", "cp-q", esc(q.q)));
      var o2 = el("div", "cp-opts");
      ["对", "错"].forEach(function (v) { var b = el("button", "cp-opt", v); b.onclick = function () { grade(v === q.a, o2, b); }; o2.appendChild(b); });
      box.appendChild(o2);
    } else {
      box.appendChild(el("div", "cp-q", esc(q.q)));
      var inp = el("input", "cp-in"); inp.placeholder = "输入答案";
      var bc = el("button", "cp-opt", "检查"); bc.onclick = function () { grade(fuzzyMatch(q.a, inp.value)); };
      box.appendChild(inp); box.appendChild(bc);
    }
    box.appendChild(fb);
    return box;
  }
  function renderHeatmap(cid, ch, host) {
    function draw() {
      var total = 0, mastered = 0, html = "";
      ch.modules.forEach(function (m) {
        html += '<div class="hm-mod"><div class="hm-name">' + esc(m.name) + '</div><div class="hm-grid">';
        m.slides.forEach(function (s) {
          var kp = cid + "_s" + m.i + "_" + s.i, v = kpMastery(kp);
          total++; if (v >= 0.6) mastered++;
          var cls = v >= 0.8 ? "hm-a" : v >= 0.6 ? "hm-b" : v > 0 ? "hm-c" : "hm-0";
          if (isConfused(cid, kp)) cls += " hm-conf";
          html += '<a class="hm-cell ' + cls + '" href="#s_' + kp + '" title="' + esc(s.title) + '（掌握度 ' + Math.round(v * 100) + '%）' + (isConfused(cid, kp) ? " · 待问" : "") + '"></a>';
        });
        html += "</div></div>";
      });
      host.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
        '<h3 style="margin:0">🧭 知识点掌握度</h3><span class="hint">已掌握 ' + mastered + "/" + total + ' ｜ 点方块跳到该页</span></div>' + html;
    }
    draw();
    window.__refreshHeat = draw;
  }

  function renderChapter(cid) {
    var ch = window.CHAPTERS[cid];
    if (!ch) { document.getElementById("main").innerHTML = "<p>数据未加载。</p>"; return; }
    HW.init(cid);
    document.title = ch.title + " · 分子生物学";
    var aside = document.getElementById("sidebar"), main = document.getElementById("main");
    aside.innerHTML = '<div class="ttl">' + esc(ch.title) + '</div><a href="index.html">← 返回首页</a><a href="textbook.html">📚 教材对照表</a><a href="glossary.html">📖 术语表</a><a href="review.html">🔁 今日复习</a><a href="flashcards.html?ch=' + esc(cid) + '">🃏 闪卡</a><a href="exam.html">📝 模拟测验</a>';
    aside.appendChild(el("div", "grp", "各模块（概念 + 考题）"));
    ch.modules.forEach(function (m) {
      var a = el("a", "", esc(m.name)); a.href = "#m" + m.i; aside.appendChild(a);
      var subs = [];
      if (m.mcq && m.mcq.length) subs.push(["m" + m.i + "-mcq", "选择题"]);
      if (m.judge && m.judge.length) subs.push(["m" + m.i + "-judge", "判断题"]);
      if (m.fill && m.fill.length) subs.push(["m" + m.i + "-fill", "填空题"]);
      if (m.short && m.short.length) subs.push(["m" + m.i + "-short", "简答题"]);
      if (m.calc && m.calc.length) subs.push(["m" + m.i + "-calc", "论述/推导"]);
      if (m.term && m.term.length) subs.push(["m" + m.i + "-term", "名词解释"]);
      subs.forEach(function (x) { var sa = el("a", "sub", "· " + x[1]); sa.href = "#" + x[0]; aside.appendChild(sa); });
    });
    var tools = el("div", "navbtns");
    function tb(label, fn) { var b = el("button", "navbtn", label); b.onclick = fn; tools.appendChild(b); }
    tb("📕 错题本", function () { openWrongDrawer(cid, ch); });
    tb("📋 交卷判分", function () { mGradeAll(cid); });
    tb("📊 学习统计", function () { renderStats(cid, ch, document.getElementById("statsbox")); document.getElementById("statsbox").scrollIntoView({ behavior: "smooth" }); });
    tb("💾 数据备份", function () { backupChapter(cid); });
    tb("🖨 导出PDF（题目+我的作答）", function () { exportChapterPDF(cid); });
    var rst = el("button", "navbtn", "⬆ 从备份恢复");
    var fi = el("input"); fi.type = "file"; fi.accept = ".json"; fi.style.display = "none";
    fi.onchange = function () { if (fi.files[0]) restoreFile(cid, fi.files[0]); };
    rst.onclick = function () { fi.click(); };
    tools.appendChild(rst); aside.appendChild(tools); aside.appendChild(fi);
    aside.appendChild(el("div", "grp", "进度"));
    var pbar = el("div", "prog"); pbar.innerHTML = "<i></i>"; aside.appendChild(pbar);
    var ptxt = el("div", "hint"); aside.appendChild(ptxt);
    function refreshProgress() { var s = chapterStats(cid, ch); pbar.firstChild.style.width = (s.slides ? Math.round(s.seen * 100 / s.slides) : 0) + "%"; ptxt.textContent = "概念页 " + s.seen + "/" + s.slides + " ｜ 错题 " + s.wrong + " ｜ 待问 " + confusedCount(cid); }

    // hero
    var hero = el("div", "hero");
    hero.innerHTML = "<h1>" + esc(ch.title) + '</h1><div class="tag">' + esc(ch.sub2 || "") + " ｜ 概念逐页 + 全题型练习 + 错题本 + 手写</div>";
    main.appendChild(hero);

    if (ch.preview) {
      var pv = el("div", "statsbox previewbox");
      pv.innerHTML = '<h3 style="margin:0 0 6px">📖 课前预习导览</h3>' +
        '<p class="pv-main">' + esc(ch.preview.main) + "</p>" +
        '<div class="pv-q">带着这些问题去听课：</div><ol>' +
        (ch.preview.questions || []).map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ol>";
      main.appendChild(pv);
    }

    var statsbox = el("div", "statsbox"); statsbox.id = "statsbox"; renderStats(cid, ch, statsbox); main.appendChild(statsbox);
    var heat = el("div", "statsbox"); heat.id = "heatmap"; renderHeatmap(cid, ch, heat); main.appendChild(heat);

    // concept slides
    var seen = seenStore(cid);
    var qByKp = {};
    ["mcq", "judge", "fill", "short", "calc", "term"].forEach(function (kind) {
      (ch[kind] || []).forEach(function (q) { if (q.kp) { (qByKp[q.kp] = qByKp[q.kp] || []).push({ q: q, kind: kind }); } });
    });
    var animIO = window.IntersectionObserver ? new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) { var f = en.target; if (!f.src) f.src = f.getAttribute("data-src"); animIO.unobserve(f); } });
    }, { rootMargin: "500px" }) : null;
    ch.modules.forEach(function (m) {
      var sec = el("section"); sec.id = "m" + m.i;
      sec.appendChild(el("h2", "", esc(m.name)));
      m.slides.forEach(function (s) {
        var key = cid + "_s" + m.i + "_" + s.i;
        var card = el("div", "slide"); card.id = "s_" + key;
        var lv = s.level || "掌握";
        var head = el("div", "sh");
        head.innerHTML = '<span class="t">' + esc(s.title) + '</span><span class="lv lv-' + esc(lv) + '">' + esc(lv) + "</span>";
        card.appendChild(head);
        var body = el("div", "body");
        var img = el("img"); img.src = s.img; img.loading = "lazy"; img.alt = s.title;
        img.onclick = function () { document.getElementById("lbimg").src = s.img; document.getElementById("lightbox").classList.add("on"); };
        body.appendChild(img);
        body.appendChild(el("div", "notes", esc(s.notes)));
        card.appendChild(body);
        if (s.points && s.points.length) {
          var pb = el("div", "points");
          pb.innerHTML = '<div class="pt-h">📌 本页要点</div><ul>' +
            s.points.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>";
          card.appendChild(pb);
        }
        if (s.fig) {
          var fb = el("div", "fignote");
          fb.innerHTML = '<div class="fn-h">🔍 图注解读</div><p>' + esc(s.fig).replace(/\n/g, "<br>") + "</p>";
          card.appendChild(fb);
        }
        var cp = renderCheckpoint(cid, key, qByKp, s);
        if (cp) card.appendChild(cp);
        if (s.anim) {
          var aw = el("div", "animwrap");
          aw.appendChild(el("div", "animhead", "🎬 动画演示（在老师原图下方）"));
          var ifr = document.createElement("iframe");
          ifr.className = "animframe"; ifr.loading = "lazy"; ifr.setAttribute("title", s.title);
          ifr.setAttribute("data-src", "anim/" + s.anim + ".html?embed=1&v=20260911f");
          aw.appendChild(ifr); card.appendChild(aw);
          if (animIO) animIO.observe(ifr); else ifr.src = ifr.getAttribute("data-src");
        }
        var db = el("button", "donebtn", seen[key] ? "✓ 已读" : "标记已读");
        if (seen[key]) { card.classList.add("done"); db.classList.add("on"); }
        db.onclick = function () {
          seen[key] = seen[key] ? 0 : 1; jset(skey(cid, "seen"), seen);
          if (seen[key]) {
            bumpTask("read");
            if (!srsGet(key)) srsRate(key, 2);   // 首次标记已读 → 安排首次复习
          }
          card.classList.toggle("done", !!seen[key]); db.classList.toggle("on", !!seen[key]);
          db.textContent = seen[key] ? "✓ 已读" : "标记已读"; refreshProgress();
        };
        card.appendChild(db);
        var cfd = confusedStore(cid)[key] || {};
        var cf = el("button", "confbtn" + (isConfused(cid, key) ? " on" : ""), isConfused(cid, key) ? "❓ 待问" : "❓ 没听懂");
        var cnote = el("input", "confnote");
        cnote.placeholder = "哪里不懂？（选填，方便问老师）";
        cnote.value = cfd.note || "";
        cnote.style.display = isConfused(cid, key) ? "block" : "none";
        cnote.oninput = function () { var o = confusedStore(cid); if (o[key]) { o[key].note = cnote.value; setConfusedStore(cid, o); } };
        cf.onclick = function () {
          var on = toggleConfused(cid, key, cnote.value);
          cf.classList.toggle("on", on);
          cf.textContent = on ? "❓ 待问" : "❓ 没听懂";
          cnote.style.display = on ? "block" : "none";
          refreshProgress();
        };
        card.appendChild(cf); card.appendChild(cnote);
        sec.appendChild(card);
      });
      // 本模块考题：概念页后紧跟该模块的全部考题（选择/填空/简答/论述/名词）
      var qWrap = el("div", "modquiz");
      function qh(id, text) { var h = el("h3", "", text); h.id = id; return h; }
      if (m.mcq && m.mcq.length) {
        qWrap.appendChild(qh("m" + m.i + "-mcq", "📝 本模块考题 · 选择题（点选项即时判分）"));
        m.mcq.forEach(function (q, i) { qWrap.appendChild(renderMCQ(cid, q, i + 1)); });
      }
      if (m.judge && m.judge.length) {
        qWrap.appendChild(qh("m" + m.i + "-judge", "📝 本模块考题 · 判断题（点“对/错”即时判分）"));
        m.judge.forEach(function (q, i) { qWrap.appendChild(renderJudge(cid, q, i + 1)); });
      }
      if (m.fill && m.fill.length) {
        qWrap.appendChild(qh("m" + m.i + "-fill", "📝 本模块考题 · 填空题（输入答案，自动模糊判分）"));
        m.fill.forEach(function (q, i) { qWrap.appendChild(renderFill(cid, q, i + 1)); });
      }
      if (m.short && m.short.length) {
        qWrap.appendChild(qh("m" + m.i + "-short", "📝 本模块考题 · 简答题"));
        m.short.forEach(function (q, i) { qWrap.appendChild(renderSelf(cid, q, i + 1, "short")); });
      }
      if (m.calc && m.calc.length) {
        qWrap.appendChild(qh("m" + m.i + "-calc", "📝 本模块考题 · 论述 / 推导题"));
        m.calc.forEach(function (q, i) { qWrap.appendChild(renderSelf(cid, q, i + 1, "calc")); });
      }
      if (m.term && m.term.length) {
        qWrap.appendChild(qh("m" + m.i + "-term", "📝 本模块考题 · 名词解释（含踩分点）"));
        m.term.forEach(function (q, i) { qWrap.appendChild(renderSelf(cid, q, i + 1, "term")); });
      }
      if (qWrap.children.length) sec.appendChild(qWrap);
      main.appendChild(sec);
    });

    main.appendChild(el("footer", "", "仅供个人学习使用 ｜ 数据保存在本机浏览器 localStorage"));
    refreshProgress();
  }

  function mGradeAll(cid) {
    var n = 0;
    document.querySelectorAll(".q").forEach(function (q) { if (typeof q._check === "function") { q._check(); n++; } });
    var ch = window.CHAPTERS[cid], host = document.getElementById("statsbox");
    if (ch && host) renderStats(cid, ch, host);
    alert("已判分：本次检查 " + n + " 道填空题。选择题为点选即时判分。可在左侧查看『学习统计』或『错题本』。");
  }

  /* ================= flashcards (auto-derived) ================= */
  function buildCards() {
    var cards = [];
    (window.MANIFEST || []).forEach(function (m) {
      var ch = window.CHAPTERS[m.id]; if (!ch) return;
      (ch.term || []).forEach(function (q) {
        var modName = (q.modI != null && ch.modules[q.modI]) ? ch.modules[q.modI].name : "";
        cards.push({
          id: "fc_term_" + q.id, ch: m.id, mod: (q.modI != null ? q.modI : null), modName: modName, tag: "名词解释", front: q.term,
          back: "<b>定义</b><br>" + esc(q.def).replace(/\n/g, "<br>") + (q.kps ? '<div class="fc-kps">踩分点：' + esc(q.kps) + "</div>" : ""),
          plain: q.def, blank: q.term
        });
      });
      (ch.appcards || []).forEach(function (c, i) {
        cards.push({
          id: "fc_app_" + m.id + "_" + i, ch: m.id, mod: c.mod, modName: c.modName || "应用综合",
          tag: "应用卡片", subjective: true, front: c.front,
          back: esc(c.back).replace(/\n/g, "<br>") + (c.points ? '<div class="fc-kps">踩分点：' + esc(c.points) + "</div>" : ""),
          plain: c.back, blank: ""
        });
      });
      ch.modules.forEach(function (mod) {
        mod.slides.forEach(function (s) {
          var kp0 = m.id + "_s" + mod.i + "_" + s.i;
          (s.cards || []).forEach(function (c, i) {
            var back = esc(c.back).replace(/\n/g, "<br>");
            if (c.mnemonic) back += '<div class="fc-mn">💡 ' + esc(c.mnemonic) + "</div>";
            if (c.useImg && s.img) back += '<img class="fc-img" src="' + s.img + '" loading="lazy" alt="">';
            cards.push({ id: "fc_s_" + kp0 + "_" + i, ch: m.id, mod: mod.i, modName: mod.name, tag: "掌握卡片", front: c.front, back: back, plain: c.back, blank: c.blank || "", blank2: c.blank2 || "" });
          });
          if (!s.points && !s.fig) return;
          var kp = m.id + "_s" + mod.i + "_" + s.i, back = "";
          if (s.points && s.points.length) back += "<ul>" + s.points.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>";
          if (s.fig) back += '<div class="fc-fig">' + esc(s.fig).replace(/\n/g, "<br>") + "</div>";
          cards.push({ id: "fc_kp_" + kp, ch: m.id, mod: mod.i, modName: mod.name, tag: "本页要点", front: s.title, back: back,
            plain: (s.points ? s.points.join("；") : "") + (s.fig ? " " + s.fig : ""), blank: "" });
        });
      });
    });
    (window.GLOSSARY || []).forEach(function (g, i) {
      cards.push({
        id: "fc_gloss_" + i, ch: g.ch, mod: null, modName: "", tag: "术语", front: g.t,
        back: (g.en ? "<b>" + esc(g.en) + "</b><br>" : "") + esc(g.d),
        plain: g.d, blank: g.t
      });
    });
    return cards;
  }
  function cardMap() { var m = {}; buildCards().forEach(function (c) { m[c.id] = c; }); return m; }

  function renderFlashcards() {
    var ctl = document.getElementById("fcctl"), host = document.getElementById("fchost"), progEl = document.getElementById("fcprog");
    if (!host) return;
    var cards = buildCards();
    function renderProgress() {
      if (!progEl) return;
      var now = Date.now(), learned = 0, mastered = 0, due = 0, byTag = {};
      cards.forEach(function (c) {
        var s = srsGet(c.id);
        var t = byTag[c.tag] = byTag[c.tag] || { n: 0, learned: 0 };
        t.n++;
        if (s) {
          learned++; t.learned++;
          if ((s.reps || 0) >= 3) mastered++;
          if (s.due <= now) due++;
        }
      });
      var tags = Object.keys(byTag).map(function (t) {
        return '<span class="fcp-tag">' + esc(t) + " " + byTag[t].learned + "/" + byTag[t].n + "</span>";
      }).join("");
      progEl.innerHTML = '<div class="fcp"><span class="fcp-big">已学 ' + learned + "/" + cards.length + "</span>" +
        "<span>掌握 <b>" + mastered + "</b></span><span>待复习 <b>" + due + "</b></span>" +
        '<span class="fcp-tags">' + tags + "</span></div>";
    }
    var names = chNames();
    var chs = {}, tags = {};
    cards.forEach(function (c) { if (c.ch) chs[c.ch] = 1; tags[c.tag] = 1; });
    var curCh = "all", curTag = "all", curMod = "all", mode = "填空", dueOnly = false, wrongOnly = false, deck = [], pos = 0;
    try {
      var usp = new URLSearchParams(location.search);
      var qp = usp.get("ch"); if (qp && chs[qp]) curCh = qp;
      if (usp.get("due") === "1") dueOnly = true;
    } catch (e) { }
    ctl.innerHTML = "";
    var row1 = el("div", "fc-chips"), row2 = el("div", "fc-chips"), row3 = el("div", "fc-chips"), row0 = el("div", "fc-chips");
    var dueN = cards.filter(function (c) { var s = srsGet(c.id); return s && s.due <= Date.now(); }).length;
    var bDue = el("button", "fc-chip" + (dueOnly ? " on" : ""), "📅 今日卡片（" + dueN + " 张到期）");
    bDue.onclick = function () { dueOnly = !dueOnly; wrongOnly = false; curCh = "all"; curTag = "all"; curMod = "all"; sync(); build(); };
    row0.appendChild(bDue);
    var wrongN = cards.filter(function (c) { var a = fcAnsGet(c.id); return a && !a.lastOk; }).length;
    var bWrong = el("button", "fc-chip" + (wrongOnly ? " on" : ""), "❌ 重练错卡（" + wrongN + "）");
    bWrong.onclick = function () { wrongOnly = !wrongOnly; dueOnly = false; curCh = "all"; curTag = "all"; curMod = "all"; sync(); build(); };
    row0.appendChild(bWrong);
    function mk(label, val, group) {
      var b = el("button", "fc-chip", label); b.dataset.v = val;
      b.onclick = function () {
        dueOnly = false;
        if (group === "ch") curCh = val; else if (group === "tag") curTag = val; else mode = val;
        sync(); build();
      };
      return b;
    }
    row1.appendChild(mk("全部章节", "all", "ch"));
    Object.keys(chs).sort().forEach(function (c) { row1.appendChild(mk(names[c] || c, c, "ch")); });
    row2.appendChild(mk("全部类型", "all", "tag"));
    Object.keys(tags).forEach(function (t) { row2.appendChild(mk(t, t, "tag")); });
    [["背", "背"], ["填空", "填空"], ["写", "写"]].forEach(function (o) { row3.appendChild(mk("模式：" + o[0], o[1], "mode")); });
    ctl.appendChild(row0); ctl.appendChild(row1); ctl.appendChild(row2); ctl.appendChild(row3);
    // 分类学习：按章 / 主题（模块）
    var catsEl = document.getElementById("fccats");
    if (catsEl) {
      var cats = {};
      cards.forEach(function (c) {
        if (!c.ch) return;
        var cat = cats[c.ch] = cats[c.ch] || { name: names[c.ch] || c.ch, total: 0, mods: {} };
        cat.total++;
        if (c.mod != null) { var mm = cat.mods[c.mod] = cat.mods[c.mod] || { name: c.modName || ("模块" + c.mod), count: 0 }; mm.count++; }
      });
      var ch2 = '<div class="fc-catbox"><div class="fc-cathead">📂 分类学习（点「学这组」只练该章/该主题） ' +
        '<button class="fc-pdf" data-ch="">🖨 导出全部闪卡PDF</button></div>';
      Object.keys(cats).sort().forEach(function (cid) {
        var cat = cats[cid];
        ch2 += '<details class="fc-cat"><summary>' + esc(cat.name) + ' <span class="fc-cnt">' + cat.total + ' 张</span></summary>' +
          '<div class="fc-catrow"><button class="fc-go" data-ch="' + cid + '" data-mod="">学整章（' + cat.total + '）</button> ' +
          '<button class="fc-pdf" data-ch="' + cid + '">🖨 导出本章PDF</button></div>';
        Object.keys(cat.mods).sort(function (a, b) { return a - b; }).forEach(function (mi) {
          var mm = cat.mods[mi];
          ch2 += '<div class="fc-catrow"><button class="fc-go" data-ch="' + cid + '" data-mod="' + mi + '">' + esc(mm.name) + '（' + mm.count + '）</button></div>';
        });
        ch2 += "</details>";
      });
      ch2 += "</div>";
      catsEl.innerHTML = ch2;
      Array.prototype.forEach.call(catsEl.querySelectorAll(".fc-go"), function (b) {
        b.onclick = function () {
          curCh = b.dataset.ch; curMod = b.dataset.mod === "" ? "all" : b.dataset.mod; curTag = "all";
          sync(); build();
          host.scrollIntoView({ behavior: "smooth" });
        };
      });
      Array.prototype.forEach.call(catsEl.querySelectorAll(".fc-pdf"), function (b) {
        b.onclick = function () { if (b.dataset.ch) exportCardsPDF(b.dataset.ch); else exportAllCardsPDF(); };
      });
    }
    function sync() {
      bDue.classList.toggle("on", dueOnly);
      bWrong.classList.toggle("on", wrongOnly);
      Array.prototype.forEach.call(row1.children, function (b) { b.classList.toggle("on", !dueOnly && !wrongOnly && b.dataset.v === curCh); });
      Array.prototype.forEach.call(row2.children, function (b) { b.classList.toggle("on", !dueOnly && !wrongOnly && b.dataset.v === curTag); });
      Array.prototype.forEach.call(row3.children, function (b) { b.classList.toggle("on", b.dataset.v === mode); });
    }
    function build() {
      deck = cards.filter(function (c) {
        if (dueOnly) { var s = srsGet(c.id); if (!s || s.due > Date.now()) return false; }
        if (wrongOnly) { var a = fcAnsGet(c.id); if (!a || a.lastOk) return false; }
        return (curCh === "all" || c.ch === curCh) && (curTag === "all" || c.tag === curTag) &&
          (curMod === "all" || String(c.mod) === String(curMod));
      });
      for (var i = deck.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
      pos = 0; renderProgress(); show();
    }
    function rateRow(c) {
      var r = el("div", "fc-rate"); r.style.display = "none";
      [["不会", 0], ["模糊", 1], ["会", 2]].forEach(function (o, i) {
        var b = el("button", o[2], o[0]);
        b.onclick = function () {
          srsRate(c.id, o[1]);
          if (c.subjective) { var o2 = fcAnsAll(); if (o2[c.id]) { o2[c.id].lastOk = (o[1] >= 2); jset(PREFIX + "fcans", o2); } }
          renderProgress(); renderRecords(); pos++; show();
        };
        r.appendChild(b);
      });
      return r;
    }
    function show() {
      if (!deck.length) { host.innerHTML = '<p class="empty">没有符合条件的卡片。</p>'; return; }
      if (pos >= deck.length) {
        host.innerHTML = '<div class="fc-done">🎉 本组完成（共 ' + deck.length + ' 张）<div style="margin-top:10px"><button class="navbtn" style="width:auto" id="fcAgain">再来一组</button></div></div>';
        var b = document.getElementById("fcAgain"); if (b) b.onclick = build; return;
      }
      var c = deck[pos];
      var rec = fcAnsGet(c.id);
      var recLine = rec ? '<div class="fc-rec">📝 已答 ' + rec.n + " 次 · 正确 " + rec.okN + " 次" +
        (rec.last ? " ｜ 上次：" + esc(String(rec.last).slice(0, 24)) + (rec.lastOk ? " ✓" : " ✗") : "") + "</div>" : "";
      var head = '<div class="fc-progress">第 ' + (pos + 1) + " / " + deck.length + " 张 · " + esc(c.tag) + " · " + mode + "</div>" + recLine;
      if (mode === "背") {
        host.innerHTML = head + '<div class="fc-card" id="fcCard"><div class="fc-front">' + esc(c.front) + '</div>' +
          '<div class="fc-back" style="display:none">' + c.back + "</div></div>" +
          '<div class="fc-hint">点击卡片翻面</div>';
        var card = document.getElementById("fcCard");
        var rr = rateRow(c); host.appendChild(rr);
        card.onclick = function () {
          card.querySelector(".fc-back").style.display = "block";
          card.querySelector(".fc-front").style.display = "none";
          rr.style.display = "flex";
        };
      } else if (mode === "写") {
        if (c.subjective) {
          host.innerHTML = head + '<div class="fc-card"><div class="fc-front">' + esc(c.front) + '</div></div>' +
            '<div class="fc-input"><textarea class="fc-ta" placeholder="先自己写下答题要点（可选，自动保存）…"></textarea></div>' +
            '<div class="fc-input"><button class="fc-check">显示参考答案</button></div>' +
            '<div class="fc-back" style="display:none">' + c.back + "</div>";
          var rrS = rateRow(c); host.appendChild(rrS);
          var ta = host.querySelector(".fc-ta"), bkS = host.querySelector(".fc-back");
          var rec0 = fcAnsGet(c.id); if (rec0 && rec0.last) ta.value = rec0.last;
          host.querySelector(".fc-check").onclick = function () {
            fcAnsSave(c.id, "写", ta.value, null); renderRecords();
            bkS.style.display = "block"; rrS.style.display = "flex";
          };
        } else {
          host.innerHTML = head + '<div class="fc-card"><div class="fc-front">' + esc(c.front) + '</div></div>' +
            '<div class="fc-input"><input class="fc-ans" placeholder="输入你的答案…"><button class="fc-check">检查</button></div>' +
            '<div class="fc-back" style="display:none">' + c.back + "</div>";
          var rr2 = rateRow(c); host.appendChild(rr2);
          var inp = host.querySelector(".fc-ans"), bk = host.querySelector(".fc-back");
          var doCheck = function () {
            var ok = fuzzyMatch(c.plain || "", inp.value);
            inp.classList.remove("right", "wrong"); inp.classList.add(ok ? "right" : "wrong");
            fcAnsSave(c.id, "写", inp.value, ok); renderRecords();
            bk.style.display = "block"; rr2.style.display = "flex";
          };
          host.querySelector(".fc-check").onclick = doCheck;
          inp.addEventListener("keydown", function (e) { if (e.key === "Enter") doCheck(); });
        }
      } else {
        if (c.subjective) { mode = "写"; sync(); show(); return; }
        var cloze = c.plain || "", blank = c.blank || "", blank2 = c.blank2 || "", cardInner, answers = [];
        if (blank && cloze.indexOf(blank) >= 0) {
          if (blank2 && blank2 !== blank && cloze.indexOf(blank2) >= 0) {
            cardInner = '<div class="fc-front">' + esc(c.front) + '</div><div class="fc-cloze">' +
              esc(cloze.replace(blank, "①______").replace(blank2, "②______")) + "</div>";
            answers = [blank, blank2];
          } else {
            cardInner = '<div class="fc-front">' + esc(c.front) + '</div><div class="fc-cloze">' + esc(cloze.replace(blank, "______")) + "</div>";
            answers = [blank];
          }
        } else if ((c.tag === "名词解释" || c.tag === "术语") && c.front && c.plain) {
          cardInner = '<div class="fc-front">' + esc(c.plain) + "</div>";
          answers = [c.front];
        } else { mode = "写"; sync(); show(); return; }
        var inputsHtml = answers.map(function (a, i) {
          var lbl = answers.length > 1 ? ("①②③".charAt(i) + " ") : "";
          return '<input class="fc-ans" placeholder="' + lbl + "填 " + a.length + ' 字">';
        }).join("");
        host.innerHTML = head + '<div class="fc-card">' + cardInner + "</div>" +
          '<div class="fc-input">' + inputsHtml + '<button class="fc-check">检查</button></div>' +
          '<div class="fc-back" style="display:none">' + c.back + "</div>";
        var rr3 = rateRow(c); host.appendChild(rr3);
        var inps = host.querySelectorAll(".fc-ans"), bk3 = host.querySelector(".fc-back");
        var doCheck3 = function () {
          var allOk = true, joined = [];
          Array.prototype.forEach.call(inps, function (inp, i) {
            var ok = fuzzyMatch(answers[i], inp.value);
            inp.classList.remove("right", "wrong"); inp.classList.add(ok ? "right" : "wrong");
            joined.push(inp.value); if (!ok) allOk = false;
          });
          fcAnsSave(c.id, "填空", joined.join(" / "), allOk); renderRecords();
          bk3.style.display = "block"; rr3.style.display = "flex";
        };
        host.querySelector(".fc-check").onclick = doCheck3;
        Array.prototype.forEach.call(inps, function (inp) { inp.addEventListener("keydown", function (e) { if (e.key === "Enter") doCheck3(); }); });
      }
    }
    var recEl = document.getElementById("fcrec");
    function renderRecords() {
      if (!recEl) return;
      var ans = fcAnsAll();
      var answered = cards.filter(function (c) { return ans[c.id]; });
      if (!answered.length) {
        recEl.innerHTML = '<div class="fc-recb"><div class="fc-cathead">📊 作答记录</div>' +
          '<div class="fc-recsum">还没有作答记录。做几道「填空 / 写」后，这里会显示正确率与错卡。</div></div>';
        return;
      }
      var okN = answered.filter(function (c) { return ans[c.id].lastOk === true; }).length;
      var wrongCards = answered.filter(function (c) { return ans[c.id].lastOk === false; });
      var byCh = {};
      answered.forEach(function (c) { var a = ans[c.id]; var t = byCh[c.ch] = byCh[c.ch] || { n: 0, ok: 0 }; t.n++; if (a.lastOk) t.ok++; });
      var h = '<div class="fc-recb"><div class="fc-cathead">📊 作答记录</div>' +
        '<div class="fc-recsum">已答 <b>' + answered.length + "</b> 张 · 正确 <b>" + okN + "</b> · 错 <b>" + wrongCards.length +
        "</b>（正确率 " + Math.round(okN * 100 / answered.length) + "%）</div>" +
        '<div class="fc-recsum">' + Object.keys(byCh).sort().map(function (cid) { var t = byCh[cid]; return esc(names[cid] || cid) + " " + t.ok + "/" + t.n; }).join(" ｜ ") + "</div>";
      if (wrongCards.length) {
        h += '<details class="fc-cat"><summary>错卡 ' + wrongCards.length + ' 张（点上方「重练错卡」专练）</summary><ul class="fc-wlist">' +
          wrongCards.slice(0, 60).map(function (c) { return "<li>" + esc(c.front) + ' <span class="fc-recans">你答：' + esc(String(ans[c.id].last).slice(0, 20)) + "</span></li>"; }).join("") +
          "</ul></details>";
      }
      h += "</div>";
      recEl.innerHTML = h;
    }
    renderRecords();
    sync(); build();
  }

  /* ================= mock exam ================= */
  function renderExam() {
    var ctl = document.getElementById("examctl"), host = document.getElementById("examhost");
    var timerEl = document.getElementById("examtimer");
    if (!ctl || !host) return;
    var names = chNames();
    var types = [["mcq", "选择题"], ["judge", "判断题"], ["fill", "填空题"], ["short", "简答题"], ["calc", "论述/推导"], ["term", "名词解释"]];
    var pool = [];
    (window.MANIFEST || []).forEach(function (m) {
      var ch = window.CHAPTERS[m.id]; if (!ch) return;
      types.forEach(function (t) { (ch[t[0]] || []).forEach(function (q) { pool.push({ cid: m.id, kind: t[0], q: q }); }); });
    });
    ctl.innerHTML =
      '<div class="ex-row"><b>章节：</b>' + (window.MANIFEST || []).map(function (m) {
        return '<label class="ex-lb"><input type="checkbox" class="ex-ch" value="' + m.id + '" checked> ' + esc(names[m.id] || m.id) + "</label>";
      }).join("") + "</div>" +
      '<div class="ex-row"><b>题型：</b>' + types.map(function (t) {
        return '<label class="ex-lb"><input type="checkbox" class="ex-ty" value="' + t[0] + '" checked> ' + t[1] + "</label>";
      }).join("") + "</div>" +
      '<div class="ex-row"><b>题量：</b><select id="exCount"><option>10</option><option selected>20</option><option>30</option><option>50</option></select>' +
      '<b>时间：</b><select id="exMin"><option value="15">15 分钟</option><option value="30" selected>30 分钟</option><option value="60">60 分钟</option><option value="120">120 分钟</option></select>' +
      '<button id="exFull" class="navbtn" style="width:auto;margin:0;background:#c0392b;border-color:#c0392b">📄 802 整套模拟</button>' +
      '<button id="exStart" class="navbtn" style="width:auto;margin:0">开始测验</button></div>';
    var timer = null, remain = 0, current = [];
    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
    function fmt(s) { var m = Math.floor(s / 60), x = s % 60; return (m < 10 ? "0" : "") + m + ":" + (x < 10 ? "0" : "") + x; }
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function start(plan) {
      var chs = Array.prototype.map.call(ctl.querySelectorAll(".ex-ch:checked"), function (x) { return x.value; });
      var tys = Array.prototype.map.call(ctl.querySelectorAll(".ex-ty:checked"), function (x) { return x.value; });
      if (!plan && (!chs.length || !tys.length)) { alert("请至少选择一个章节和一个题型。"); return; }
      var n = parseInt(document.getElementById("exCount").value, 10);
      var mins = parseInt(document.getElementById("exMin").value, 10);
      var cand = pool.filter(function (it) {
        return (plan || chs.indexOf(it.cid) >= 0) && (plan || tys.indexOf(it.kind) >= 0);
      });
      if (plan) {
        mins = plan.minutes || mins; current = [];
        Object.keys(plan.counts).forEach(function (k) {
          current = current.concat(shuffle(cand.filter(function (it) { return it.kind === k; })).slice(0, plan.counts[k]));
        });
      } else {
        shuffle(cand); current = cand.slice(0, n);
      }
      host.innerHTML = "";
      current.forEach(function (it, i) {
        var wrap = el("div", "ex-item");
        wrap.appendChild(el("div", "ex-num", "第 " + (i + 1) + " 题 · " + esc(names[it.cid] || it.cid)));
        var c;
        if (it.kind === "mcq") c = renderMCQ(it.cid, it.q, i + 1);
        else if (it.kind === "judge") c = renderJudge(it.cid, it.q, i + 1);
        else if (it.kind === "fill") c = renderFill(it.cid, it.q, i + 1);
        else c = renderSelf(it.cid, it.q, i + 1, it.kind);
        wrap.appendChild(c); host.appendChild(wrap);
      });
      remain = mins * 60;
      if (timerEl) { timerEl.style.display = "block"; timerEl.textContent = "⏱ 剩余 " + fmt(remain); }
      stopTimer();
      timer = setInterval(function () {
        remain--; if (timerEl) timerEl.textContent = "⏱ 剩余 " + fmt(remain);
        if (remain <= 0) { stopTimer(); submit(true); }
      }, 1000);
      var bar = el("div", "ex-bar"); var bs = el("button", "navbtn", "📋 交卷判分");
      bs.onclick = function () { stopTimer(); submit(false); }; bar.appendChild(bs); host.appendChild(bar);
    }
    function isCorrect(it) {
      var cid = it.cid, q = it.q, r;
      if (it.kind === "mcq") { r = mcqStore(cid)[q.id]; return r && r.last === String(q.a); }
      if (it.kind === "judge") { r = judgeStore(cid)[q.id]; return r && r.last === String(q.a); }
      if (it.kind === "fill") { r = fillStore(cid)[q.id]; return r && fuzzyMatch(q.a, r.last); }
      r = selfStore(cid)[q.id]; return r && r.state === "ok";
    }
    function submit(auto) {
      stopTimer();
      if (timerEl) timerEl.textContent = "⏱ 已交卷";
      var ok = 0, weak = {};
      current.forEach(function (it) { if (isCorrect(it)) ok++; else if (it.q.kp) weak[it.q.kp] = 1; });
      var total = current.length || 1;
      var h = '<div class="statsbox"><h3 style="margin:0">📊 成绩</h3>' +
        "<p>得分（客观自动 + 主观自评）：<b>" + ok + " / " + current.length + "</b>（" + Math.round(ok * 100 / total) + "%）" + (auto ? " · 时间到自动交卷" : "") + "</p>" +
        (Object.keys(weak).length ? "<p>待加强知识点 " + Object.keys(weak).length + " 个，去「今日复习」巩固。</p>" : "<p>全部正确，很好！</p>") +
        '<p><a class="navbtn" style="display:inline-block;width:auto;text-decoration:none" href="review.html">🔁 去复习</a></p></div>';
      var res = el("div", "ex-result", h); host.appendChild(res);
      res.scrollIntoView({ behavior: "smooth" });
    }
    document.getElementById("exStart").onclick = function () { start(); };
    document.getElementById("exFull").onclick = function () {
      start({ minutes: 180, counts: { term: 5, fill: 10, mcq: 15, judge: 10, short: 3, calc: 2 } });
    };
  }

  /* ================= review page (spaced repetition) ================= */
  function kpIndex() {
    var kp = {}, q = {}, titles = {};
    (window.MANIFEST || []).forEach(function (m) {
      var ch = window.CHAPTERS[m.id]; if (!ch) return;
      titles[m.id] = m.title;
      ch.modules.forEach(function (mod) {
        mod.slides.forEach(function (s) { kp[m.id + "_s" + mod.i + "_" + s.i] = { cid: m.id, slide: s }; });
      });
      ["mcq", "judge", "fill", "short", "calc", "term"].forEach(function (kind) {
        (ch[kind] || []).forEach(function (x) { q[x.id] = { cid: m.id, kind: kind, q: x }; });
      });
    });
    return { kp: kp, q: q, titles: titles };
  }
  function kindName(k) { return { mcq: "选择题", judge: "判断题", fill: "填空题", short: "简答题", calc: "论述/推导", term: "名词解释" }[k] || k; }
  function answerHtml(info) {
    var q = info.q, k = info.kind, a = "";
    if (k === "mcq") {
      a = String(q.a);
      for (var i = 0; i < (q.o || []).length; i++) { if (String(q.o[i]).trim().charAt(0) === String(q.a).trim()) { a = q.o[i]; break; } }
    } else if (k === "term") a = q.def || "";
    else a = q.a != null ? q.a : "";
    var h = "<div>答案：<b>" + esc(a) + "</b></div>";
    if (q.e) h += '<div class="rev-exp">' + esc(q.e) + "</div>";
    if (q.kps) h += '<div class="rev-kps">踩分点：' + esc(q.kps) + "</div>";
    return h;
  }
  function renderReview() {
    var host = document.getElementById("reviewhost"), dueEl = document.getElementById("duecount");
    if (!host) return;
    var idx = kpIndex();
    var cmap = cardMap();
    function cardCard(id, c) {
      var box = el("div", "rev-card");
      box.innerHTML = '<div class="rev-meta">' + esc(idx.titles[c.ch] || c.ch || "") + " · " + esc(c.tag) + "</div>" +
        '<div class="rev-title">' + esc(c.front) + "</div>";
      var body = el("div", "rev-ans"); body.style.display = "none"; body.innerHTML = c.back;
      var rv = el("button", "rev-reveal", "显示答案"); rv.setAttribute("data-open", "显示答案");
      rv.onclick = toggle(rv, body);
      box.appendChild(rv); box.appendChild(body); box.appendChild(rateRow(id));
      return box;
    }
    function toggle(btn, box) {
      return function () {
        var open = box.style.display !== "none";
        box.style.display = open ? "none" : "block";
        btn.textContent = open ? btn.getAttribute("data-open") : "收起";
      };
    }
    function rateRow(id) {
      var row = el("div", "rev-rate");
      row.appendChild(el("span", "rev-ratelbl", "记住程度："));
      [["不会", 0, "no"], ["模糊", 1, "mid"], ["会", 2, "ok"]].forEach(function (o) {
        var b = el("button", o[2], o[0]);
        b.onclick = function () { srsRate(id, o[1]); render(); };
        row.appendChild(b);
      });
      return row;
    }
    function kpCard(id, info) {
      var s = info.slide, c = el("div", "rev-card");
      c.innerHTML = '<div class="rev-meta">' + esc(idx.titles[info.cid] || info.cid) + " · " + esc(s.sec || "") + "</div>" +
        '<div class="rev-title">' + esc(s.title) + "</div>" +
        '<div class="rev-hint">先在心里回忆这一页讲了什么，再展开核对。</div>';
      var body = el("div", "rev-body"); body.style.display = "none";
      body.innerHTML = '<div class="notes">' + esc(s.notes) + "</div>" +
        (s.points && s.points.length ? '<div class="points"><div class="pt-h">📌 本页要点</div><ul>' + s.points.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul></div>" : "") +
        (s.fig ? '<div class="fignote"><div class="fn-h">🔍 图注解读</div><p>' + esc(s.fig).replace(/\n/g, "<br>") + "</p></div>" : "");
      var rv = el("button", "rev-reveal", "展开讲解"); rv.setAttribute("data-open", "展开讲解");
      rv.onclick = toggle(rv, body);
      c.appendChild(rv); c.appendChild(body); c.appendChild(rateRow(id));
      return c;
    }
    function qCard(id, info) {
      var q = info.q, c = el("div", "rev-card");
      c.innerHTML = '<div class="rev-meta">' + esc(idx.titles[info.cid] || info.cid) + " · " + esc(kindName(info.kind)) + "</div>" +
        '<div class="rev-title">' + esc(q.q || q.term || "") + "</div>";
      if (info.kind === "mcq" && q.o) {
        var opts = el("div", "rev-opts");
        q.o.forEach(function (o, i) {
          var b = el("button", "rev-opt", esc(o));
          b.onclick = function () {
            var cl = function (s) { return String(s).trim().charAt(0); };
            Array.prototype.forEach.call(opts.children, function (x) { if (cl(x.textContent) === String(q.a).trim()) x.classList.add("right"); });
            if (cl(o) !== String(q.a).trim()) b.classList.add("wrong");
            ans.style.display = "block";
          };
          opts.appendChild(b);
        });
        c.appendChild(opts);
      }
      var ans = el("div", "rev-ans"); ans.style.display = "none"; ans.innerHTML = answerHtml(info);
      var rv = el("button", "rev-reveal", "显示答案"); rv.setAttribute("data-open", "显示答案");
      rv.onclick = toggle(rv, ans);
      c.appendChild(rv); c.appendChild(ans); c.appendChild(rateRow(id));
      return c;
    }
    function render() {
      var due = srsDue().filter(function (id) { return idx.kp[id] || idx.q[id] || cmap[id]; });
      var conf = Object.keys(confusedAll()).filter(function (kp) { return idx.kp[kp]; });
      var confSet = {}; conf.forEach(function (k) { confSet[k] = 1; });
      due = conf.concat(due.filter(function (id) { return !confSet[id]; }));
      if (dueEl) dueEl.textContent = due.length;
      host.innerHTML = "";
      if (!due.length) {
        host.innerHTML = '<p class="empty">今天没有待复习的内容。去各章学习，标记已读、做题或翻卡片后会自动安排复习。</p>';
        return;
      }
      due.forEach(function (id) {
        host.appendChild(idx.kp[id] ? kpCard(id, idx.kp[id]) : idx.q[id] ? qCard(id, idx.q[id]) : cardCard(id, cmap[id]));
      });
    }
    render();
  }

  function renderDashboard() {
    var host = document.getElementById("dashbody"); if (!host) return;
    var due = srsDue().length, task = taskState(), streak = streakCount();
    var confN = Object.keys(confusedAll()).length;
    var fcDue = buildCards().filter(function (c) { var s = srsGet(c.id); return s && s.due <= Date.now(); }).length;
    var total = 0, mastered = 0;
    (window.MANIFEST || []).forEach(function (m) {
      var ch = window.CHAPTERS[m.id]; if (!ch) return;
      ch.modules.forEach(function (mod) {
        mod.slides.forEach(function (s) {
          total++;
          if (kpMastery(m.id + "_s" + mod.i + "_" + s.i) >= 0.6) mastered++;
        });
      });
    });
    host.innerHTML = '<div class="dash">' +
      '<div class="dcell"><a href="review.html"><b>' + due + '</b><span>待复习</span></a></div>' +
      '<div class="dcell"><a href="flashcards.html?due=1"><b>' + fcDue + '</b><span>闪卡到期</span></a></div>' +
      '<div class="dcell"><a href="flashcards.html"><b>' + streak + '</b><span>连续打卡（天）</span></a></div>' +
      '<div class="dcell"><b>' + (task.read || 0) + '</b><span>今日已读</span></div>' +
      '<div class="dcell"><b>' + (task.practice || 0) + '</b><span>今日练习</span></div>' +
      '<div class="dcell"><a href="review.html"><b>' + confN + '</b><span>待问/不懂</span></a></div>' +
      '<div class="dcell"><b>' + mastered + "/" + total + '</b><span>已掌握知识点</span></div>' +
      '</div>';
  }

  /* ---------- 学习计划 / 提醒 ---------- */
  function planGet() { return jget(PREFIX + "plan", { exam: "2027-12-20", read: 3, cards: 30, qs: 10 }); }
  function renderPlan() {
    var host = document.getElementById("planbody"); if (!host) return;
    var p = planGet(), task = taskState();
    var days = Math.max(0, Math.ceil((new Date(p.exam + "T00:00:00") - new Date()) / 86400000));
    host.innerHTML =
      '<div class="planrow">考试日期 <input type="date" id="planExam" value="' + p.exam + '"> ' +
      '<span class="hint">距考试 <b>' + days + '</b> 天</span></div>' +
      '<div class="planrow">每日目标：读 <input type="number" id="planRead" min="0" value="' + p.read + '" class="pnum"> 页 · ' +
      '卡片 <input type="number" id="planCards" min="0" value="' + p.cards + '" class="pnum"> 张 · ' +
      '题 <input type="number" id="planQs" min="0" value="' + p.qs + '" class="pnum"> 道</div>' +
      '<div class="planrow hint">今日进度：已读 <b>' + (task.read || 0) + "/" + p.read + '</b> · 练习 <b>' + (task.practice || 0) + "</b> · 复习 <b>" + (task.review || 0) + "</b></div>" +
      '<div class="planrow"><button class="navbtn" style="width:auto;margin:0" id="planRemind">🔔 每日提醒</button> <span id="planRemindMsg" class="hint"></span></div>';
    function save() {
      var q = planGet();
      q.exam = document.getElementById("planExam").value || q.exam;
      q.read = +document.getElementById("planRead").value || 0;
      q.cards = +document.getElementById("planCards").value || 0;
      q.qs = +document.getElementById("planQs").value || 0;
      jset(PREFIX + "plan", q); renderPlan();
    }
    ["planExam", "planRead", "planCards", "planQs"].forEach(function (id) { document.getElementById(id).onchange = save; });
    document.getElementById("planRemind").onclick = setupReminder;
    var rm = jget(PREFIX + "remind", null);
    if (rm && rm.on) document.getElementById("planRemindMsg").textContent = "已开启：" + rm.time + "（页面打开时提醒）";
  }
  function setupReminder() {
    var msg = document.getElementById("planRemindMsg");
    if (!("Notification" in window)) { msg.textContent = "此浏览器不支持通知"; return; }
    Notification.requestPermission().then(function (perm) {
      if (perm === "granted") {
        var t = window.prompt("每天几点提醒？（24 小时制，如 20:00）", "20:00") || "20:00";
        jset(PREFIX + "remind", { on: true, time: t, last: "" });
        msg.textContent = "已开启：" + t + "（需保持页面打开）";
      } else { msg.textContent = "未授权通知"; }
    });
  }
  function maybeRemind() {
    var rm = jget(PREFIX + "remind", null);
    if (!rm || !rm.on || !("Notification" in window) || Notification.permission !== "granted") return;
    var now = new Date(), hm = ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2), today = todayStr();
    if (hm >= rm.time && rm.last !== today) {
      rm.last = today; jset(PREFIX + "remind", rm);
      try { new Notification("分子生物学 · 今日复习", { body: "该复习啦：打开网站完成今日任务。" }); } catch (e) { }
    }
  }

  /* ================= 历年真题页 ================= */
  function renderZhenti() {
    var ctl = document.getElementById("ztctl"), host = document.getElementById("zthost"), cnt = document.getElementById("ztcount");
    if (!host) return;
    var Z = window.ZHENTI || {};
    var names = chNames();
    var covered = { ch01: 1, ch02: 1, ch03: 1, ch04: 1, ch05: 1, ch07: 1, ch08: 1, ch11: 1 };
    var cur = "all", q = "";
    ctl.innerHTML = '<div class="fc-chips" id="ztchips"></div><input id="ztsearch" class="ans" placeholder="搜索题干 / 答案…" style="margin-top:6px">' +
      '<button class="navbtn" style="width:auto;margin-top:8px" id="ztQuiz">🎯 真题自测（随机 20 题）</button>';
    var chips = document.getElementById("ztchips");
    function chip(label, val) {
      var b = el("button", "fc-chip" + (val === cur ? " on" : ""), label); b.dataset.v = val;
      b.onclick = function () { cur = val; syncChips(); render(); };
      chips.appendChild(b);
    }
    chip("全部（17章）", "all"); chip("只看已讲章节", "covered");
    Object.keys(Z).sort().forEach(function (cid) { chip(esc(names[cid] || cid), cid); });
    function syncChips() { Array.prototype.forEach.call(chips.children, function (b) { b.classList.toggle("on", b.dataset.v === cur); }); }
    var search = document.getElementById("ztsearch");
    search.oninput = function () { q = (search.value || "").trim().toLowerCase(); render(); };
    function render() {
      var html = "", total = 0;
      Object.keys(Z).sort().forEach(function (cid) {
        if (cur === "covered") { if (!covered[cid]) return; }
        else if (cur !== "all" && cid !== cur) return;
        var arr = Z[cid].filter(function (x) { return !q || (x.q + " " + x.a).toLowerCase().indexOf(q) >= 0; });
        if (!arr.length) return;
        html += "<h2>" + esc(names[cid] || cid) + "（" + arr.length + "）</h2>";
        arr.forEach(function (x, i) {
          total++;
          html += '<div class="zt"><div class="zt-q"><b>' + (i + 1) + ".</b> " + esc(x.q) + "</div>" +
            (x.src ? '<div class="zt-src">📌 ' + esc(x.src) + "</div>" : "") +
            (x.a ? '<details class="sol"><summary>答案</summary><div class="ansbox">' + esc(x.a) + "</div></details>" : "") +
            "</div>";
        });
      });
      host.innerHTML = html || '<p class="empty">没有匹配的真题。</p>';
      if (cnt) cnt.textContent = total;
    }
    function startQuiz() {
      var pool = [];
      Object.keys(Z).forEach(function (cid) {
        if (cur === "covered" && !covered[cid]) return;
        if (cur !== "all" && cur !== "covered" && cid !== cur) return;
        Z[cid].forEach(function (x) { if (x.q) pool.push({ cid: cid, x: x }); });
      });
      for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
      pool = pool.slice(0, 20);
      var pos = 0, okN = 0;
      function draw() {
        if (!pool.length) { host.innerHTML = '<p class="empty">该范围没有真题。</p>'; return; }
        if (pos >= pool.length) {
          host.innerHTML = '<div class="statsbox"><h3 style="margin:0">🎯 真题自测完成</h3><p>共 ' + pool.length + " 题，自评掌握 <b>" + okN + "</b> 题。</p>" +
            '<button class="navbtn" style="width:auto" id="ztBack">返回真题列表</button></div>';
          document.getElementById("ztBack").onclick = function () { render(); };
          return;
        }
        var it = pool[pos];
        host.innerHTML = '<div class="fc-progress">第 ' + (pos + 1) + " / " + pool.length + " 题 · " + esc(names[it.cid] || it.cid) + "</div>" +
          '<div class="zt"><div class="zt-q">' + esc(it.x.q) + "</div>" +
          (it.x.src ? '<div class="zt-src">📌 ' + esc(it.x.src) + "</div>" : "") +
          '<div class="zt-a" style="display:none;margin-top:6px"><b>答案：</b>' + esc(it.x.a || "（原书未给出，见教材）") + "</div>" +
          '<div style="margin-top:8px"><button class="fc-check" id="ztReveal">显示答案</button></div>' +
          '<div class="fc-rate" style="display:none;margin-top:8px"><button class="no">不会</button><button class="mid">模糊</button><button class="ok">会</button></div></div>';
        document.getElementById("ztReveal").onclick = function () {
          host.querySelector(".zt-a").style.display = "block";
          host.querySelector(".fc-rate").style.display = "flex";
          this.style.display = "none";
        };
        var rate = host.querySelector(".fc-rate");
        [["不会", 0], ["模糊", 1], ["会", 2]].forEach(function (o, i) {
          rate.children[i].onclick = function () { if (o[1] >= 2) okN++; pos++; draw(); };
        });
      }
      draw();
    }
    document.getElementById("ztQuiz").onclick = startQuiz;
    render();
  }

  /* ================= textbook cross-reference page ================= */
  function renderTextbook() {
    var host = document.getElementById("tbhost"); if (!host) return;
    var T = window.TEXTBOOK; if (!T) { host.innerHTML = '<p class="empty">数据未加载。</p>'; return; }
    var html = '<p class="hint">' + esc(T.source) + " ｜ " + esc(T.note) + "</p>" +
      '<p class="hint">📌 老师第一批 5 个课件共涉及教材第 <b>1、2、3、4、5、7、8、11</b> 章（不含第 6 章）；除第 4、5 章较完整外，其余多为「部分」。</p>';
    (T.chapters || []).forEach(function (ch) {
      html += '<div class="tb-chapter"><h3>' + esc(ch.title) + "</h3>" +
        '<table class="tbl"><thead><tr><th>教材章节（第4版）</th><th>本站模块</th><th>页号</th><th>覆盖</th><th></th></tr></thead><tbody>';
      (ch.maps || []).forEach(function (m) {
        var anchor = "s_" + ch.web + "_s" + m.mod + "_0";
        var cov = m.cover === "全" ? "全" : "部分";
        html += "<tr><td>" + esc(m.tb) + "</td><td>" + esc(m.modName || ("模块" + m.mod)) + "</td><td>" + esc(m.pages) + "</td><td>" + esc(cov) + "</td>" +
          '<td><a href="' + ch.web + '.html#' + anchor + '">去学习 →</a></td></tr>';
      });
      html += "</tbody></table>";
      if (ch.gaps && ch.gaps.length) {
        html += '<div class="tb-gaps">⚠️ 教材未讲（需自己看书补）：<ul>' +
          ch.gaps.map(function (g) { return "<li>" + esc(g) + "</li>"; }).join("") + "</ul></div>";
      }
      html += "</div>";
    });
    host.innerHTML = html;
  }

  /* ================= glossary page ================= */
  function renderGlossary() {
    var data = window.GLOSSARY || [];
    var host = document.getElementById("glist");
    var chips = document.getElementById("gchips");
    var search = document.getElementById("gsearch");
    var cnt = document.getElementById("gcount");
    if (!host) return;
    if (cnt) cnt.textContent = data.length;
    var names = chNames();
    var cur = "all";
    var chs = {}; data.forEach(function (g) { if (g.ch) chs[g.ch] = 1; });
    var bAll = el("button", "on", "全部"); bAll.dataset.ch = "all";
    bAll.onclick = function () { cur = "all"; syncChips(); render(); }; chips.appendChild(bAll);
    Object.keys(chs).sort().forEach(function (c) {
      var b = el("button", "", names[c] || c); b.dataset.ch = c;
      b.onclick = function () { cur = c; syncChips(); render(); }; chips.appendChild(b);
    });
    function syncChips() { Array.prototype.forEach.call(chips.children, function (b) { b.classList.toggle("on", (b.dataset.ch || "all") === cur); }); }
    function render() {
      var q = (search && search.value || "").trim().toLowerCase();
      var html = "";
      data.filter(function (g) {
        return (cur === "all" || g.ch === cur) && (!q || (g.t + " " + (g.en || "") + " " + g.d).toLowerCase().indexOf(q) >= 0);
      }).forEach(function (g) {
        html += '<div class="gitem"><div class="gt">' + esc(g.t) +
          (g.en ? ' <span class="gen">' + esc(g.en) + "</span>" : "") +
          '<span class="gch">' + esc(names[g.ch] || g.ch || "") + "</span></div>" +
          '<div class="gd">' + esc(g.d) + "</div></div>";
      });
      host.innerHTML = html || '<p class="empty">没有匹配的术语。</p>';
    }
    if (search) search.oninput = render;
    render();
  }

  /* ================= index page ================= */
  function renderIndex() {
    var list = document.getElementById("list");
    var M = window.MANIFEST || [];
    M.forEach(function (m) {
      var c = el("div", "card");
      var s = chapterStats(m.id, window.CHAPTERS[m.id] || { modules: [] });
      c.innerHTML =
        '<div class="row"><h2>' + esc(m.title) + '</h2><span class="badge">' + m.n_slides + " 页 · " + m.n_q + " 题</span></div>" +
        '<p class="topics">' + esc(m.sub2) + "</p>" +
        '<div class="prog"><i style="width:' + (s.slides ? Math.round(s.seen * 100 / s.slides) : 0) + '%"></i></div>' +
        '<p class="topics">概念已读 ' + s.seen + "/" + s.slides + " ｜ 正确率 " + (s.rate == null ? "—" : s.rate + "%") + " ｜ 错题 " + s.wrong + " 题</p>";
      var a = el("a", "go", "开始学习 →"); a.href = m.id + ".html"; c.appendChild(a);
      list.appendChild(c);
    });
    renderOverview();
    renderDashboard();
    renderPlan();
    var bAll = document.getElementById("backupAll"), rAll = document.getElementById("restoreAll"), fAll = document.getElementById("fileAll");
    if (bAll) bAll.onclick = backupAll;
    var bExp = document.getElementById("exportAll");
    if (bExp) bExp.onclick = exportAllPDF;
    if (rAll && fAll) { rAll.onclick = function () { fAll.click(); }; fAll.onchange = function () { if (fAll.files[0]) restoreAll(fAll.files[0]); }; }
  }

  function renderOverview() {
    var host = document.getElementById("overview"); if (!host) return;
    var M = window.MANIFEST || [];
    var rows = "", tW = 0, tOK = 0, tMiss = 0, any = false;
    M.forEach(function (m) {
      var ch = window.CHAPTERS[m.id];
      var s = chapterStats(m.id, ch || { modules: [] });
      if (s.seen || s.ok || s.miss || s.wrong) any = true;
      tW += s.wrong; tOK += s.ok; tMiss += s.miss;
      rows += "<tr><td>" + esc(m.title) + "</td><td>" + s.seen + "/" + s.slides + "</td><td>" +
        (s.rate == null ? "—" : s.rate + "%") + "</td><td>" + s.wrong + "</td></tr>";
    });
    if (!any) { host.innerHTML = '<p class="empty">本设备还没有学习记录。打开任意一章开始学习，记录只存在这台设备。</p>'; return; }
    host.innerHTML = '<table class="tbl"><thead><tr><th>章节</th><th>概念已读</th><th>正确率</th><th>错题</th></tr></thead><tbody>' +
      rows + '<tr style="font-weight:700"><td>合计</td><td>—</td><td>' + ((tOK + tMiss) ? Math.round(tOK * 100 / (tOK + tMiss)) + "%" : "—") + "</td><td>" + tW + "</td></tr></tbody></table>";
  }

  function backupAll() {
    var out = {};
    (window.MANIFEST || []).forEach(function (m) {
      ["mcq", "judge", "fill", "self", "seen", "text", "wrong", "hw", "last"].forEach(function (k) {
        var v = jget(skey(m.id, k), null); if (v != null) out[skey(m.id, k)] = v;
      });
    });
    var blob = new Blob([JSON.stringify({ v: 1, all: true, data: out }, null, 1)], { type: "application/json" });
    var a = el("a"); a.href = URL.createObjectURL(blob); a.download = "molbio-backup-all.json"; a.click();
  }
  function restoreAll(file) {
    var r = new FileReader();
    r.onload = function () {
      try { var obj = JSON.parse(r.result); var d = obj.data || obj;
        Object.keys(d).forEach(function (k) { if (k.indexOf(PREFIX) === 0) jset(k, d[k]); });
        alert("恢复成功，页面将刷新。"); location.reload();
      } catch (e) { alert("文件解析失败：" + e.message); }
    };
    r.readAsText(file);
  }

  /* ================= global wrong page ================= */
  function renderWrongPage() {
    var host = document.getElementById("wronghost");
    var M = window.MANIFEST || [];
    var total = 0;
    M.forEach(function (m) {
      var ch = window.CHAPTERS[m.id]; if (!ch) return;
      var list = wrongList(m.id);
      if (!list.length) return;
      total += list.length;
      var sec = el("section");
      sec.appendChild(el("h2", "", esc(m.title) + "（" + list.length + "）"));
      var qmap = {}; ch.mcq.forEach(function (q) { qmap[q.id] = q; });
      list.slice().reverse().forEach(function (e) {
        var item = el("div", "wb-entry");
        var q = qmap[e.id];
        item.innerHTML = '<div class="wq">' + esc(e.q) + '<span class="pill">' + esc(e.type) + "</span>" +
          (e.cause ? '<span class="cause-tag">' + esc((CAUSES.filter(function (c) { return c[0] === e.cause; })[0] || ["", "其他"])[1]) + "</span>" : "") + "</div>" +
          (q ? '<div style="margin-top:4px">选项：' + q.o.map(esc).join("　") + "</div>" : "") +
          '<div class="wa">正确答案：<b>' + esc(e.correct) + "</b></div>" +
          (e.chosen ? '<div class="wa">你的作答：' + esc(e.chosen) + "</div>" : "");
        var act = el("div", "act"); var b = el("button", "", "标记已掌握");
        b.onclick = function () { clearWrong(m.id, e.id); item.remove(); };
        act.appendChild(b); item.appendChild(act); sec.appendChild(item);
      });
      host.appendChild(sec);
    });
    if (!total) host.innerHTML = '<p class="empty">还没有错题记录。去各章练习，答错的题会自动进入这里。</p>';
  }

  /* ---------- 动画自适应高度（消除内层滚动） ---------- */
  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || !d.__animResize || typeof d.h !== "number") return;
    var frames = document.querySelectorAll("iframe.animframe");
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === ev.source) {
        frames[i].style.height = Math.max(140, Math.ceil(d.h)) + "px";
        break;
      }
    }
  });

  /* ================= boot ================= */
  document.addEventListener("DOMContentLoaded", function () {
    if ("serviceWorker" in navigator) { try { navigator.serviceWorker.register("sw.js").catch(function () { }); } catch (e) { } }
    maybeRemind(); setInterval(maybeRemind, 60000);
    var page = document.body.dataset.page;
    if (page === "chapter") renderChapter(document.body.dataset.ch);
    else if (page === "index") renderIndex();
    else if (page === "wrong") renderWrongPage();
    else if (page === "glossary") renderGlossary();
    else if (page === "review") renderReview();
    else if (page === "flashcards") renderFlashcards();
    else if (page === "exam") renderExam();
    else if (page === "textbook") renderTextbook();
    else if (page === "zhenti") renderZhenti();
  });

  window.CELL = {
    backupAll: backupAll, restoreAll: restoreAll, exportChapterPDF: exportChapterPDF,
    exportAllPDF: exportAllPDF, buildChapterDoc: buildChapterDoc,
    srsRate: srsRate, srsDue: srsDue, srsCount: srsCount, srsGet: srsGet,
    kpRecord: kpRecord, kpMastery: kpMastery, streakCount: streakCount, taskState: taskState
  };
})();
