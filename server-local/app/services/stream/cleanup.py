import asyncio
import logging
import time
from pathlib import Path

logger = logging.getLogger(__name__)

# 移植元 StreamFileCleanupScheduler の @Scheduled(fixedRate = 3_600_000)
CLEANUP_INTERVAL_SECONDS = 3600
SECONDS_PER_HOUR = 3600


def cleanup_orphan_stream_files(output_dir: str, max_age_hours: int) -> int:
    """出力先直下の `*.txt` のうち、最終更新が古いものを削除する。

    SSE の終了時にはストリームファイルを消さない（移植元で調査用に残している）ため、
    溜まり続けないように定期的に掃除する。
    """
    directory = Path(output_dir).resolve()
    if not directory.is_dir():
        return 0
    cutoff = time.time() - max_age_hours * SECONDS_PER_HOUR
    deleted = 0
    try:
        for file in directory.glob("*.txt"):
            if file.stat().st_mtime < cutoff:
                file.unlink(missing_ok=True)
                deleted += 1
                logger.info("Deleted orphan stream file: %s", file)
    except OSError:
        logger.warning(
            "Failed to cleanup orphan stream files in %s", directory, exc_info=True
        )
    return deleted


async def run_cleanup_loop(output_dir: str, max_age_hours: int) -> None:
    while True:
        await asyncio.to_thread(cleanup_orphan_stream_files, output_dir, max_age_hours)
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
