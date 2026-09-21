import {
  detachHeadlineRowsForCapture,
  requestAdaptiveRefit,
} from "@/lib/trim-overflowing-lists";

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
 * On iPhone the viewport stays ~390px during capture, so @media (max-width:
 * 640px) would otherwise keep mobile type/padding. Capture locks a fixed A4
 * CSS-px box (794×1123) plus desktop type under `.is-pdf-capture`.
 *
 * `-webkit-box` + `-webkit-line-clamp` stretch glyphs in rasterizers. Fully
 * unwrapping the clamp also expands long summaries to their full height while
 * the SVG often still paints only the clamped lines — phantom empty space under
 * those items. Instead, replace the webkit box with `display:block` and a
 * line-height × N `max-height` so PDF spacing matches the on-screen clamp.
 *
 * Important: never lock clamp heights on `[hidden]` rows (offsetHeight is 0).
 * Doing so, then re-showing those rows, paints empty list items with only a
 * dotted border — the ghost rules under Notizie in the PDF.
 */

const DESKTOP_GRID_COLUMNS = "0.95fr 1.05fr 1.2fr";
const DESKTOP_GRID_AREAS = `"weather calendar news" "reminders reminders news" "emails emails emails"`;

/** A4 portrait at 96 CSS px/in — identical capture box on iPhone and desktop. */
const A4_WIDTH_PX = Math.round((210 / 25.4) * 96); // 794
const A4_HEIGHT_PX = Math.round((297 / 25.4) * 96); // 1123
/** ~12mm / ~10mm at 96dpi — avoid mm→px drift across Safari/Chrome. */
const A4_PAD_X_PX = Math.round((12 / 25.4) * 96); // 45
const A4_PAD_BOTTOM_PX = Math.round((10 / 25.4) * 96); // 38

