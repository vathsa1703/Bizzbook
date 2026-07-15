const { execFile } = require('child_process');
const path = require('path');
const Tesseract = require('tesseract.js');
const fs = require('fs');

const USE_PADDLE = true; // Flag to control default engine

/**
 * Run PaddleOCR via python script
 */
function runPaddleOCR(imagePath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../scripts/run_ocr.py');
    execFile('python', [scriptPath, imagePath], { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          resolve(result.text);
        } else {
          reject(new Error(result.error));
        }
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${stdout}`));
      }
    });
  });
}

/**
 * Run Tesseract.js
 */
async function runTesseract(imagePath) {
  const result = await Tesseract.recognize(imagePath, 'eng', {
    logger: m => {} // suppress logs
  });
  return result.data.text;
}

/**
 * Extract text from an image using the preferred OCR engine.
 * Falls back to Tesseract if PaddleOCR fails.
 */
async function extractTextFromImage(imagePath) {
  if (USE_PADDLE) {
    try {
      console.log(`[OCR] Running PaddleOCR on ${imagePath}...`);
      const text = await runPaddleOCR(imagePath);
      console.log(`[OCR] PaddleOCR successful`);
      return text;
    } catch (err) {
      console.warn(`[OCR] PaddleOCR failed, falling back to Tesseract. Error: ${err.message}`);
      // Fallback
    }
  }

  console.log(`[OCR] Running Tesseract on ${imagePath}...`);
  return await runTesseract(imagePath);
}

module.exports = {
  extractTextFromImage
};
