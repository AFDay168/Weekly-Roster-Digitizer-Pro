
import { GoogleGenAI, Type } from "@google/genai";
import { StaffMember, GeminiRosterOutput } from "../types";

export const processRosterImages = async (
  imagesBase64: string[],
  staffList: StaffMember[],
  startDate: string
): Promise<GeminiRosterOutput> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Create a structured list of staff for context
  const staffListContext = staffList.map(s => `- Full: "${s.fullName}", Display: "${s.displayName}"`).join('\n');

  const prompt = `
    Analyze the attached handwritten weekly roster photos. 
    The roster is a weekly planner starting from Monday.
    THE FIRST DAY (MONDAY) OF THIS ROSTER IS: ${startDate}.
    
    CRITICAL INSTRUCTIONS FOR OCR & DATA EXTRACTION:
    
    1. DATE LOGIC:
       - Columns represent Monday to Sunday.
       - Start Date: ${startDate} (Monday).
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

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        ...imagesBase64.map(data => ({
          inlineData: {
            mimeType: 'image/jpeg',
            data: data.split(',')[1] || data
          }
        })),
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          entries: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING, description: "yyyy/mm/dd" },
                rawIn: { type: Type.STRING, description: "hh:mm" },
                rawOut: { type: Type.STRING, description: "hh:mm" },
                name: { type: Type.STRING, description: "Matched name based on rules" },
                originalHandwriting: { type: Type.STRING, description: "Raw text seen" }
              },
              required: ["date", "rawIn", "rawOut", "name"]
            }
          }
        }
      }
    }
  });

  try {
    const text = response.text || '{"entries": []}';
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return { entries: [] };
  }
};
