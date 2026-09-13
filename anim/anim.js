/* 共享动画框架：AnimKit.mount(cfg)
   cfg = {
     title, sub, legend:[{c,t}],
     phases:[{name, note, dur, ap(S)}],   // ap: 进入该阶段时设置状态
     init(S),                             // 初始化状态
     update(S, ease),                     // 每帧缓动（可选）
     draw(ctx, W, H, S, frame),           // 绘制
     step(S, dtms),                       // 每帧按时间推进（可选）
     onLoop(S)                            // 循环回到阶段0时（可选）
   }
*/
window.AnimKit = (function () {
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function arrow(ctx, x1, y1, x2, y2, color, w) {
    color = color || '#8aa0b8'; w = w || 2;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    var a = Math.atan2(y2 - y1, x2 - x1), s = 8;
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - s * Math.cos(a - 0.4), y2 - s * Math.sin(a - 0.4));
    ctx.lineTo(x2 - s * Math.cos(a + 0.4), y2 - s * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill();
  }
  function label(ctx, txt, x, y, color, font, align) {
    ctx.fillStyle = color || '#33465c'; ctx.font = font || '13px "Microsoft YaHei"';
    ctx.textAlign = align || 'center'; ctx.fillText(txt, x, y); ctx.textAlign = 'left';
  }
  function circle(ctx, x, y, r, color, txt, labelColor) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = color; ctx.fill();
    if (txt) { ctx.fillStyle = labelColor || '#fff'; ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y + 1);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; }
  }
  function pill(ctx, x, y, w, h, color, txt, txtColor) {
    roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = color; ctx.fill();
    if (txt) { ctx.fillStyle = txtColor || '#fff'; ctx.font = 'bold 12px "Microsoft YaHei"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x + w / 2, y + h / 2 + 1);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; }
  }

  function mount(cfg) {
    var embed = /[?&]embed=1/.test(location.search);
    if (embed) document.body.classList.add('embed');
    var wrap = document.createElement('div'); wrap.className = 'a-wrap';
    var html = '<h1 class="a-title">' + cfg.title + '</h1><p class="a-sub">' + (cfg.sub || '') + '</p>' +
      '<div class="a-stage"><canvas class="a-canvas"></canvas></div>' +
      '<div class="a-bar"><button data-act="step">⏭ 单步</button>' +
      '<button class="ghost" data-act="reset">↺ 重置</button>' +
      '<button class="ghost" data-act="audio">🔊 语音：关</button>' +
      '<button class="ghost" data-act="title">🔈 本页讲解</button>' +
      '<span style="color:var(--sub);font-size:12.5px">速度</span>' +
      '<span class="a-seg" data-act="speed"><button data-s="0.5">0.5×</button><button data-s="1" class="on">1×</button><button data-s="2">2×</button></span></div>';
    if (cfg.legend) html += '<div class="a-legend">' + cfg.legend.map(function (l) {
      return '<span><span class="a-dot" style="background:' + l.c + '"></span>' + l.t + '</span>'; }).join('') + '</div>';
    html += '<div class="a-note" data-note></div>';
    wrap.innerHTML = html;
    document.body.appendChild(wrap);

    var cv = wrap.querySelector('canvas'), ctx = cv.getContext('2d');
    var W = 900, H = 520, dpr = 1;
    function resize() {
      dpr = window.devicePixelRatio || 1; var r = cv.getBoundingClientRect();
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      W = r.width; H = r.height; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize);

    var S = {}, phaseI = 0, speed = 1, fc = 0;
    var noteEl = wrap.querySelector('[data-note]');
    var dbg = document.createElement('span'); dbg.style.display = 'none'; dbg.setAttribute('data-frames', '1'); document.body.appendChild(dbg);
    var animId = location.pathname.split('/').pop().replace('.html', '');
    var audioOn = false, audioEl = null;
    function playAudio(src) { try { if (audioEl) { audioEl.pause(); audioEl = null; } audioEl = new Audio(src); audioEl.play().catch(function () { }); } catch (e) { } }
    function applyPhase(i) {
      if (cfg.phases[i].ap) cfg.phases[i].ap(S);
      if (audioOn) playAudio('audio/' + animId + '_' + i + '.mp3?v=20260911e');
      noteEl.innerHTML = '阶段：<b>' + cfg.phases[i].name + '</b>' + (cfg.phases[i].note ? ' —— ' + cfg.phases[i].note : '');
      reportH();
    }
    function reset() { S = {}; if (cfg.init) cfg.init(S); phaseI = 0; applyPhase(0); }
    var last = performance.now();
    function tick() {
      var now = performance.now(), dt = now - last; last = now; if (dt > 200) dt = 33; fc++;
      dbg.textContent = 'f=' + fc + ' p=' + phaseI;
      if (cfg.step) cfg.step(S, dt * speed);
      if (cfg.update) cfg.update(S, Math.min(1, dt * speed / 16 * 0.18));
      ctx.clearRect(0, 0, W, H);
      if (cfg.draw) cfg.draw(ctx, W, H, S, fc, phaseI);
    }
    wrap.querySelector('[data-act=step]').onclick = function () { phaseI = (phaseI + 1) % cfg.phases.length; if (phaseI === 0 && cfg.onLoop) cfg.onLoop(S); applyPhase(phaseI); };
    wrap.querySelector('[data-act=reset]').onclick = function () { reset(); };
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-act=speed] button'), function (b) {
      b.onclick = function () { speed = parseFloat(b.dataset.s);
        Array.prototype.forEach.call(wrap.querySelectorAll('[data-act=speed] button'), function (x) { x.classList.remove('on'); });
        b.classList.add('on'); };
    });
    var bAudio = wrap.querySelector('[data-act=audio]');
    bAudio.onclick = function () {
      audioOn = !audioOn;
      bAudio.textContent = audioOn ? '🔇 语音：开' : '🔊 语音：关';
      if (audioOn) playAudio('audio/' + animId + '_' + phaseI + '.mp3?v=20260911e');
    };
    wrap.querySelector('[data-act=title]').onclick = function () { playAudio('audio/' + animId + '_title.mp3?v=20260911e'); };
    function reportH() { try { parent.postMessage({ __animResize: true, h: document.body.scrollHeight }, '*'); } catch (e) { } }
    if (window.ResizeObserver) { try { new ResizeObserver(reportH).observe(document.body); } catch (e) { } }
    window.addEventListener('resize', reportH);
    window.addEventListener('load', reportH);
    setTimeout(reportH, 60); setTimeout(reportH, 500); setTimeout(reportH, 1600);
    resize(); reset(); setInterval(tick, 33);
  }
  function membrane(ctx, W, H, opt) {
    opt = opt || {};
    var yTop = opt.yTop || H * 0.40, yBot = opt.yBot || H * 0.60, cx = opt.cx || W / 2, gap = opt.gap || 150;
    var g1 = ctx.createLinearGradient(0, 0, 0, yTop); g1.addColorStop(0, '#f2f8ff'); g1.addColorStop(1, '#e8f1fb');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, yTop);
    var g2 = ctx.createLinearGradient(0, yBot, 0, H); g2.addColorStop(0, '#fff7ef'); g2.addColorStop(1, '#fdeee0');
    ctx.fillStyle = g2; ctx.fillRect(0, yBot, W, H - yBot);
    ctx.fillStyle = '#ffe9c9'; ctx.fillRect(0, yTop, W, yBot - yTop);
    for (var x = 10; x < W; x += 20) {
      if (Math.abs(x - cx) < gap / 2 + 8) continue;
      ctx.strokeStyle = '#e6c98f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, yTop + 3); ctx.lineTo(x, (yTop + yBot) / 2 - 2);
      ctx.moveTo(x, (yTop + yBot) / 2 + 2); ctx.lineTo(x, yBot - 3); ctx.stroke();
      ctx.fillStyle = '#f2b950'; ctx.beginPath(); ctx.arc(x, yTop + 4, 4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x, yBot - 4, 4, 0, 7); ctx.fill();
    }
    label(ctx, opt.outLabel || '细胞外', 14, 22, '#7a8aa0', '13px "Microsoft YaHei"', 'left');
    label(ctx, opt.inLabel || '细胞内', 14, H - 14, '#7a8aa0', '13px "Microsoft YaHei"', 'left');
    return { yTop: yTop, yBot: yBot, cx: cx, gap: gap };
  }
  function pathway(ctx, W, H, stages, active) {
    stages.forEach(function (s, i) {
      var on = i === active;
      roundRect(ctx, s.x, s.y, s.w, s.h, 10);
      ctx.fillStyle = on ? '#1f5c8b' : '#eef4fa'; ctx.fill();
      ctx.strokeStyle = on ? '#1f5c8b' : '#c6d8ea'; ctx.lineWidth = on ? 2 : 1; ctx.stroke();
      ctx.fillStyle = on ? '#fff' : '#234f7a'; ctx.font = (on ? 'bold ' : '') + '12.5px "Microsoft YaHei"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var lines = s.t.split('\n');
      lines.forEach(function (ln, k) { ctx.fillText(ln, s.x + s.w / 2, s.y + s.h / 2 + (k - (lines.length - 1) / 2) * 15); });
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      if (i < stages.length - 1) {
        var n = stages[i + 1];
        arrow(ctx, s.x + s.w + 4, s.y + s.h / 2, n.x - 6, n.y + n.h / 2, on ? '#1f5c8b' : '#c6d8ea', on ? 2.5 : 1.6);
      }
    });
  }

  return { mount: mount, roundRect: roundRect, easeOut: easeOut, lerp: lerp, arrow: arrow, label: label, circle: circle, pill: pill, membrane: membrane, pathway: pathway };
})();
