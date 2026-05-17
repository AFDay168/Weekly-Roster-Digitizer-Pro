import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('dist'));

// OCR endpoint
app.post('/api/ocr', upload.array('images', 10), async (req, res) => {
  try {
    const { staffList, startDate } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    // Convert files to base64
    const imagesBase64 = files.map(file => {
      const imageBuffer = fs.readFileSync(file.path);
      return `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
    });

    // Clean up temp files
    files.forEach(file => {
      fs.unlinkSync(file.path);
    });

    const genAI = new GoogleGenerativeAI(process.env.VITE_API_KEY);
    const model = genAI.getGenerativeModel({
        model: 'gemini-pro',
        generationConfig: { responseMimeType: 'application/json' },
      });

    // Create staff list context
    const staffListContext = JSON.parse(staffList || '[]')
      .map(s => `- Full: "${s.fullName}", Display: "${s.displayName}"`)
      .join('\n');

    const prompt = `
      Analyze the attached handwritten weekly roster photos. 
      The roster is a weekly planner starting from Monday.
      THE FIRST DAY (MONDAY) OF THIS ROSTER IS: ${startDate || 'today'}.
      
      CRITICAL INSTRUCTIONS FOR OCR & DATA EXTRACTION:
      
      1. DATE LOGIC:
         - Columns represent Monday to Sunday.
         - Start Date: ${startDate || 'today'} (Monday).
         - Ensure you capture EVERY entry in each column. Do not skip lines.
      
      2. NAME MATCHING & EXCEPTIONS:
         - Match handwriting to the staff list provided below.
         - FUZZY MATCH: If handwriting says "Bella", match it to "Belle Chan Cheuk Yiu" (Display: "Belle Chan").
         - SPECIFIC FIX: "Mel" is a distinct name. Do NOT misidentify "Mel" as "Alice Chiu".
         - SPECIFIC FIX: Ensure "Suki" is captured (especially in Thursday column).
         - CLARA LOGIC:
           a) If handwriting is "Clara CKM", match to "Clara Cheung Ka Man" and output Name as "Clara CKM".
           b) If handwriting is just "Clara", match to "Clara Cheung Wing Kum" and output Name as "Clara Cheung" (first 2 words).
         - NORMAL RULE: For all other matches, output the "Display" name (first 2 words of full name).
      
      3. TIME CONVERSION (Must be 24-Hour hh:mm):
         - "1-7" -> 13:00 to 19:00
         - "3:30-7" -> 15:30 to 19:00
         - "2:30-7" -> 14:30 to 19:00
         - "9:30-1:30" -> 09:30 to 13:30
         - "9:30-1" -> 09:30 to 13:00
         - Afternoon/Evening shifts (1 to 7) are always PM (13:00-19:00).
      
      4. KNOWN PATTERNS TO LOOK FOR:
         - Wednesday: "3:30-7 Mel"
         - Thursday: "3:30-7 Suki" followed by "3:30-7 Mel"
         - Friday: "2:30-7 Holly"
         - Saturday: "9:30-1:30 Oscar", "9:30-1:30 Henry", "9:30-1:30 Holly", "9:30-1 Loretta" (or "Loretta 9:30-1")
      
      STAFF LIST:
      ${staffListContext}
      
      IGNORE crossed-out text. 
      Return strictly JSON with "entries" array.
    `;

    const response = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          ...imagesBase64.map(data => ({
            inlineData: {
              mimeType: 'image/jpeg',
              data: data.split(',')[1] || data,
            }
          })),
          { text: prompt },
        ],
      }],
    });

    let result;
    try {
      const text = response.response.text() || '{"entries": []}';
      result = JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse Gemini response", e);
      result = { entries: [] };
    }

    res.json(result);
    
  } catch (error) {
    console.error("OCR API Error:", error);
    res.status(500).json({ 
      error: error.message,
      entries: [] 
    });
  }
});

// Serve frontend for any other route
app.get('/*path', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});