import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export async function extractFirstPageText(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    if (pdf.numPages === 0) {
      throw new Error("PDF has no pages");
    }

    // Only get the first page to save tokens and time
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    
    // Concatenate text items
    const text = textContent.items
      .map((item: any) => item.str)
      .join(' ');
      
    return text.substring(0, 3000); // Limit to 3000 characters just to be safe
  } catch (error) {
    console.error("Error extracting PDF text:", error);
    throw new Error("Failed to extract text from PDF");
  }
}
