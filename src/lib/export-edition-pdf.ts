/**
 * Client-side PDF of the on-screen `.sheet-page` (screen CSS, not print media).
 * Fits the capture onto a single A4 page.
 */
export async function exportEditionPdf(fileStem: string): Promise<void> {
  const sheet = document.querySelector(".sheet-page");
  if (!(sheet instanceof HTMLElement)) {
    throw new Error("Edizione non trovata sulla pagina.");
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(sheet, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: sheet.scrollWidth,
    windowHeight: sheet.scrollHeight,
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const ratio = canvas.height / canvas.width;
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