/** Selectors → on-screen `-webkit-line-clamp` line counts. */
const LINE_CLAMP_LINES: Array<[string, number]> = [
  [".headline-list__title", 3],
  [".headline-list__summary", 2],
  [".reminder-list__title", 2],
  [".cal-event__title", 2],
  [".action-mail-list__subject", 2],
  [".action-mail-list__body", 2],
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
  // Hidden rows report offsetHeight 0 — locking that paints empty bordered li.
  if (node.closest("[hidden]")) return;
  if (getComputedStyle(node).display === "none") return;

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
  const natural = node.offsetHeight;
  if (natural < 1) {
    // Not laid out — leave unconstrained; do not lock height:0.
    node.style.removeProperty("height");
    node.style.removeProperty("max-height");
    return;
  }
  const used = Math.min(natural, maxH);
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
  root.style.width = `${A4_WIDTH_PX}px`;
  root.style.maxWidth = `${A4_WIDTH_PX}px`;
  root.style.height = `${A4_HEIGHT_PX}px`;
  root.style.maxHeight = `${A4_HEIGHT_PX}px`;
  root.style.margin = "0";
  root.style.padding = `${A4_PAD_X_PX}px ${A4_PAD_X_PX}px ${A4_PAD_BOTTOM_PX}px`;
  root.style.boxSizing = "border-box";
  root.style.background = "#ffffff";
  root.style.overflow = "hidden";
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.borderRadius = "0";

  if (grid instanceof HTMLElement) {
    grid.style.display = "grid";
    grid.style.flex = "1 1 auto";
    grid.style.minHeight = "0";
    grid.style.gridTemplateColumns = DESKTOP_GRID_COLUMNS;
    // auto rows: pack from the top. stretch+max-content let iOS push emails
    // past the A4 clip edge while the left mail cell was still mid-paint.
    grid.style.gridTemplateRows = "auto auto auto";
    grid.style.gridTemplateAreas = DESKTOP_GRID_AREAS;
    grid.style.gap = "0.85rem 1rem";
    grid.style.marginTop = "0.85rem";
    grid.style.alignContent = "start";
    grid.style.alignItems = "start";
    grid.style.overflow = "hidden";
  }

  for (const [selector, area] of orderedAreas) {
    const el = root.querySelector(selector);
    if (el instanceof HTMLElement) {
      el.style.gridArea = area;
      el.style.position = "relative";
      if (selector === ".area-news") {
        // News spans two rows and must clip leftover headlines.
        el.style.minHeight = "0";
        el.style.overflow = "hidden";
        el.style.alignSelf = "stretch";
        el.style.height = "100%";
      } else {
        // Weather / calendar / reminders / emails size to content.
        // Never overflow:hidden on emails — that clipped the bottom-left
        // mail on iPhone when iOS font metrics ran slightly taller.
        el.style.minHeight = "max-content";
        el.style.overflow = "visible";
        el.style.alignSelf = "start";
        el.style.height = "auto";
      }
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

/**
 * If the email block (or footer) sits past the A4 clip edge — common on iPhone
 * where font metrics run a hair taller — shrink mail body previews, then cue
 * lines, until everything clears the sheet bottom padding.
 */
function fitEmailsInsideSheet(root: HTMLElement): void {
  const emails = root.querySelector(".area-emails");
  const footer = root.querySelector(".sheet-footer");
  if (!(emails instanceof HTMLElement)) return;

  const sheetBottom =
    root.getBoundingClientRect().top + root.clientHeight - 2;

  const overflows = () => {
    const emailBottom = emails.getBoundingClientRect().bottom;
    const footerBottom =
      footer instanceof HTMLElement
        ? footer.getBoundingClientRect().bottom
        : emailBottom;
    return Math.max(emailBottom, footerBottom) > sheetBottom;
  };

  if (!overflows()) return;

  const shrink = (selector: string, lines: number) => {
    root.querySelectorAll(selector).forEach((node) => {
      if (node instanceof HTMLElement) {
        replaceWebkitClampWithMaxHeight(node, lines);
      }
    });
  };

  // Progressive tighten — keep all four mails, just shorter previews.
  for (const lines of [2, 1, 0]) {
    if (!overflows()) break;
    if (lines === 0) {
      root.querySelectorAll(".action-mail-list__body").forEach((node) => {
        if (node instanceof HTMLElement) {
          node.style.setProperty("display", "none", "important");
          node.style.setProperty("height", "0", "important");
          node.style.setProperty("max-height", "0", "important");
          node.style.setProperty("margin", "0", "important");
          node.style.setProperty("padding", "0", "important");
        }
      });
    } else {
      shrink(".action-mail-list__body", lines);
    }
  }

  if (overflows()) {
    shrink(".action-mail-list__cue", 1);
    shrink(".action-mail-list__subject", 1);
  }

  if (overflows()) {
    root.querySelectorAll(".action-mail-list__cue").forEach((node) => {
      if (node instanceof HTMLElement) {
        node.style.setProperty("display", "none", "important");
      }
    });
  }
}

/** Park the A4 sheet at the viewport origin so iOS foreignObject is not clipped. */
function pinSheetForIosCapture(root: HTMLElement): () => void {
  const prev = {
    position: root.style.position,
    left: root.style.left,
    top: root.style.top,
    right: root.style.right,
    zIndex: root.style.zIndex,
    transform: root.style.transform,
  };
  root.style.position = "fixed";
  root.style.left = "0";
  root.style.top = "0";
  root.style.right = "auto";
  root.style.zIndex = "2147483646";
  root.style.transform = "none";
  window.scrollTo(0, 0);
  return () => {
    root.style.position = prev.position;
    root.style.left = prev.left;
    root.style.top = prev.top;
    root.style.right = prev.right;
    root.style.zIndex = prev.zIndex;
    root.style.transform = prev.transform;
  };
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
  const unpin = pinSheetForIosCapture(sheet);
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });

  // Physically remove hidden / overflow / collapsed news rows for the snapshot.
  // Do not AdaptiveFill-refit first: that re-shows rows and recreates ghost rules.
  const restoreHeadlines = detachHeadlineRowsForCapture(sheet);
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  fitEmailsInsideSheet(sheet);
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

  let imgData: string;
  try {
    imgData = await toJpeg(sheet, {
      quality: 0.96,
      // Fixed ratio so Retina iPhone (3×) and desktop (2×) share the same PDF DPI.
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      width: A4_WIDTH_PX,
      height: A4_HEIGHT_PX,
      style: {
        transform: "none",
        width: `${A4_WIDTH_PX}px`,
        maxWidth: `${A4_WIDTH_PX}px`,
        height: `${A4_HEIGHT_PX}px`,
        maxHeight: `${A4_HEIGHT_PX}px`,
        margin: "0",
        overflow: "hidden",
      },
      filter: (node) => {
        if (!(node instanceof Element)) return true;
        if (node.classList?.contains("no-print")) return false;
        if (node instanceof HTMLElement && node.hidden) return false;
        return true;
      },
    });
  } finally {
    restoreHeadlines();
    unpin();
    restore();
    requestAdaptiveRefit(sheet);
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
