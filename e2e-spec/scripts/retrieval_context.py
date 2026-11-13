"""検索アダプタだけを動かし、書き出された RAG Context JSON を標準出力に出す。

結合テスト項目書 22（Waha!生成AI検索）の「context.json の中身」を確かめるための補助。
Waha! エミュレーターの RAG ワークフローは、検索アダプタの出力を生成AIアダプタに渡してジョブのディレクトリごと消すため、
同じ呼び出し（エミュレーターの `_run_retrieval` と同じ順序）を、`waha-emulator/` の仮想環境で再現する。

使い方: `waha-emulator/.venv/bin/python retrieval_context.py <workflows.json> <サービスID> <検索文字列>`
"""

import json
import sys
import tempfile
from pathlib import Path

from retrieval_adapter.app import App as RetrievalApp
from retrieval_adapter.constants import OUT_MODE_RAG_CONTEXT_JSON_V1
from waha_emulator.workflow_config import parse_workflow_config
from waha_emulator.workflows.generative_ai import _build_retrieval_job

EXPECTED_ARGUMENT_COUNT = 4
USAGE = "usage: retrieval_context.py <workflows.json> <service_id> <question>"


def main(argv: list[str]) -> int:
    """検索アダプタを動かし、RAG Context JSON を標準出力に出す。

    Parameters
    ----------
    argv : list[str]
        コマンドライン引数（スクリプト名、サービス定義の JSON、サービス ID、検索文字列）。

    Returns
    -------
    int
        終了コード。引数が足りない・サービスに retrieval がないときは 2。
    """
    if len(argv) != EXPECTED_ARGUMENT_COUNT:
        print(USAGE, file=sys.stderr)
        return 2
    workflows_path, service_id, question = argv[1], argv[2], argv[3]
    config = parse_workflow_config(
        json.loads(Path(workflows_path).read_text(encoding="utf-8"))
    )
    definition = config.services.get(service_id)
    if definition is None or definition.retrieval is None:
        print(f"service '{service_id}' has no retrieval", file=sys.stderr)
        return 2
    with tempfile.TemporaryDirectory(prefix="spec-retrieval-") as directory:
        job_dir = Path(directory)
        job = _build_retrieval_job(definition, question, job_dir, None)
        app = RetrievalApp(None)
        for prop_id, value in job.properties.items():
            app.set_property(prop_id, value)
        app.connect(OUT_MODE_RAG_CONTEXT_JSON_V1)
        for column in job.columns:
            app.validate_column_information(column)
        app.set_column_information(job.columns)
        app.set_view_name(job.view_name)
        app.before_execute()
        app.write(job.record)
        print((job_dir / job.view_name).read_text(encoding="utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
