import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageNumber,
  Footer,
  Header,
  NumberFormat,
} from 'docx';
import { saveAs } from 'file-saver';
import { DocumentState } from '../types';

export async function exportToDocx(docState: DocumentState): Promise<void> {
  const { meta, sections } = docState;
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const fileDate = new Date().toISOString().split('T')[0];
  const safeName = (meta.projectTitle || 'Untitled').replace(
    /[^a-zA-Z0-9 ]/g,
    ''
  );

  // Build title page
  const titlePageChildren: Paragraph[] = [
    new Paragraph({ spacing: { before: 3000 } }),
    new Paragraph({
      children: [
        new TextRun({
          text:
            meta.type === 'RFI'
              ? 'REQUEST FOR INFORMATION'
              : 'REQUEST FOR PROPOSAL',
          size: 28,
          bold: true,
          color: '4F46E5',
        }),
      ],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ spacing: { before: 400 } }),
    new Paragraph({
      children: [
        new TextRun({
          text: meta.projectTitle || 'Untitled Project',
          size: 48,
          bold: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ spacing: { before: 400 } }),
    new Paragraph({
      children: [
        new TextRun({
          text: meta.issuingOrganization || '',
          size: 24,
          color: '666666',
        }),
      ],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: dateStr,
          size: 20,
          color: '999999',
        }),
      ],
      alignment: AlignmentType.CENTER,
    }),
  ];

  // Build section paragraphs
  const sectionParagraphs: Paragraph[] = [];

  sections
    .filter((s) => s.title !== 'Cover Page' && s.content.trim())
    .sort((a, b) => a.order - b.order)
    .forEach((section) => {
      // Section heading (## level)
      sectionParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: section.title,
              bold: true,
              size: 28,
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
        })
      );

      // Section content — process line by line to handle subsections + numbered lists
      const lines = section.content.split('\n');
      let i = 0;

      while (i < lines.length) {
        const line = lines[i].trim();

        if (!line) {
          i++;
          continue;
        }

        // Handle ### subsection headings
        if (line.startsWith('### ')) {
          const subsectionTitle = line.replace(/^###\s+/, '');
          sectionParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: subsectionTitle,
                  bold: true,
                  size: 24,
                }),
              ],
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 300, after: 150 },
            })
          );
          i++;
          continue;
        }

        // Handle numbered lists (e.g. "1. Question text")
        const numberedMatch = line.match(/^(\d+)\.\s+(.+)/);
        if (numberedMatch) {
          const text = numberedMatch[2];
          sectionParagraphs.push(
            new Paragraph({
              children: parseBoldText(text),
              numbering: { reference: 'default-numbering', level: 0 },
              spacing: { after: 80 },
            })
          );
          i++;
          continue;
        }

        // Handle bullet points
        if (line.startsWith('- ') || line.startsWith('* ')) {
          const text = line.replace(/^[-*]\s*/, '').trim();
          if (text) {
            sectionParagraphs.push(
              new Paragraph({
                children: parseBoldText(text),
                bullet: { level: 0 },
                spacing: { after: 80 },
              })
            );
          }
          i++;
          continue;
        }

        // Regular paragraph — handle bold text inline
        sectionParagraphs.push(
          new Paragraph({
            children: parseBoldText(line),
            spacing: { after: 120 },
          })
        );
        i++;
      }
    });

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: [
            {
              level: 0,
              format: NumberFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: meta.projectTitle || '',
                    size: 16,
                    color: '999999',
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ children: [PageNumber.CURRENT], size: 18 }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [...titlePageChildren, ...sectionParagraphs],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${safeName}_${meta.type}_${fileDate}.docx`);
}

/**
 * Parse markdown bold (**text**) into TextRun objects
 */
function parseBoldText(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Text before the bold
    if (match.index > lastIndex) {
      runs.push(
        new TextRun({
          text: text.substring(lastIndex, match.index),
          size: 22,
        })
      );
    }
    // Bold text
    runs.push(
      new TextRun({
        text: match[1],
        size: 22,
        bold: true,
      })
    );
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last bold
  if (lastIndex < text.length) {
    runs.push(
      new TextRun({
        text: text.substring(lastIndex),
        size: 22,
      })
    );
  }

  // If no bold found, return the whole text
  if (runs.length === 0) {
    runs.push(new TextRun({ text, size: 22 }));
  }

  return runs;
}
