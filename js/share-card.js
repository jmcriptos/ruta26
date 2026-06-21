/* share-card.js — genera la imagen del podio para compartir (Canvas, browser).
   Expone WC.shareCard.podiumBlob({ top3, me, teams, url }) -> Promise<Blob> (PNG).
   No lee el DOM: recibe top3 (cada fila { username, points, flag }), me ({ pos, points } | null) y url. */
(function () {
  "use strict";
  var WC = (window.WC = window.WC || {});

  var W = 1080, H = 1350;
  var INK = "#0a1512", LIME = "#d7ff43", WHITE = "#ffffff", MUTE = "#9fb0a8";
  var BLOCK = { 0: LIME, 1: "#c9ccc4", 2: "#d8a56b" }; // color por posición real (0=1º,1=2º,2=3º)
  var MEDAL = ["🥇", "🥈", "🥉"];

  function spartan(px, weight) { return (weight || 800) + " " + px + "px 'League Spartan', sans-serif"; }
  function sans(px, weight) { return (weight || 400) + " " + px + "px 'DM Sans', sans-serif"; }

  function truncate(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    var t = text;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t + "…";
  }

  function pill(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(ctx, data) {
    // fondo
    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);

    // --- header: bolita "26" + wordmark ---
    ctx.fillStyle = LIME;
    ctx.beginPath(); ctx.arc(150, 150, 60, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = spartan(48, 800); ctx.fillText("26", 150, 156);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = WHITE; ctx.font = spartan(50, 800); ctx.fillText("RUTA AL TÍTULO", 240, 142);
    ctx.fillStyle = MUTE; ctx.font = sans(30, 500); ctx.fillText("Quiniela Mundial 2026", 240, 188);

    // --- podio (centro=1º, izq=2º, der=3º) ---
    var top3 = data.top3 || [];
    var centersX = [233, 540, 847]; // columnas en pantalla
    var order = [1, 0, 2];          // qué índice de top3 va en cada columna (1º al centro)
    var heights = { 0: 330, 1: 250, 2: 200 }; // alto del bloque por posición real
    var baseline = 880;             // base inferior de los bloques
    var colW = 300;

    order.forEach(function (idx, col) {
      var r = top3[idx];
      if (!r) return;
      var cx = centersX[col];
      var h = heights[idx];
      var top = baseline - h;

      // bloque del escalón
      ctx.fillStyle = BLOCK[idx] || "#c9ccc4";
      pill(ctx, cx - colW / 2, top, colW, h, 12); ctx.fill();

      // número del puesto dentro del bloque
      ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.font = spartan(idx === 0 ? 96 : 80, 800);
      ctx.fillText(String(idx + 1), cx, top + (idx === 0 ? 112 : 96));

      // medalla
      ctx.font = "72px 'DM Sans', sans-serif";
      ctx.fillText(MEDAL[idx], cx, top - 190);
      // bandera del campeón (ya resuelta en r.flag)
      ctx.font = "80px 'DM Sans', sans-serif";
      ctx.fillText(r.flag || "🛡️", cx, top - 112);
      // nombre
      ctx.fillStyle = WHITE; ctx.font = spartan(34, 800);
      ctx.fillText(truncate(ctx, r.username || "—", colW), cx, top - 60);
      // puntos
      ctx.fillStyle = LIME; ctx.font = spartan(30, 700);
      ctx.fillText((r.points != null ? r.points : 0) + " pts", cx, top - 22);
    });

    // --- línea personal (pastilla lima tenue) ---
    if (data.me && data.me.pos != null) {
      var label = "Vas " + data.me.pos + "º con " + (data.me.points != null ? data.me.points : 0) + " pts";
      ctx.font = spartan(38, 800);
      var pw = ctx.measureText(label).width + 80;
      var px = (W - pw) / 2, py = 960, ph = 84;
      ctx.fillStyle = "rgba(215,255,67,0.14)"; pill(ctx, px, py, pw, ph, 16); ctx.fill();
      ctx.strokeStyle = "rgba(215,255,67,0.45)"; ctx.lineWidth = 2; pill(ctx, px, py, pw, ph, 16); ctx.stroke();
      ctx.fillStyle = LIME; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, W / 2, py + ph / 2 + 2);
      ctx.textBaseline = "alphabetic";
    }

    // --- footer: host limpio + CTA ---
    var host = (data.url || "")
      .replace(/^https?:\/\//, "").replace(/#.*$/, "").replace(/index\.html$/, "").replace(/\/$/, "");
    ctx.textAlign = "center";
    ctx.fillStyle = MUTE; ctx.font = sans(30, 500);
    ctx.fillText(host, W / 2, 1230);
    ctx.fillStyle = WHITE; ctx.font = spartan(34, 800);
    ctx.fillText("¡Únete a la quiniela! ⚽", W / 2, 1284);
  }

  function podiumBlob(data) {
    var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return ready.then(function () {
      var canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext("2d");
      draw(ctx, data || {});
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error("toBlob devolvió null")); }, "image/png");
      });
    });
  }

  WC.shareCard = { podiumBlob: podiumBlob };
})();
