import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { DocumentState } from '../types';

export async function exportToPdf(docState: DocumentState): Promise<void> {
  const previewEl = document.getElementById('document-preview');

  if (!previewEl) {
    throw new Error('Document preview element not found');
  }

  // Apply print styles temporarily
  const originalOverflow = previewEl.style.overflow;
  const originalHeight = previewEl.style.height;
  const originalMaxHeight = previewEl.style.maxHeight;

  previewEl.style.overflow = 'visible';
  previewEl.style.height = 'auto';
  previewEl.style.maxHeight = 'none';

  try {
    const canvas = await html2canvas(previewEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pdf = new jsPDF('p', 'mm', 'a4');
    let heightLeft = imgHeight;
    let position = 0;

    // First page
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Additional pages
    while (heightLeft > 0) {
      position = position - pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const fileDate = new Date().toISOString().split('T')[0];
    const safeName = (docState.meta.projectTitle || 'Untitled').replace(
      /[^a-zA-Z0-9 ]/g,
      ''
    );
    pdf.save(`${safeName}_${docState.meta.type}_${fileDate}.pdf`);
  } finally {
    // Restore styles
    previewEl.style.overflow = originalOverflow;
    previewEl.style.height = originalHeight;
    previewEl.style.maxHeight = originalMaxHeight;
  }
}
