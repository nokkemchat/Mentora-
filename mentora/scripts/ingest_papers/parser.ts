export interface ParsedPaper {
  curriculum: string;
  subject: string;
  grade_level: string;
  year: number;
  session: string;
  type: string;
  paper_number: number | null;
  variant: string | null;
  filename: string;
}

export function parseFilename(filename: string): ParsedPaper | null {
  // Typical Cambridge format: 9709_w23_qp_11.pdf or 0420_s21_ms_2.pdf
  const basename = filename.replace(/\.pdf$/i, '');
  const parts = basename.split('_');
  
  if (parts.length < 3) return null; // Not a standard Cambridge format

  const subjectCode = parts[0];
  const sessionCode = parts[1]; // e.g. w23, s21, m22
  const typeCode = parts[2].toLowerCase(); // qp, ms, in, er, gt
  const paperVariant = parts[3] || null; // e.g. 11, 2, 42

  // Only ingest question papers and marking schemes
  if (typeCode !== 'qp' && typeCode !== 'ms') {
    return null; 
  }

  // Parse session code (e.g., "w23" -> November 2023)
  let session = 'Unknown';
  let year = 2000;
  if (sessionCode.length === 3) {
    const s = sessionCode.charAt(0).toLowerCase();
    const y = parseInt(sessionCode.substring(1), 10);
    
    if (s === 'w') session = 'November';
    else if (s === 's') session = 'June';
    else if (s === 'm') session = 'March';
    
    year = 2000 + y;
  }

  // Parse paper and variant
  let paper_number = null;
  let variant = null;
  if (paperVariant) {
    if (paperVariant.length === 2) {
      paper_number = parseInt(paperVariant.charAt(0), 10);
      variant = paperVariant.charAt(1);
    } else if (paperVariant.length === 1) {
      paper_number = parseInt(paperVariant, 10);
    }
  }

  // Basic curriculum mapping based on code
  // This is a naive mapping; in a real scenario you'd have a dictionary of subject codes
  let grade_level = 'O-Level';
  if (subjectCode.startsWith('9')) {
    grade_level = 'A-Level';
  } else if (subjectCode.startsWith('8')) {
    grade_level = 'AS-Level';
  } else if (subjectCode.startsWith('04')) {
    grade_level = 'IGCSE';
  }

  return {
    curriculum: 'CAIE',
    subject: `Subject ${subjectCode}`, // Placeholder, would ideally lookup real subject name
    grade_level,
    year,
    session,
    type: typeCode,
    paper_number: isNaN(paper_number as any) ? null : paper_number,
    variant,
    filename
  };
}
