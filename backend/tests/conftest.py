import sys
from pathlib import Path

# backend ディレクトリを Python パスに追加
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))
