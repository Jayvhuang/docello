/* Docello — bilingual PDF toolkit logic (client-side, no upload) */
(function () {
  "use strict";
  const { PDFDocument, degrees, rgb, StandardFonts } = (window.PDFLib || {});
  const langKey = "docello-lang", themeKey = "docello-theme";

  /* ---------- i18n ---------- */
  const I = {
    en: {
      processing: "Processing… please wait.",
      done: "Done. Your file is ready below.",
      pages: (n) => `This PDF has ${n} page${n === 1 ? "" : "s"}.`,
      locked: "This PDF is password-protected. Some tools may not work until you remove the password in your PDF reader.",
      selectFirst: "Select a file first.",
      needOrder: "Enter the new page order (e.g. 3,1,2,4).",
      needRange: "Enter page ranges (e.g. 1-3, 5).",
      invalidRange: "No valid pages found in that range.",
      merged: (n) => `Merged ${n} file${n === 1 ? "" : "s"} into one PDF.`,
      splitOne: (n) => `Extracted ${n} page${n === 1 ? "" : "s"} into a new PDF.`,
      splitZip: (n) => `Split into ${n} separate PDF files (ZIP).`,
      rotated: (n) => `Rotated ${n} page${n === 1 ? "" : "s"}.`,
      organized: (n) => `Organized into ${n} page${n === 1 ? "" : "s"}.`,
      imagesDone: (n) => `Created a PDF with ${n} image${n === 1 ? "" : "s"}.`,
      watermarked: "Added the watermark to every page.",
      numbered: (n) => `Added page numbers to ${n} page${n === 1 ? "" : "s"}.`,
      failed: (e) => "Something went wrong: " + (e && e.message ? e.message : e),
      noPdfLib: "PDF library failed to load.",
      cropped: (n) => `Cropped ${n} page${n === 1 ? "" : "s"}.`,
      download: "Download"
    },
    "zh-CN": {
      processing: "正在处理，请稍候…",
      done: "完成，文件已就绪。",
      pages: (n) => `该 PDF 共 ${n} 页。`,
      locked: "该 PDF 已加密。部分工具可能无法使用，请先在 PDF 阅读器中移除密码。",
      selectFirst: "请先选择文件。",
      needOrder: "请输入新的页面顺序（例如 3,1,2,4）。",
      needRange: "请输入页面范围（例如 1-3, 5）。",
      invalidRange: "该范围内没有有效页面。",
      merged: (n) => `已将 ${n} 个文件合并为一个 PDF。`,
      splitOne: (n) => `已将 ${n} 页提取为新 PDF。`,
      splitZip: (n) => `已拆分为 ${n} 个独立 PDF 文件（ZIP）。`,
      rotated: (n) => `已旋转 ${n} 页。`,
      organized: (n) => `已整理为 ${n} 页。`,
      imagesDone: (n) => `已生成包含 ${n} 张图片的 PDF。`,
      watermarked: "已为每页添加水印。",
      numbered: (n) => `已为 ${n} 页添加页码。`,
      failed: (e) => "出错了：" + (e && e.message ? e.message : e),
      noPdfLib: "PDF 库加载失败。",
      cropped: (n) => `已裁剪 ${n} 页。`,
      download: "下载"
    }
  };
  const urlLang = (new URLSearchParams(window.location.search).get("lang") || "").toLowerCase();
  let lang = (urlLang === "zh" || urlLang === "zh-cn") ? "zh-CN"
    : (urlLang === "en") ? "en"
      : (localStorage.getItem(langKey) || "en");
  function t(key, ...args) {
    const fn = (I[lang] && I[lang][key]) || (I.en[key]);
    return typeof fn === "function" ? fn(...args) : fn;
  }
  function applyLang(l) {
    lang = l;
    document.documentElement.lang = l === "zh-CN" ? "zh-CN" : "en";
    document.documentElement.setAttribute("data-lang", l);
    document.querySelectorAll("[data-en]").forEach((el) => {
      if (el.querySelector(":scope [data-en]")) return; // skip nested
      el.textContent = l === "zh-CN" ? (el.dataset.zh || el.dataset.en) : el.dataset.en;
    });
    const seg = document.getElementById("lang-seg");
    if (seg) seg.querySelectorAll("button").forEach((b) =>
      b.classList.toggle("active", b.dataset.langSet === l));
  }

  /* ---------- theme ---------- */
  function applyTheme(th) {
    document.documentElement.setAttribute("data-theme", th);
    localStorage.setItem(themeKey, th);
  }

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  async function fileToBytes(file) { return new Uint8Array(await file.arrayBuffer()); }
  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
  }
  function makeLink(filename, bytes, mime) {
    const blob = new Blob([bytes], { type: mime || "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.className = "download";
    a.href = url; a.download = filename;
    a.textContent = "⬇ " + t("download") + " " + filename;
    return a;
  }
  function showResult(container, { ok, message, link }) {
    container.innerHTML = "";
    const s = document.createElement("div");
    s.className = "status show " + (ok ? "ok" : "err");
    s.textContent = message;
    container.appendChild(s);
    if (ok && link) container.appendChild(link);
  }
  function setBusy(btn, on) { btn.disabled = on; btn.dataset.busy = on ? "1" : ""; }

  // page rotation-aware coordinate mapping (screen top-left, y-down -> unrotated bottom-left, y-up)
  function dispDims(page) {
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    const W = page.getWidth(), H = page.getHeight();
    return (rot % 180 === 0) ? { w: W, h: H } : { w: H, h: W };
  }
  function visualToUnrot(page, sx, sy) {
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    const W = page.getWidth(), H = page.getHeight();
    if (rot === 0) return { x: sx, y: H - sy };
    if (rot === 90) return { x: sy, y: sx };
    if (rot === 180) return { x: W - sx, y: sy };
    return { x: W - sy, y: H - sx }; // 270
  }

  async function pdfPageCount(file) {
    try {
      const doc = await PDFDocument.load(await fileToBytes(file), { ignoreEncryption: true });
      return doc.getPageCount();
    } catch (e) { return -1; }
  }

  /* ---------- tabs ---------- */
  function activateTool(name) {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tool === name));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.dataset.tool === name));
    const panel = document.getElementById("tool-" + name);
    if (panel) panel.scrollIntoView({ block: "start" });
  }

  document.addEventListener("DOMContentLoaded", () => {
    /* language + theme wiring */
    applyLang(lang);
    applyTheme(localStorage.getItem(themeKey) || "light");
    const seg = $("lang-seg");
    if (seg) seg.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-lang-set]");
      if (b) { applyLang(b.dataset.langSet); localStorage.setItem(langKey, b.dataset.langSet); }
    });
    const tt = $("theme-toggle");
    if (tt) tt.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      applyTheme(cur === "dark" ? "light" : "dark");
    });
    document.querySelectorAll(".tab").forEach((b) =>
      b.addEventListener("click", () => { activateTool(b.dataset.tool); history.replaceState(null, "", "#tool-" + b.dataset.tool); }));
    if (location.hash.startsWith("#tool-")) {
      const n = location.hash.slice("#tool-".length);
      if (document.getElementById("tool-" + n)) activateTool(n);
    }

    if (typeof PDFLib === "undefined") {
      document.querySelectorAll("[id$='-run']").forEach((b) => { b.disabled = true; });
      return;
    }

    /* drag & drop helpers */
    function wireDropzone(zone, input, onFiles) {
      input.addEventListener("change", () => { if (input.files.length) onFiles(Array.from(input.files)); input.value = ""; });
      zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
      zone.addEventListener("drop", (e) => {
        e.preventDefault(); zone.classList.remove("drag");
        if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
      });
    }

    /* ===== MERGE ===== */
    if ($("merge-run")) {
      let files = [];
      const list = $("merge-list"), count = $("merge-count"), run = $("merge-run"), res = $("merge-result");
      function render() {
        list.innerHTML = "";
        files.forEach((f, i) => {
          const li = document.createElement("li");
          li.innerHTML = `<span class="nm">${f.name}</span><span class="meta">${Math.round(f.size / 1024)} KB</span>`;
          const up = document.createElement("button"); up.className = "iconbtn"; up.textContent = "↑"; up.title = "Move up";
          up.onclick = () => { if (i > 0) { [files[i - 1], files[i]] = [files[i], files[i - 1]]; render(); } };
          const down = document.createElement("button"); down.className = "iconbtn"; down.textContent = "↓"; down.title = "Move down";
          down.onclick = () => { if (i < files.length - 1) { [files[i + 1], files[i]] = [files[i], files[i + 1]]; render(); } };
          const del = document.createElement("button"); del.className = "iconbtn"; del.textContent = "✕"; del.title = "Remove";
          del.onclick = () => { files.splice(i, 1); render(); };
          li.append(up, down, del); list.appendChild(li);
        });
        count.textContent = files.length ? (lang === "zh-CN" ? `已选择 ${files.length} 个文件。` : `${files.length} file(s) selected.`) : t("selectFirst");
        run.disabled = files.length < 1;
      }
      wireDropzone($("merge-dz"), $("merge-files"), (fs) => { files = files.concat(fs.filter(f => /pdf$/i.test(f.name) || f.type === "application/pdf")); render(); });
      run.onclick = async () => {
        if (!files.length) return;
        setBusy(run, true); showResult(res, { ok: true, message: t("processing") });
        try {
          const out = await PDFDocument.create();
          for (const f of files) {
            const src = await PDFDocument.load(await fileToBytes(f));
            const pages = await out.copyPages(src, src.getPageIndices());
            pages.forEach((p) => out.addPage(p));
          }
          const bytes = await out.save();
          showResult(res, { ok: true, message: t("merged", files.length), link: makeLink("docello-merged.pdf", bytes) });
        } catch (e) { showResult(res, { ok: false, message: t("failed", e) }); }
        finally { setBusy(run, false); }
      };
      render();
    }

    /* ===== SPLIT ===== */
    if ($("split-run")) {
      let file = null;
      const meta = $("split-meta"), run = $("split-run"), res = $("split-result");
      const mode = $("split-mode"), rangeField = $("split-range-field"), range = $("split-range");
      mode.onchange = () => rangeField.classList.toggle("hidden", mode.value !== "extract");
      function setFile(f) {
        file = f; run.disabled = !f;
        if (!f) { meta.innerHTML = ""; return; }
        pdfPageCount(f).then((n) => { meta.innerHTML = n > 0 ? `<div class="status info show">${t("pages", n)}</div>` : `<div class="status info show">${t("locked")}</div>`; });
      }
      wireDropzone($("split-file").closest(".dropzone"), $("split-file"), (fs) => setFile(fs[0]));
      run.onclick = async () => {
        if (!file) return;
        const modeVal = mode.value;
        if (modeVal === "extract" && !range.value.trim()) { showResult(res, { ok: false, message: t("needRange") }); return; }
        setBusy(run, true); showResult(res, { ok: true, message: t("processing") });
        try {
          const src = await PDFDocument.load(await fileToBytes(file));
          const total = src.getPageCount();
          if (modeVal === "all") {
            const filesObj = {};
            for (let i = 0; i < total; i++) {
              const out = await PDFDocument.create();
              const [p] = await out.copyPages(src, [i]);
              out.addPage(p);
              filesObj[`page-${String(i + 1).padStart(total.toString().length, "0")}.pdf`] = await out.save();
            }
            const zipped = fflate.zipSync(filesObj, { level: 0 });
            showResult(res, { ok: true, message: t("splitZip", total), link: makeLink("docello-split.zip", zipped, "application/zip") });
          } else {
            const idx = parseRanges(range.value, total);
            if (!idx.length) { showResult(res, { ok: false, message: t("invalidRange") }); setBusy(run, false); return; }
            const out = await PDFDocument.create();
            const pages = await out.copyPages(src, idx);
            pages.forEach((p) => out.addPage(p));
            const bytes = await out.save();
            showResult(res, { ok: true, message: t("splitOne", idx.length), link: makeLink("docello-split.pdf", bytes) });
          }
        } catch (e) { showResult(res, { ok: false, message: t("failed", e) }); }
        finally { setBusy(run, false); }
      };
    }

    /* ===== ROTATE ===== */
    if ($("rotate-run")) {
      let file = null;
      const meta = $("rotate-meta"), run = $("rotate-run"), res = $("rotate-result");
      const angle = $("rotate-angle"), scope = $("rotate-scope"), rangeField = $("rotate-range-field"), range = $("rotate-range");
      scope.onchange = () => rangeField.classList.toggle("hidden", scope.value !== "range");
      function setFile(f) {
        file = f; run.disabled = !f;
        if (!f) { meta.innerHTML = ""; return; }
        pdfPageCount(f).then((n) => { meta.innerHTML = n > 0 ? `<div class="status info show">${t("pages", n)}</div>` : `<div class="status info show">${t("locked")}</div>`; });
      }
      wireDropzone($("rotate-file").closest(".dropzone"), $("rotate-file"), (fs) => setFile(fs[0]));
      run.onclick = async () => {
        if (!file) return;
        setBusy(run, true); showResult(res, { ok: true, message: t("processing") });
        try {
          const src = await PDFDocument.load(await fileToBytes(file));
          const total = src.getPageCount();
          const delta = Number(angle.value);
          let targets = [];
          if (scope.value === "all") targets = src.getPageIndices();
          else targets = parseRanges(range.value, total);
          targets.forEach((i) => {
            const p = src.getPage(i);
            const cur = ((p.getRotation().angle % 360) + 360) % 360;
            p.setRotation(degrees((cur + delta) % 360));
          });
          const bytes = await src.save();
          showResult(res, { ok: true, message: t("rotated", targets.length), link: makeLink("docello-rotated.pdf", bytes) });
        } catch (e) { showResult(res, { ok: false, message: t("failed", e) }); }
        finally { setBusy(run, false); }
      };
    }

    /* ===== ORGANIZE ===== */
    if ($("organize-run")) {
      let file = null;
      const meta = $("organize-meta"), run = $("organize-run"), res = $("organize-result"), order = $("organize-order");
      function setFile(f) {
        file = f; run.disabled = !f;
        if (!f) { meta.innerHTML = ""; return; }
        pdfPageCount(f).then((n) => { meta.innerHTML = n > 0 ? `<div class="status info show">${t("pages", n)}</div>` : `<div class="status info show">${t("locked")}</div>`; });
      }
      wireDropzone($("organize-file").closest(".dropzone"), $("organize-file"), (fs) => setFile(fs[0]));
      run.onclick = async () => {
        if (!file) return;
        const seq = parseOrder(order.value, 1e9);
        if (!seq.length) { showResult(res, { ok: false, message: t("needOrder") }); return; }
        setBusy(run, true); showResult(res, { ok: true, message: t("processing") });
        try {
          const src = await PDFDocument.load(await fileToBytes(file));
          const total = src.getPageCount();
          const idx = parseOrder(order.value, total);
          if (!idx.length) { showResult(res, { ok: false, message: t("needOrder") }); setBusy(run, false); return; }
          const out = await PDFDocument.create();
          const pages = await out.copyPages(src, idx);
          pages.forEach((p) => out.addPage(p));
          const bytes = await out.save();
          showResult(res, { ok: true, message: t("organized", idx.length), link: makeLink("docello-organized.pdf", bytes) });
        } catch (e) { showResult(res, { ok: false, message: t("failed", e) }); }
        finally { setBusy(run, false); }
      };
    }

    /* ===== IMAGES -> PDF ===== */
    if ($("images-run")) {
      let files = [];
      const list = $("images-list"), count = $("images-count"), run = $("images-run"), res = $("images-result"), sizeSel = $("images-pagesize");
      function render() {
        list.innerHTML = "";
        files.forEach((f, i) => {
          const li = document.createElement("li");
          li.innerHTML = `<span class="nm">${f.name}</span><span class="meta">${Math.round(f.size / 1024)} KB</span>`;
          const del = document.createElement("button"); del.className = "iconbtn"; del.textContent = "✕";
          del.onclick = () => { files.splice(i, 1); render(); };
          li.appendChild(del); list.appendChild(li);
        });
        count.textContent = files.length ? (lang === "zh-CN" ? `已选择 ${files.length} 张图片。` : `${files.length} image(s) selected.`) : t("selectFirst");
        run.disabled = files.length < 1;
      }
      wireDropzone($("images-files").closest(".dropzone"), $("images-files"), (fs) => { files = files.concat(fs.filter(f => f.type.startsWith("image/"))); render(); });
      async function embedImage(out, file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (file.type === "image/png") return out.embedPng(bytes);
        if (file.type === "image/jpeg") return out.embedJpg(bytes);
        const bmp = await createImageBitmap(file);
        const cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height;
        cv.getContext("2d").drawImage(bmp, 0, 0);
        const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
        return out.embedPng(new Uint8Array(await blob.arrayBuffer()));
      }
      run.onclick = async () => {
        if (!files.length) return;
        setBusy(run, true); showResult(res, { ok: true, message: t("processing") });
        try {
          const out = await PDFDocument.create();
          const fitA4 = sizeSel.value === "a4";
          const A4 = [595.28, 841.89], m = 36;
          for (const f of files) {
            const img = await embedImage(out, f);
            let pw, ph, dx, dy, dw, dh;
            if (!fitA4) { pw = img.width; ph = img.height; dx = 0; dy = 0; dw = pw; dh = ph; }
            else {
              pw = A4[0]; ph = A4[1];
              const s = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height);
              dw = img.width * s; dh = img.height * s; dx = (pw - dw) / 2; dy = (ph - dh) / 2;
            }
            const page = out.addPage([pw, ph]);
            page.drawImage(img, { x: dx, y: dy, width: dw, height: dh });
          }
          const bytes = await out.save();
          showResult(res, { ok: true, message: t("imagesDone", files.length), link: makeLink("docello-images.pdf", bytes) });
        } catch (e) { showResult(res, { ok: false, message: t("failed", e) }); }
        finally { setBusy(run, false); }
      };
      render();
    }

    /* ===== WATERMARK ===== */
    if ($("watermark-run")) {
      let file = null;
      const meta = $("watermark-meta"), run = $("watermark-run"), res = $("watermark-result");
      const wtext = $("watermark-text"), wsize = $("watermark-size"), wopacity = $("watermark-opacity"), wangle = $("watermark-angle"), wcolor = $("watermark-color");
      const sv = $("watermark-size-val"), ov = $("watermark-opacity-val"), av = $("watermark-angle-val");
      wsize.oninput = () => sv.textContent = wsize.value;
      wopacity.oninput = () => ov.textContent = wopacity.value + "%";
      wangle.oninput = () => av.textContent = wangle.value + "°";
      function setFile(f) {
        file = f; run.disabled = !f;
        if (!f) { meta.innerHTML = ""; return; }
        pdfPageCount(f).then((n) => { meta.innerHTML = n > 0 ? `<div class="status info show">${t("pages", n)}</div>` : `<div class="status info show">${t("locked")}</div>`; });
      }
      wireDropzone($("watermark-file").closest(".dropzone"), $("watermark-file"), (fs) => setFile(fs[0]));
      run.onclick = async () => {
        if (!file) return;
        setBusy(run, true); showResult(res, { ok: true, message: t("processing") });
        try {
          const src = await PDFDocument.load(await fileToBytes(file));
          const font = await src.embedFont(StandardFonts.Helvetica);
          const text = wtext.value || "Docello";
          const size = Number(wsize.value), opacity = Number(wopacity.value) / 100, angle = Number(wangle.value);
          const color = hexToRgb(wcolor.value);
          const tw = font.widthOfTextAtSize(text, size);
          for (let i = 0; i < src.getPageCount(); i++) {
            const page = src.getPage(i);
            const { w, h } = dispDims(page);
            const stepX = Math.max(tw + size, size * 5);
            const stepY = size * 4;
            for (let y = stepY / 2; y < h + stepY; y += stepY) {
              for (let x = stepX / 2; x < w + stepX; x += stepX) {
                const u = visualToUnrot(page, x - tw / 2, y - size / 2);
                page.drawText(text, { x: u.x, y: u.y, size, font, color, opacity, rotate: degrees(-angle) });
              }
            }
          }
          const bytes = await src.save();
          showResult(res, { ok: true, message: t("watermarked"), link: makeLink("docello-watermarked.pdf", bytes) });
        } catch (e) { showResult(res, { ok: false, message: t("failed", e) }); }
        finally { setBusy(run, false); }
      };
    }

    /* ===== PAGE NUMBERS ===== */
    if ($("pagenumbers-run")) {
      let file = null;
      const meta = $("pagenumbers-meta"), run = $("pagenumbers-run"), res = $("pagenumbers-result");
      const pos = $("pagenumbers-pos"), start = $("pagenumbers-start"), psize = $("pagenumbers-size"),
        prefix = $("pagenumbers-prefix"), suffix = $("pagenumbers-suffix"), pcolor = $("pagenumbers-color");
      function setFile(f) {
        file = f; run.disabled = !f;
        if (!f) { meta.innerHTML = ""; return; }
        pdfPageCount(f).then((n) => { meta.innerHTML = n > 0 ? `<div class="status info show">${t("pages", n)}</div>` : `<div class="status info show">${t("locked")}</div>`; });
      }
      wireDropzone($("pagenumbers-file").closest(".dropzone"), $("pagenumbers-file"), (fs) => setFile(fs[0]));
      run.onclick = async () => {
        if (!file) return;
        setBusy(run, true); showResult(res, { ok: true, message: t("processing") });
        try {
          const src = await PDFDocument.load(await fileToBytes(file));
          const font = await src.embedFont(StandardFonts.Helvetica);
          const total = src.getPageCount();
          const size = Number(psize.value), color = hexToRgb(pcolor.value), margin = 28;
          const pre = prefix.value, suf = suffix.value;
          for (let i = 0; i < total; i++) {
            const page = src.getPage(i);
            const { w, h } = dispDims(page);
            const num = Number(start.value) + i;
            const txt = pre + num + suf.replace(/\{total\}/g, String(total));
            const tw = font.widthOfTextAtSize(txt, size);
            let sx, sy;
            switch (pos.value) {
              case "bl": sx = margin; sy = h - margin; break;
              case "bc": sx = w / 2 - tw / 2; sy = h - margin; break;
              case "br": sx = w - margin - tw; sy = h - margin; break;
              default: sx = w - margin - tw; sy = margin; break; // tr
            }
            const u = visualToUnrot(page, sx, sy);
            page.drawText(txt, { x: u.x, y: u.y, size, font, color });
          }
          const bytes = await src.save();
          showResult(res, { ok: true, message: t("numbered", total), link: makeLink("docello-numbered.pdf", bytes) });
        } catch (e) { showResult(res, { ok: false, message: t("failed", e) }); }
        finally { setBusy(run, false); }
      };
    }

    /* ===== CROP ===== */
    if ($("crop-run")) {
      let file = null;
      const meta = $("crop-meta"), run = $("crop-run"), res = $("crop-result"), margin = $("crop-margin");
      function setFile(f) {
        file = f; run.disabled = !f;
        if (!f) { meta.innerHTML = ""; return; }
        pdfPageCount(f).then((n) => { meta.innerHTML = n > 0 ? `<div class="status info show">${t("pages", n)}</div>` : `<div class="status info show">${t("locked")}</div>`; });
      }
      wireDropzone($("crop-file").closest(".dropzone"), $("crop-file"), (fs) => setFile(fs[0]));
      run.onclick = async () => {
        if (!file) return;
        setBusy(run, true); showResult(res, { ok: true, message: t("processing") });
        try {
          const src = await PDFDocument.load(await fileToBytes(file));
          let m = Math.max(0, Number(margin.value) || 0);
          const total = src.getPageCount();
          for (let i = 0; i < total; i++) {
            const page = src.getPage(i);
            const W = page.getWidth(), H = page.getHeight();
            const mx = Math.min(m, Math.floor(Math.min(W, H) / 2) - 1);
            const mm = mx < 0 ? 0 : mx;
            page.setMediaBox(mm, mm, W - 2 * mm, H - 2 * mm);
            page.setCropBox(mm, mm, W - 2 * mm, H - 2 * mm);
          }
          const bytes = await src.save();
          showResult(res, { ok: true, message: t("cropped", total), link: makeLink("docello-cropped.pdf", bytes) });
        } catch (e) { showResult(res, { ok: false, message: t("failed", e) }); }
        finally { setBusy(run, false); }
      };
    }
  });

  /* shared parsers (used above) */
  function parseRanges(str, total) {
    const idx = new Set();
    str.split(",").map((s) => s.trim()).filter(Boolean).forEach((part) => {
      if (part.includes("-")) {
        let [a, b] = part.split("-").map(Number);
        if (!b) b = a; if (a > b) [a, b] = [b, a];
        for (let i = Math.max(1, a); i <= Math.min(total, b); i++) idx.add(i - 1);
      } else {
        const n = Number(part);
        if (n >= 1 && n <= total) idx.add(n - 1);
      }
    });
    return [...idx].sort((a, b) => a - b);
  }
  function parseOrder(str, total) {
    const out = [];
    str.split(",").map((s) => s.trim()).filter(Boolean).forEach((tok) => {
      const n = Number(tok);
      if (Number.isInteger(n) && n >= 1 && n <= total) out.push(n - 1);
    });
    return out;
  }
})();
