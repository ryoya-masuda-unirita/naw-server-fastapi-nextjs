# 抽出の比較（#494）

移植元（Apache POI 5.5.1・PDFBox 3.0.7。`spring-ai 1.1.7` → Tika 3.3.0 が引くバージョン）と、移植先の出力を、同じファイルで並べる。

1. `make_fixtures.py`: サンプル（docx・xlsx・pptx・pdf）を作る（`uv run --project generative-ai-core --with reportlab python make_fixtures.py <出力先>`）。`make_chrome_pdf.mjs` は、Chromium で日本語の表・段組みを含む PDF を作る
2. `Extract.java`: 移植元の各プロセッサの、テキスト抽出の部分だけをそのまま写したもの。POI・PDFBox の jar（`~/.m2`）をクラスパスに置いて `javac` / `java` で実行する
3. `compare.py`: 同じファイルを `Extract` と移植先のプロセッサで抽出し、一致を表示する

パスは作業時の `/tmp/claude-501/ex494/` を前提にしている。使うときは書き換える。
