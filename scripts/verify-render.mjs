import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const screenshotDir = path.join(rootDir, "artifacts", "render-checks");
const gameUrl = process.env.GAME_URL || "http://127.0.0.1:5173/";
const edgePath =
  process.env.PLAYWRIGHT_EDGE_PATH ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const viewports = [
  { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
];

await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: edgePath,
  args: ["--disable-dev-shm-usage"],
});

const results = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
    });
    const page = await context.newPage();
    const runtimeErrors = [];

    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    await page.goto(gameUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Start Run" }).click();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1300);

    const canvasStats = await page.evaluate(() => {
      const canvas = document.querySelector("#game-canvas");
      if (!canvas) return { error: "Canvas not found" };
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) return { error: "WebGL context not available" };

      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const factors = [0.2, 0.35, 0.5, 0.65, 0.8];
      const samples = [];
      const unique = new Set();
      let nonBlack = 0;

      for (const fx of factors) {
        for (const fy of factors) {
          const pixel = new Uint8Array(4);
          gl.readPixels(
            Math.max(0, Math.min(width - 1, Math.floor(width * fx))),
            Math.max(0, Math.min(height - 1, Math.floor(height * fy))),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixel
          );
          const [r, g, b, a] = pixel;
          if (a > 0 && r + g + b > 28) nonBlack += 1;
          unique.add(`${r >> 4},${g >> 4},${b >> 4},${a >> 4}`);
          samples.push([r, g, b, a]);
        }
      }

      return {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        drawingBufferWidth: width,
        drawingBufferHeight: height,
        nonBlack,
        uniqueColors: unique.size,
        samples,
      };
    });

    const distanceText = await page.locator("#distance").innerText();
    const screenshotPath = path.join(screenshotDir, `${viewport.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    if (canvasStats.error) {
      throw new Error(`${viewport.name}: ${canvasStats.error}`);
    }
    if (canvasStats.nonBlack < 10 || canvasStats.uniqueColors < 3) {
      throw new Error(
        `${viewport.name}: canvas appears blank or too flat (${JSON.stringify(canvasStats)})`
      );
    }
    if (runtimeErrors.length > 0) {
      throw new Error(`${viewport.name}: browser errors: ${runtimeErrors.join(" | ")}`);
    }

    results.push({
      viewport: viewport.name,
      distanceText,
      screenshotPath,
      canvasStats: {
        drawingBufferWidth: canvasStats.drawingBufferWidth,
        drawingBufferHeight: canvasStats.drawingBufferHeight,
        nonBlack: canvasStats.nonBlack,
        uniqueColors: canvasStats.uniqueColors,
      },
    });

    await context.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
