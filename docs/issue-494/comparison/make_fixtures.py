"""比較用のサンプルを作る（この作成に使ったライブラリの癖に寄らないよう、生の XML も混ぜる）。"""
import datetime, io, sys, zipfile
from pathlib import Path
import docx, openpyxl, pptx
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls
from pptx.util import Inches
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

out = Path(sys.argv[1])
out.mkdir(exist_ok=True)

# --- Word ---
d = docx.Document()
d.add_paragraph("見出しのある文書", style="Heading 1")
d.add_paragraph("通常の段落です。")
d.add_paragraph("")
d.add_paragraph("   ")
p = d.add_paragraph("タブ\tの後と")
p.add_run("\n改行（br）の後")
p = d.add_paragraph("リンク: ")
p._p.append(parse_xml(f'<w:hyperlink {nsdecls("w")} w:anchor="x"><w:r><w:t>内部リンクの文字</w:t></w:r></w:hyperlink>'))
p = d.add_paragraph("変更履歴: ")
p._p.append(parse_xml(f'<w:ins {nsdecls("w")} w:id="1" w:author="a"><w:r><w:t>挿入された文字</w:t></w:r></w:ins>'))
p._p.append(parse_xml(f'<w:del {nsdecls("w")} w:id="2" w:author="a"><w:r><w:delText>削除された文字</w:delText></w:r></w:del>'))
p = d.add_paragraph("")
p._p.append(parse_xml(f'<w:sdt {nsdecls("w")}><w:sdtContent><w:r><w:t>コンテンツコントロールの文字</w:t></w:r></w:sdtContent></w:sdt>'))
p = d.add_paragraph("フィールド: ")
p._p.append(parse_xml(f'<w:r {nsdecls("w")}><w:fldChar w:fldCharType="begin"/></w:r>'))
p._p.append(parse_xml(f'<w:r {nsdecls("w")}><w:instrText> PAGE </w:instrText></w:r>'))
p._p.append(parse_xml(f'<w:r {nsdecls("w")}><w:fldChar w:fldCharType="separate"/></w:r>'))
p._p.append(parse_xml(f'<w:r {nsdecls("w")}><w:t>7</w:t></w:r>'))
p._p.append(parse_xml(f'<w:r {nsdecls("w")}><w:fldChar w:fldCharType="end"/></w:r>'))
d.add_paragraph("箇条書き1", style="List Bullet")
d.add_paragraph("箇条書き2", style="List Bullet")
t = d.add_table(rows=2, cols=2)
for i, row in enumerate(t.rows):
    for j, c in enumerate(row.cells):
        c.text = f"表{i}{j}"
d.add_paragraph("表の後の段落")
d.sections[0].header.paragraphs[0].text = "ヘッダーの文字"
d.sections[0].footer.paragraphs[0].text = "フッターの文字"
d.add_paragraph("𠮷野家 ① ㈱ ｶﾀｶﾅ emoji😀")
d.save(out / "word.docx")

# --- Excel ---
wb = openpyxl.Workbook()
ws = wb.active; ws.title = "売上"
ws.append(["品目", "数量", "単価", "合計", "日付", "真偽", "備考"])
ws.append(["りんご", 3, 120.5, "=B2*C2", datetime.datetime(2026, 1, 2, 3, 4, 5), True, None])
ws.append(["みかん", 1000000, 0.1, "=B3*C3", datetime.date(2026, 12, 31), False, "   "])
ws.append(["", None, 1e-7, 12345678901234, datetime.datetime(2026, 1, 2), None, "改行\nあり"])
ws.append([1.0, 100, 1.5e20, "=SUM(B2:B4)", None, None, "タブ\tあり"])
ws.merge_cells("A7:C7"); ws["A7"] = "結合セル"
ws["E8"] = 0.1 + 0.2
ws2 = wb.create_sheet("空のシート")
ws3 = wb.create_sheet("2つ目")
ws3["B3"] = "B3だけ"; ws3["D5"] = "D5だけ"
wb.save(out / "excel.xlsx")

# --- PowerPoint ---
prs = pptx.Presentation()
s = prs.slides.add_slide(prs.slide_layouts[1])
s.shapes.title.text = "タイトルスライド"
s.placeholders[1].text = "箇条書き1\n箇条書き2\n\n空行の後"
s2 = prs.slides.add_slide(prs.slide_layouts[5])
s2.shapes.title.text = "表のスライド"
tbl = s2.shapes.add_table(2, 2, Inches(1), Inches(2), Inches(4), Inches(1)).table
for i in range(2):
    for j in range(2): tbl.cell(i, j).text = f"セル{i}{j}"
s3 = prs.slides.add_slide(prs.slide_layouts[6])
g = s3.shapes.add_group_shape()
tb = g.shapes.add_textbox(Inches(1), Inches(1), Inches(3), Inches(1)); tb.text_frame.text = "グループ内の文字"
tb2 = s3.shapes.add_textbox(Inches(1), Inches(3), Inches(3), Inches(1))
tb2.text_frame.text = "段落1"; tb2.text_frame.add_paragraph().text = "段落2"
tb2.text_frame.paragraphs[1].add_line_break(); tb2.text_frame.paragraphs[1].add_run().text = "br後"
s3.notes_slide.notes_text_frame.text = "ノートの文字"
prs.save(out / "ppt.pptx")

# --- PDF ---
pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
c = canvas.Canvas(str(out / "pdf_ja.pdf"), pagesize=A4)
c.setFont("HeiseiKakuGo-W5", 12)
c.drawString(72, 780, "日本語の見出し")
c.drawString(72, 760, "本文の1行目です。続けて2行目を書きます。")
c.drawString(72, 740, "Name"); c.drawString(200, 740, "Qty"); c.drawString(300, 740, "Price")
c.drawString(72, 720, "りんご"); c.drawString(200, 720, "3"); c.drawString(300, 720, "120")
c.drawString(72, 700, "A  B   C    D (spaces)")
c.showPage()
c.setFont("HeiseiKakuGo-W5", 12); c.drawString(72, 780, "2ページ目の文字"); c.drawString(300, 780, "右側の列")
c.drawString(72, 760, "ハイフ-\nネーション")
c.showPage(); c.save()
c = canvas.Canvas(str(out / "pdf_en.pdf"), pagesize=A4)
c.setFont("Helvetica", 11)
for i, line in enumerate(["Hello world", "Second line of text", "Col1      Col2      Col3", "x   y   z"]):
    c.drawString(72, 780 - i * 16, line)
c.save()
c = canvas.Canvas(str(out / "pdf_empty.pdf"), pagesize=A4); c.showPage(); c.save()
