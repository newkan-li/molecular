/* 主题切换：浅色 / 护眼 / 深色，记忆在本机浏览器 */
(function () {
  var KEY = "cellbio_theme";
  var THEMES = [["light", "浅色"], ["sepia", "护眼"], ["dark", "深色"]];
  function get() { try { return localStorage.getItem(KEY) || "light"; } catch (e) { return "light"; } }
  function apply(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem(KEY, t); } catch (e) { }
    var bar = document.getElementById("themebar");
    if (bar) {
      for (var i = 0; i < bar.children.length; i++) {
        bar.children[i].classList.toggle("on", bar.children[i].getAttribute("data-t") === t);
      }
    }
  }
  // 尽早应用，避免刷新时闪白
  apply(get());
  function build() {
    if (document.getElementById("themebar")) return;
    var bar = document.createElement("div"); bar.id = "themebar";
    THEMES.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button"; b.setAttribute("data-t", o[0]); b.textContent = o[1];
      b.onclick = function () { apply(o[0]); };
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
    apply(get());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
