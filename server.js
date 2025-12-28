const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// Import pdfjs-dist
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Temporary directory for processing
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Clean up temp files
function cleanupTempFiles(directory) {
  try {
    const files = fs.readdirSync(directory);
    files.forEach(file => {
      const filePath = path.join(directory, file);
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

// Endpoint 1: Convert PDF to images using pdfjs-dist
app.post('/pdf-to-images', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    // Load PDF from buffer
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(req.file.buffer)
    });

    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;
    const images = [];

    // Process each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 }); // 2x scale for better quality

      // Create canvas
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');

      // Render PDF page to canvas
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      // Convert canvas to PNG buffer
      const imageBuffer = canvas.toBuffer('image/png');

      images.push({
        page: pageNum,
        image: imageBuffer.toString('base64'),
        width: Math.floor(viewport.width),
        height: Math.floor(viewport.height)
      });
    }

    // Return images as JSON with base64 encoded data
    res.json({
      success: true,
      pageCount: images.length,
      images: images
    });

  } catch (error) {
    console.error('Error converting PDF to images:', error);
    res.status(500).json({
      error: 'Failed to convert PDF to images',
      details: error.message
    });
  }
});

// Endpoint 2: Draw on images and convert to PDF
app.post('/images-to-pdf', express.json({ limit: '50mb' }), async (req, res) => {
  let tempImages = [];
  let tempPdfPath = null;

  try {
    const { images, annotations } = req.body;

    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ error: 'Images array required' });
    }

    if (!annotations || !Array.isArray(annotations)) {
      return res.status(400).json({ error: 'Annotations array required' });
    }

    const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const processedImages = [];

    // Process each image with annotations
    for (let i = 0; i < images.length; i++) {
      const imageData = images[i];
      const pageAnnotations = annotations.filter(a => a.page === (i + 1));

      // Decode base64 image
      const imageBuffer = Buffer.from(imageData.image || imageData, 'base64');

      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();

      // Create SVG overlay for text and checkboxes
      let svgOverlay = '<svg width="' + metadata.width + '" height="' + metadata.height + '">';

      for (const annotation of pageAnnotations) {
        const { x, y, text, type } = annotation;

        if (type === 'checkbox' || type === 'checkmark') {
          // Draw checkbox/checkmark
          const size = annotation.size || 20;
          svgOverlay += `
            <rect x="${x}" y="${y}" width="${size}" height="${size}"
                  stroke="black" stroke-width="2" fill="none"/>
            <line x1="${x}" y1="${y}" x2="${x + size}" y2="${y + size}"
                  stroke="black" stroke-width="2"/>
            <line x1="${x + size}" y1="${y}" x2="${x}" y2="${y + size}"
                  stroke="black" stroke-width="2"/>
          `;
        } else {
          // Draw text
          const fontSize = annotation.fontSize || 14;
          const fontFamily = annotation.fontFamily || 'Arial';
          const color = annotation.color || 'black';

          svgOverlay += `
            <text x="${x}" y="${y}"
                  font-family="${fontFamily}"
                  font-size="${fontSize}"
                  fill="${color}">${escapeXml(text || '')}</text>
          `;
        }
      }

      svgOverlay += '</svg>';

      // Composite SVG onto image
      const processedBuffer = await sharp(imageBuffer)
        .composite([{
          input: Buffer.from(svgOverlay),
          top: 0,
          left: 0
        }])
        .png()
        .toBuffer();

      processedImages.push({
        buffer: processedBuffer,
        width: metadata.width,
        height: metadata.height
      });
    }

    // Create PDF from processed images
    tempPdfPath = path.join(TEMP_DIR, `${requestId}.pdf`);
    const pdfStream = fs.createWriteStream(tempPdfPath);
    const pdfDoc = new PDFDocument({ autoFirstPage: false });

    pdfDoc.pipe(pdfStream);

    for (const img of processedImages) {
      pdfDoc.addPage({ size: [img.width, img.height] });
      pdfDoc.image(img.buffer, 0, 0, {
        width: img.width,
        height: img.height
      });
    }

    pdfDoc.end();

    // Wait for PDF to be written
    await new Promise((resolve, reject) => {
      pdfStream.on('finish', resolve);
      pdfStream.on('error', reject);
    });

    // Read and send PDF as binary
    const pdfBuffer = fs.readFileSync(tempPdfPath);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="output.pdf"');
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error creating PDF from images:', error);
    res.status(500).json({
      error: 'Failed to create PDF from images',
      details: error.message
    });
  } finally {
    // Cleanup
    if (tempPdfPath && fs.existsSync(tempPdfPath)) {
      fs.unlinkSync(tempPdfPath);
    }
  }
});

// Helper function to escape XML special characters
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'PDF2ImageFill API is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PDF2ImageFill API running on port ${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  POST /pdf-to-images - Convert PDF to images`);
  console.log(`  POST /images-to-pdf - Draw on images and create PDF`);
  console.log(`  GET  /health - Health check`);
});
