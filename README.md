# PDF2ImageFill API

A Node.js API for converting PDFs to images and drawing on images to create filled PDFs. Works with broken/non-standard PDFs by operating at the image level.

## Features

- **Cross-platform**: Uses pure JavaScript libraries (pdfjs-dist) that work on Windows, Linux, and macOS
- **PDF to Images**: Convert any PDF to PNG images (one per page)
- **Draw on Images**: Add text and checkboxes at specific coordinates
- **Images to PDF**: Combine annotated images back into a PDF
- **Binary I/O**: Designed for n8n integration with binary data support

## Installation

```bash
npm install
```

## Running the Server

```bash
npm start
```

The server runs on port 3000 by default. Set `PORT` environment variable to change it.

## API Endpoints

### 1. POST /pdf-to-images

Converts a PDF file to images (one per page).

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: PDF file as `pdf` field

**Response:**
```json
{
  "success": true,
  "pageCount": 3,
  "images": [
    {
      "page": 1,
      "image": "base64_encoded_png_data...",
      "width": 1700,
      "height": 2200
    },
    {
      "page": 2,
      "image": "base64_encoded_png_data...",
      "width": 1700,
      "height": 2200
    }
  ]
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/pdf-to-images \
  -F "pdf=@input.pdf"
```

### 2. POST /images-to-pdf

Draws text and checkboxes on images and creates a PDF.

**Request:**
- Method: `POST`
- Content-Type: `application/json`
- Body:
```json
{
  "images": [
    {
      "page": 1,
      "image": "base64_encoded_png_data..."
    },
    {
      "page": 2,
      "image": "base64_encoded_png_data..."
    }
  ],
  "annotations": [
    {
      "page": 1,
      "x": 100,
      "y": 200,
      "text": "John Doe",
      "fontSize": 16,
      "fontFamily": "Arial",
      "color": "black"
    },
    {
      "page": 1,
      "x": 150,
      "y": 300,
      "type": "checkbox",
      "size": 20
    },
    {
      "page": 2,
      "x": 200,
      "y": 400,
      "text": "Some text on page 2"
    }
  ]
}
```

**Response:**
- Binary PDF file

**Annotation Fields:**
- `page` (required): Page number (1-indexed)
- `x` (required): X coordinate in pixels
- `y` (required): Y coordinate in pixels
- `text`: Text to draw (for text annotations)
- `type`: Set to "checkbox" or "checkmark" for checkboxes
- `fontSize`: Font size (default: 14)
- `fontFamily`: Font family (default: "Arial")
- `color`: Text color (default: "black")
- `size`: Checkbox size in pixels (default: 20)

**cURL Example:**
```bash
curl -X POST http://localhost:3000/images-to-pdf \
  -H "Content-Type: application/json" \
  -d @request.json \
  --output output.pdf
```

## n8n Integration

### Workflow Example

#### Step 1: Convert PDF to Images

1. Add HTTP Request node
2. Configure:
   - Method: `POST`
   - URL: `http://your-server:3000/pdf-to-images`
   - Send Binary File: `On`
   - Binary Property: Your PDF binary data
   - Response Format: `JSON`

The response will contain an array of base64-encoded images.

#### Step 2: Prepare Annotations

Add a Function node to create the annotations JSON:

```javascript
// Get images from previous step
const images = $input.item.json.images;

// Define your annotations
const annotations = [
  {
    page: 1,
    x: 100,
    y: 200,
    text: "John Doe",
    fontSize: 16
  },
  {
    page: 1,
    x: 150,
    y: 300,
    type: "checkbox"
  }
];

return {
  json: {
    images: images,
    annotations: annotations
  }
};
```

#### Step 3: Create Filled PDF

1. Add HTTP Request node
2. Configure:
   - Method: `POST`
   - URL: `http://your-server:3000/images-to-pdf`
   - Send Body: `On`
   - Body Content Type: `JSON`
   - Specify Body: Use expression from previous node
   - Response Format: `File`

The response will be a binary PDF file.

## Complete Workflow Example

```javascript
// n8n workflow JSON structure
{
  "nodes": [
    {
      "name": "Read PDF",
      "type": "n8n-nodes-base.readBinaryFile"
    },
    {
      "name": "Convert to Images",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "http://localhost:3000/pdf-to-images",
        "sendBinaryData": true,
        "binaryPropertyName": "data"
      }
    },
    {
      "name": "Add Annotations",
      "type": "n8n-nodes-base.function",
      "parameters": {
        "functionCode": "const images = $input.item.json.images;\nreturn { json: { images, annotations: [{page: 1, x: 100, y: 200, text: 'Filled!'}] } };"
      }
    },
    {
      "name": "Create PDF",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "http://localhost:3000/images-to-pdf",
        "responseFormat": "file"
      }
    }
  ]
}
```

## Finding X/Y Coordinates

To find the correct coordinates for your annotations:

1. Use the `/pdf-to-images` endpoint to get images
2. Open the images in an image editor (GIMP, Photoshop, etc.)
3. Hover over the location where you want to place text/checkbox
4. Note the X and Y coordinates (origin is top-left corner)
5. Use those coordinates in your annotations

Alternatively, create a small test script to overlay a grid on your images.

## Notes

- The PDF scale is set to 2.0 for better image quality (you can modify this in server.js line 55)
- Text Y coordinate is the baseline of the text, not the top
- Checkbox coordinates are the top-left corner
- Large PDFs may take some time to process
- Increase the JSON limit if you have many large images (currently set to 50mb)

## Troubleshooting

**PDF won't convert:**
- Ensure the PDF file is not corrupted
- Check server logs for specific error messages

**Text appears in wrong position:**
- Remember Y coordinate is baseline for text
- Adjust fontSize if text appears too large/small
- Use image editor to verify exact coordinates

**Server crashes with large PDFs:**
- Increase Node.js memory: `node --max-old-space-size=4096 server.js`
- Reduce image scale in server.js (line 55)

## License

MIT
