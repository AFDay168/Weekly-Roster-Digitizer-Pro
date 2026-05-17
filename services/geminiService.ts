import { StaffMember, GeminiRosterOutput } from "../types";

export const processRosterImages = async (
  imagesBase64: string[],
  staffList: StaffMember[],
  startDate: string
): Promise<GeminiRosterOutput> => {
  try {
    // Convert base64 to files
    const files = await Promise.all(
      imagesBase64.map(async (base64, index) => {
        const response = await fetch(base64);
        const blob = await response.blob();
        return new File([blob], `image${index}.jpg`, { type: 'image/jpeg' });
      })
    );

    const formData = new FormData();
    files.forEach(file => formData.append('images', file));
    formData.append('staffList', JSON.stringify(staffList));
    formData.append('startDate', startDate);

    const apiResponse = await fetch('/api/ocr', {
      method: 'POST',
      body: formData,
    });

    if (!apiResponse.ok) {
      const error = await apiResponse.json();
      throw new Error(error.error || 'OCR failed');
    }

    const result = await apiResponse.json();
    return result;
    
  } catch (e) {
    console.error("OCR Error:", e);
    alert(`OCR Error: ${e instanceof Error ? e.message : String(e)}`);
    return { entries: [] };
  }
};