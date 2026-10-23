(function () {
  var V = window.MOLVIDEOS || {}, ids = Object.keys(V);
  var params = new URLSearchParams(location.search);
  var cur = params.get("ch") || ids[0] || "ch01";
  if (ids.indexOf(cur) < 0) cur = ids[0];
  var tabs = document.getElementById("vtabs"), host = document.getElementById("vhost"), note = document.getElementById("vnote");
  var player = document.getElementById("vplayer"), iframe = document.getElementById("viframe"), vtitle = document.getElementById("vtitle");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (m) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]; }); }
  function play(v) {
    player.style.display = "block";
    vtitle.textContent = v.part + " · " + v.teacher;
    iframe.src = "https://player.bilibili.com/player.html?bvid=" + encodeURIComponent(v.bvid) + "&page=" + v.page + "&high_quality=1&danmaku=0&autoplay=1";
    player.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function card(v) {
    var c = document.createElement("div"); c.className = "videocard";
    c.innerHTML = '<div class="vc-top"><span class="vteacher">' + esc(v.teacher) + '</span><span class="vdur">' + esc(v.dur) + '</span></div>' +
      '<div class="vtitle">' + esc(v.part) + '</div><div class="vcourse">' + esc(v.course) + '</div>';
    var b = document.createElement("button"); b.className = "vplay"; b.textContent = "▶ 播放"; b.onclick = function () { play(v); };
    var a = document.createElement("a"); a.className = "vlink"; a.textContent = "B站 →"; a.href = "https://www.bilibili.com/video/" + v.bvid + "/?p=" + v.page; a.target = "_blank"; a.rel = "noopener";
    var row = document.createElement("div"); row.className = "vbtns"; row.appendChild(b); row.appendChild(a); c.appendChild(row);
    return c;
  }
  function render() {
    Array.prototype.forEach.call(tabs.children, function (b) { b.className = "vtab" + (b.dataset.ch === cur ? " on" : ""); });
    history.replaceState(null, "", "?ch=" + cur);
    var o = V[cur]; if (!o) { host.innerHTML = ""; return; }
    var total = o.core.length + (o.sections || []).reduce(function (a, s) { return a + s.videos.length; }, 0);
    var extra = cur === "ch04" ? " ｜ 第4章按“实验技术”考点顺序对应方法模块" : "";
    note.innerHTML = "<b>" + esc(o.title) + "</b> ｜ 共 " + total + " 段 ｜ 站内播放或跳转 B 站 ｜ 需联网" + extra;
    var h = '<div class="vgroup"><h3>' + esc(o.title) + ' <span style="font-size:11.5px;color:var(--sub);font-weight:400">' + total + ' 段</span></h3><div class="videogrid" id="vcore"></div>';
    if (o.sections && o.sections.length) h += '<details class="vmore" open><summary>📚 按节更多分P（' + o.sections.length + ' 组）</summary><div id="vsecs"></div></details>';
    h += '</div>';
    host.innerHTML = h;
    var core = document.getElementById("vcore");
    o.core.forEach(function (v) { core.appendChild(card(v)); });
    var secs = document.getElementById("vsecs");
    if (secs) (o.sections || []).forEach(function (s) {
      var g = document.createElement("div"); g.className = "vsec";
      g.appendChild(Object.assign(document.createElement("h4"), { className: "vsec-h", textContent: s.sec }));
      var gg = document.createElement("div"); gg.className = "videogrid";
      s.videos.forEach(function (v) { gg.appendChild(card(v)); });
      g.appendChild(gg); secs.appendChild(g);
    });
  }
  ids.forEach(function (id) {
    var b = document.createElement("button"); b.className = "vtab"; b.dataset.ch = id; b.textContent = V[id].title;
    b.onclick = function () { cur = id; render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
    tabs.appendChild(b);
  });
  document.getElementById("vclose").onclick = function () { player.style.display = "none"; iframe.src = "about:blank"; };
  render();
})();
