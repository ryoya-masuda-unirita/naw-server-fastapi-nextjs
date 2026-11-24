import subprocess, sys, json
from pathlib import Path
from generative_ai_core.media import (CoreMediaPreprocessingRequest, ExcelCoreMediaProcessor, PdfCoreMediaProcessor,
    PowerPointCoreMediaProcessor, WordCoreMediaProcessor)
CP = ":".join(Path("/tmp/claude-501/ex494/jars.txt").read_text().split()) + ":/tmp/claude-501/ex494/java/out"
PROC = {".docx": WordCoreMediaProcessor, ".xlsx": ExcelCoreMediaProcessor, ".pptx": PowerPointCoreMediaProcessor, ".pdf": PdfCoreMediaProcessor}
res = {}
for f in sorted(Path("/tmp/claude-501/ex494/fx").iterdir()):
    java = subprocess.run(["java", "-cp", CP, "Extract", str(f)], capture_output=True).stdout.decode("utf-8", "replace")
    java = "".join(l for l in java.splitlines(True) if "Log4j API could not find" not in l)
    try:
        py = PROC[f.suffix]().process(CoreMediaPreprocessingRequest(f)).text
    except Exception as e:
        py = f"ERROR {e!r}"
    res[f.name] = {"java": java, "py": py, "same": java == py}
    print(("SAME " if java == py else "DIFF ") + f.name)
Path("/tmp/claude-501/ex494/result.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
