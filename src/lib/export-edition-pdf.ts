/**
 * Client-side PDF of the on-screen `.sheet-page` (screen CSS, not print media).
 * Fits the capture onto a single A4 page — no browser print dialog.
 *
 * Capture uses `html-to-image` (SVG foreignObject), which preserves CSS grid and
 * typography far more reliably than html2canvas. The desktop newspaper grid used
 * to live behind `@media (min-width: 860px)` while the sheet is only ~794px wide,
 * so narrow clones fell back to a single column; we force the same 3-column map
 * as the screen stylesheet before snapshotting.
 *
 * On iPhone the viewport stays ~390px during capture even after the sheet is
 * widened to 210mm, so viewport media queries that pack Promemoria/Email into
 * two columns never fire. `is-pdf-capture` CSS, sheet container queries, and
 * inline grid styles below keep those lists at two columns so Email stays at
 * four items instead of being crushed.
 *
 * `-webkit-box` + `-webkit-line-clamp` stretch glyphs in rasterizers. Fully
 * unwrapping the clamp also expands long summaries to their full height while
 * the SVG often still paints only the clamped lines — phantom empty space under
 * those items. Instead, replace the webkit box with `display:block` and a
 * line-height × N `max-height` so PDF spacing matches the on-screen clamp.
 */

const DESKTOP_GRID_COLUMNS = "0.95fr 1.05fr 1.2fr";
const DESKTOP_GRID_AREAS = `"weather calendar news" "reminders reminders news" "emails emails emails"`;

/** Selectors → on-screen `-webkit-line-clamp` line counts. */
const LINE_CLAMP_LINES: Array<[string, number]> = [
  [".headline-list__title", 3],
  [".headline-list__summary", 2],
  [".reminder-list__title", 2],
  [".cal-event__title", 2],
  [".action-mail-list__subject", 2],
  [".action-mail-list__body", 1],
];

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

function resolveLineHeightPx(node: HTMLElement): number {
  const cs = getComputedStyle(node);
  const lh = parseFloat(cs.lineHeight);
  if (Number.isFinite(lh) && lh > 0) return lh;
  const fs = parseFloat(cs.fontSize);
  return Number.isFinite(fs) && fs > 0 ? fs * 1.25 : 16;
}

/**
 * Drop `-webkit-box` clamp (bad for SVG raster) but keep the same visual cap
 * via max-height so long items do not grow a phantom gap in the PDF.
 */
function replaceWebkitClampWithMaxHeight(
  node: HTMLElement,
  lines: number,
): void {
  const lineHeight = resolveLineHeightPx(node);
  const maxH = lineHeight * lines;

  node.style.setProperty("display", "block", "important");
  node.style.setProperty("-webkit-box-orient", "unset", "important");
  node.style.setProperty("-webkit-line-clamp", "none", "important");
  node.style.setProperty("line-clamp", "none", "important");
  node.style.setProperty("overflow", "hidden", "important");
  node.style.setProperty("white-space", "normal", "important");
  node.style.setProperty("transform", "none", "important");
  node.style.setProperty("min-height", "0", "important");
  node.style.setProperty("max-height", `${maxH}px`, "important");
  node.style.setProperty("height", "auto", "important");

  // Lock used height to the capped box so html-to-image does not bake a taller
  // unclamped height into the SVG foreignObject clone.
  void node.offsetHeight;
  const used = Math.min(node.offsetHeight, maxH);
  node.style.setProperty("height", `${used}px`, "important");
  node.style.setProperty("max-height", `${used}px`, "important");
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

  const reminderList = root.querySelector(".reminder-list");
  if (reminderList instanceof HTMLElement) touched.push(reminderList);
  const actionMailList = root.querySelector(".action-mail-list");
  if (actionMailList instanceof HTMLElement) touched.push(actionMailList);

  for (const [selector] of LINE_CLAMP_LINES) {
    root.querySelectorAll(selector).forEach((node) => {
      if (node instanceof HTMLElement) touched.push(node);
    });
  }

  const backups = backupStyles(touched);

  root.classList.add("is-pdf-capture");
  root.style.width = "210mm";
  root.style.maxWidth = "210mm";
  root.style.height = "297mm";
  root.style.maxHeight = "297mm";
  root.style.margin = "0";
  root.style.boxSizing = "border-box";
  root.style.background = "#ffffff";
  root.style.overflow = "hidden";
  root.style.display = "flex";
  root.style.flexDirection = "column";

  if (grid instanceof HTMLElement) {
    grid.style.display = "grid";
    grid.style.flex = "1 1 auto";
    grid.style.minHeight = "0";
    grid.style.gridTemplateColumns = DESKTOP_GRID_COLUMNS;
    grid.style.gridTemplateRows = "max-content max-content max-content";
    grid.style.gridTemplateAreas = DESKTOP_GRID_AREAS;
    grid.style.gap = "0.85rem 1rem";
    grid.style.marginTop = "0.85rem";
    grid.style.alignContent = "stretch";
    grid.style.alignItems = "stretch";
    grid.style.overflow = "hidden";
  }

  for (const [selector, area] of orderedAreas) {
    const el = root.querySelector(selector);
    if (el instanceof HTMLElement) {
      el.style.gridArea = area;
      el.style.minHeight = "0";
      el.style.position = "relative";
      el.style.overflow = "hidden";
      el.style.alignSelf = "stretch";
    }
  }

  // Viewport on iPhone stays narrow; media queries that pack lists into two
  // columns never fire. Set them inline so PDF capture matches desktop A4.
  if (reminderList instanceof HTMLElement) {
    reminderList.style.display = "grid";
    reminderList.style.gridTemplateColumns = "1fr 1fr";
    reminderList.style.gap = "0 0.55rem";
    reminderList.style.columnGap = "0.55rem";
  }
  if (actionMailList instanceof HTMLElement) {
    actionMailList.style.display = "grid";
    actionMailList.style.gridTemplateColumns = "1fr 1fr";
    actionMailList.style.gap = "0.15rem 0.75rem";
  }

  for (const [selector, lines] of LINE_CLAMP_LINES) {
    root.querySelectorAll(selector).forEach((node) => {
      if (node instanceof HTMLElement) {
        replaceWebkitClampWithMaxHeight(node, lines);
      }
    });
  }

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
    requestAnimationFrame(() =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });

  let imgData: string;
  try {
    const rect = sheet.getBoundingClientRect();
    const captureH = Math.ceil(rect.height);
    imgData = await toJpeg(sheet, {
      quality: 0.96,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      width: Math.ceil(rect.width),
      // Fixed A4 box only — never capture overflow below the page.
      height: captureH,
      style: {
        transform: "none",
        width: `${Math.ceil(rect.width)}px`,
        maxWidth: `${Math.ceil(rect.width)}px`,
        height: `${captureH}px`,
        maxHeight: `${captureH}px`,
        margin: "0",
        overflow: "hidden",
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
