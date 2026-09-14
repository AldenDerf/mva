/**
 * Utility to generate and download an official high-resolution PNG reference card
 * for a completed MVA team registration.
 */

export interface ReferenceImageData {
  registrationCode: string;
  teamName: string;
  categoryName: string;
  leagueName: string;
  status: string;
  submittedAt?: string | null;
}

/**
 * Draws rounded rectangle path on a 2D canvas context.
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number | { tl: number; tr: number; br: number; bl: number }
) {
  const r =
    typeof radius === "number"
      ? { tl: radius, tr: radius, br: radius, bl: radius }
      : radius;

  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + width - r.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r.tr);
  ctx.lineTo(x + width, y + height - r.br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r.br, y + height);
  ctx.lineTo(x + r.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.quadraticCurveTo(x, y, x + r.tl, y);
  ctx.closePath();
}

/**
 * Helper to wrap text into multiple lines within a max width.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = words[0] || "";

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Loads an image from a URL and returns an HTMLImageElement promise.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image at ${src}`));
    img.src = src;
  });
}

/**
 * Generates a high-resolution PNG reference image (1200x1400) and triggers download.
 */
export async function downloadReferenceImage(
  data: ReferenceImageData
): Promise<void> {
  const width = 1200;
  const height = 1420;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Failed to initialize canvas rendering context.");
  }

  // 1. Canvas Background
  ctx.fillStyle = "#FAFAF8";
  ctx.fillRect(0, 0, width, height);

  // Top accent bar
  ctx.fillStyle = "#205823";
  ctx.fillRect(0, 0, width, 16);

  // 2. Main Card Container
  const cardX = 80;
  const cardY = 60;
  const cardW = 1040;
  const cardH = 1250;
  const cardRadius = 32;

  // Card shadow
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.08)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
  ctx.fill();
  ctx.restore();

  // Card border
  ctx.strokeStyle = "#DDE3DE";
  ctx.lineWidth = 2.5;
  roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
  ctx.stroke();

  // 3. Card Header Banner (Deep Athletic Green #205823)
  const headerHeight = 270;
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, cardX, cardY, cardW, headerHeight, {
    tl: cardRadius,
    tr: cardRadius,
    br: 0,
    bl: 0,
  });
  ctx.clip();
  ctx.fillStyle = "#205823";
  ctx.fillRect(cardX, cardY, cardW, headerHeight);

  // Gold decorative accent line at bottom of header
  ctx.fillStyle = "#F5D025";
  ctx.fillRect(cardX, cardY + headerHeight - 8, cardW, 8);
  ctx.restore();

  // 4. Header Content & Official Logo
  const logoSize = 130;
  const logoX = cardX + 60;
  const logoY = cardY + 55;

  try {
    const logoImg = await loadImage("/images/MVA Official Logo.png");
    ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
  } catch {
    // Fallback: draw gold circular badge with volleyball text
    ctx.fillStyle = "#F5D025";
    ctx.beginPath();
    ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#205823";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("MVA", logoX + logoSize / 2, logoY + logoSize / 2);
  }

  // Header Typography
  const textStartX = logoX + logoSize + 40;
  ctx.textAlign = "left";

  // Association Name
  ctx.fillStyle = "#F5D025";
  ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("MAHATAO VOLLEYBALL ASSOCIATION", textStartX, cardY + 95);

  // Title: Official Registration Reference
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 38px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("Official Registration Reference", textStartX, cardY + 145);

  // League Name
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.font = "600 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(data.leagueName, textStartX, cardY + 185);

  // 5. Card Body: Registration Code Box
  const codeBoxY = cardY + headerHeight + 50;
  const codeBoxH = 140;
  const codeBoxX = cardX + 60;
  const codeBoxW = cardW - 120;

  ctx.fillStyle = "#F4F7F4";
  roundRect(ctx, codeBoxX, codeBoxY, codeBoxW, codeBoxH, 20);
  ctx.fill();
  ctx.strokeStyle = "#205823";
  ctx.lineWidth = 2;
  roundRect(ctx, codeBoxX, codeBoxY, codeBoxW, codeBoxH, 20);
  ctx.stroke();

  // Registration Reference Label
  ctx.textAlign = "center";
  ctx.fillStyle = "#5F6B61";
  ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(
    "OFFICIAL REGISTRATION CODE",
    cardX + cardW / 2,
    codeBoxY + 45
  );

  // Registration Reference Code (High visibility)
  ctx.fillStyle = "#205823";
  ctx.font = "900 52px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  ctx.fillText(
    data.registrationCode,
    cardX + cardW / 2,
    codeBoxY + 105
  );

  // Status Badge
  const statusY = codeBoxY + codeBoxH + 35;
  const statusText = "STATUS: PENDING PAYMENT";
  ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const statusMetrics = ctx.measureText(statusText);
  const statusBadgeW = statusMetrics.width + 44;
  const statusBadgeH = 38;
  const statusBadgeX = cardX + (cardW - statusBadgeW) / 2;

  ctx.fillStyle = "#FEF3C7"; // Soft gold background
  roundRect(ctx, statusBadgeX, statusY, statusBadgeW, statusBadgeH, 19);
  ctx.fill();
  ctx.strokeStyle = "#B99531";
  ctx.lineWidth = 1.5;
  roundRect(ctx, statusBadgeX, statusY, statusBadgeW, statusBadgeH, 19);
  ctx.stroke();

  ctx.fillStyle = "#92400E";
  ctx.textBaseline = "middle";
  ctx.fillText(statusText, cardX + cardW / 2, statusY + statusBadgeH / 2);
  ctx.textBaseline = "alphabetic";

  // 6. Metadata Rows
  const rowsStartY = statusY + 75;
  const rowHeight = 90;

  // Divider Line
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cardX + 60, rowsStartY);
  ctx.lineTo(cardX + cardW - 60, rowsStartY);
  ctx.stroke();

  // Field 1: Team Name
  const field1Y = rowsStartY + 45;
  ctx.textAlign = "left";
  ctx.fillStyle = "#5F6B61";
  ctx.font = "600 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("TEAM NAME", cardX + 60, field1Y);

  ctx.fillStyle = "#172019";
  ctx.font = "900 32px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(data.teamName, cardX + 60, field1Y + 40);

  // Field 2: Division
  const field2Y = field1Y + rowHeight + 15;
  // Divider Line
  ctx.beginPath();
  ctx.moveTo(cardX + 60, field2Y - 15);
  ctx.lineTo(cardX + cardW - 60, field2Y - 15);
  ctx.stroke();

  ctx.fillStyle = "#5F6B61";
  ctx.font = "600 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("DIVISION / CATEGORY", cardX + 60, field2Y);

  ctx.fillStyle = "#172019";
  ctx.font = "800 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(data.categoryName, cardX + 60, field2Y + 38);

  // Field 3: Date Submitted
  if (data.submittedAt) {
    const formattedDate = new Date(data.submittedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const dateText = `Submitted on ${formattedDate}`;
    ctx.textAlign = "right";
    ctx.fillStyle = "#5F6B61";
    ctx.font = "500 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(dateText, cardX + cardW - 60, field2Y + 38);
  }

  // 7. Instructions Notice Box
  const noticeY = field2Y + 75;
  const noticeH = 145;
  const noticeW = cardW - 120;
  const noticeX = cardX + 60;

  ctx.fillStyle = "#EEF5EF";
  roundRect(ctx, noticeX, noticeY, noticeW, noticeH, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(32, 88, 35, 0.25)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, noticeX, noticeY, noticeW, noticeH, 18);
  ctx.stroke();

  // Notice Header
  ctx.textAlign = "left";
  ctx.fillStyle = "#205823";
  ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("📌 Official Instruction:", noticeX + 30, noticeY + 40);

  // Notice Message
  ctx.fillStyle = "#172019";
  ctx.font = "500 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const noticeText =
    "Please save this reference for your records. You may need it for future MVA inquiries or roster requests.";
  const noticeLines = wrapText(ctx, noticeText, noticeW - 60);
  let lineY = noticeY + 75;
  for (const line of noticeLines) {
    ctx.fillText(line, noticeX + 30, lineY);
    lineY += 28;
  }

  // 8. Bottom Association Footer Note
  ctx.textAlign = "center";
  ctx.fillStyle = "#8F9A91";
  ctx.font = "500 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(
    "Mahatao Volleyball Association • Official Tournament Entry Verification Reference",
    width / 2,
    cardY + cardH + 45
  );

  // 9. Convert Canvas to Blob and trigger download
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas to Blob conversion failed."));
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `MVA-Registration-${data.registrationCode}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      resolve();
    }, "image/png");
  });
}
