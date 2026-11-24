import java.io.*;
import java.nio.file.*;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xslf.usermodel.*;
import org.apache.poi.xssf.usermodel.*;
import org.apache.poi.xwpf.usermodel.*;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;

/** 移植元の各プロセッサの「テキスト抽出」の部分だけを、そのまま写したもの（画像の処理は含めない）。 */
public class Extract {
  public static void main(String[] a) throws Exception {
    Path p = Paths.get(a[0]);
    String n = p.getFileName().toString().toLowerCase();
    StringBuilder t = new StringBuilder();
    if (n.endsWith(".docx")) {
      try (InputStream in = Files.newInputStream(p); XWPFDocument d = new XWPFDocument(in)) {
        for (XWPFParagraph para : d.getParagraphs()) {
          String text = para.getText();
          if (!text.trim().isEmpty()) t.append(text).append("\n");
        }
      }
    } else if (n.endsWith(".xlsx")) {
      try (InputStream in = Files.newInputStream(p); XSSFWorkbook w = new XSSFWorkbook(in)) {
        for (int i = 0; i < w.getNumberOfSheets(); i++) {
          XSSFSheet s = w.getSheetAt(i);
          t.append("【シート名: ").append(s.getSheetName()).append("】\n");
          for (Row row : s) {
            for (Cell cell : row) {
              String c = cellString(cell);
              if (!c.isBlank()) t.append(c).append("\t");
            }
            t.append("\n");
          }
        }
      }
    } else if (n.endsWith(".pptx")) {
      try (InputStream in = Files.newInputStream(p); XMLSlideShow ppt = new XMLSlideShow(in)) {
        for (XSLFSlide slide : ppt.getSlides()) {
          for (XSLFShape shape : slide.getShapes()) {
            if (shape instanceof XSLFTextShape ts && !ts.getText().trim().isEmpty()) {
              t.append(ts.getText()).append("\n");
            }
          }
        }
      }
    } else if (n.endsWith(".pdf")) {
      try (PDDocument d = org.apache.pdfbox.Loader.loadPDF(new File(p.toString()))) {
        if (d.isEncrypted()) { System.out.print("ENCRYPTED_PDF"); return; }
        t.append(new PDFTextStripper().getText(d).trim());
      }
    }
    System.out.write(t.toString().getBytes("UTF-8"));
    System.out.flush();
  }

  static String cellString(Cell cell) {
    return switch (cell.getCellType()) {
      case STRING -> cell.getStringCellValue();
      case NUMERIC -> DateUtil.isCellDateFormatted(cell)
          ? cell.getDateCellValue().toString()
          : Double.toString(cell.getNumericCellValue());
      case BOOLEAN -> Boolean.toString(cell.getBooleanCellValue());
      case FORMULA -> cell.getCellFormula();
      default -> "";
    };
  }
}
