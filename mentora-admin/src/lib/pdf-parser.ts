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

/**
 * Renders all pages of a PDF into high-resolution JPG images for vision-based marking.
 */
export async function renderPdfToPageImages(file: File): Promise<{ file: File; name: string }[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: { file: File; name: string }[] = [];
    const baseName = file.name.replace(/\.pdf$/i, '');

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.8 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      await (page.render({ canvasContext: ctx, viewport } as any) as any).promise;
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.88));
      if (blob) {
        const pageFileName = `${baseName}_page_${pageNum}.jpg`;
        const pageFile = new File([blob], pageFileName, { type: 'image/jpeg' });
        pages.push({ file: pageFile, name: pageFileName });
      }
    }

    return pages;
  } catch (error) {
    console.error('Error rendering PDF pages to images:', error);
    throw error;
  }
}
