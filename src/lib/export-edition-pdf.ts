/**
 * Client-side PDF of the on-screen `.sheet-page` (screen CSS, not print media).
 * Fits the capture onto a single A4 page — no browser print dialog.
 *
 * Capture uses `html-to-image` (SVG foreignObject), which preserves CSS grid and
 * typography far more reliably than html2canvas. The desktop newspaper grid used
 * to live behind `@media (min-width: 860px)` while the sheet is only ~794px wide,
 * so narrow clones fell back to a single column; we force the same 3-column map
 * as the screen stylesheet and unwrap `-webkit-line-clamp` before snapshotting.
 */

const DESKTOP_GRID_COLUMNS = "0.95fr 1.05fr 1.2fr";
const DESKTOP_GRID_AREAS = `"weather calendar news" "reminders reminders news" "emails emails emails"`;

const LINE_CLAMP_SELECTORS = [
  ".headline-list__title",
  ".headline-list__summary",
  ".reminder-list__title",
  ".cal-event__title",
  ".action-mail-list__subject",
  ".action-mail-list__cue",
].join(", ");

type StyleBackup = {
  el: HTMLElement;
  cssText: string;
  className: string;
};

function backupStyles(els: HTMLElement[]): StyleBackup[] {
  return els.map((el) => ({
    el,
    cssText: el.style.cssText,
    className: el.className,
  }));
}

function restoreStyles(backups: StyleBackup[]): void {
  for (const b of backups) {
    b.el.style.cssText = b.cssText;
    b.el.className = b.className;
  }
}

/** Apply screen newspaper layout on the live sheet for a faithful snapshot. */
function prepareSheetForCapture(root: HTMLElement): () => void {
  const touched: HTMLElement[] = [root];
  const grid = root.querySelector(".sheet-grid");
  if (grid instanceof HTMLElement) touched.push(grid);

  const orderedAreas: Array<[string, string]> = [
    [".area-weather", "weather"],
    [".area-calendar", "calendar"],
    [".area-news", "news"],
    [".area-reminders", "reminders"],
    [".area-emails", "emails"],
  ];
  for (const [selector] of orderedAreas) {
    const el = root.querySelector(selector);
    if (el instanceof HTMLElement) touched.push(el);
  }

  root.querySelectorAll(LINE_CLAMP_SELECTORS).forEach((node) => {
    if (node instanceof HTMLElement) touched.push(node);
  });

  const backups = backupStyles(touched);

  root.classList.add("is-pdf-capture");
  root.style.width = "210mm";
  root.style.maxWidth = "210mm";
  root.style.margin = "0";
  root.style.boxSizing = "border-box";
  root.style.background = "#ffffff";

  if (grid instanceof HTMLElement) {
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = DESKTOP_GRID_COLUMNS;
    grid.style.gridTemplateAreas = DESKTOP_GRID_AREAS;
    grid.style.gap = "0.85rem 1rem";
    grid.style.marginTop = "0.85rem";
    grid.style.alignContent = "start";
  }

  for (const [selector, area] of orderedAreas) {
    const el = root.querySelector(selector);
    if (el instanceof HTMLElement) {
      el.style.gridArea = area;
      el.style.minHeight = "0";
    }
  }

  root.querySelectorAll(LINE_CLAMP_SELECTORS).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    // Replace -webkit-box clamp with plain block — avoids glyph stretch in rasterizers.
    node.style.display = "block";
    node.style.setProperty("-webkit-box-orient", "initial");
    node.style.setProperty("-webkit-line-clamp", "unset");
    node.style.overflow = "hidden";
    node.style.maxHeight = "none";
    node.style.transform = "none";
    node.style.whiteSpace = "normal";
  });

  return () => restoreStyles(backups);
}

function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("Impossibile leggere l’anteprima PDF."));
    img.src = dataUrl;
  });
}

export async function exportEditionPdf(fileStem: string): Promise<void> {
  const sheet = document.querySelector(".sheet-page");
  if (!(sheet instanceof HTMLElement)) {
    throw new Error("Edizione non trovata sulla pagina.");
  }

  const [{ toJpeg }, { jsPDF }] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
  ]);

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const restore = prepareSheetForCapture(sheet);
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  let imgData: string;
  try {
    const rect = sheet.getBoundingClientRect();
    imgData = await toJpeg(sheet, {
      quality: 0.96,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      width: Math.ceil(rect.width),
      height: Math.ceil(Math.max(sheet.scrollHeight, rect.height)),
      style: {
        transform: "none",
        width: `${Math.ceil(rect.width)}px`,
        maxWidth: `${Math.ceil(rect.width)}px`,
        margin: "0",
      },
      filter: (node) => {
        if (!(node instanceof Element)) return true;
        return !node.classList?.contains("no-print");
      },
    });
  } finally {
    restore();
  }

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const dims = await imageSize(imgData);
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const ratio = dims.h / dims.w;
  let drawW = pageW;
  let drawH = pageW * ratio;
  if (drawH > pageH) {
    drawH = pageH;
    drawW = pageH / ratio;
  }
  const x = (pageW - drawW) / 2;
  const y = (pageH - drawH) / 2;

  pdf.addImage(imgData, "JPEG", x, y, drawW, drawH, undefined, "FAST");
  const safeStem = fileStem.replace(/[^\w.-]+/g, "-") || "the-daily-tailor";
  pdf.save(`${safeStem}.pdf`);
}
