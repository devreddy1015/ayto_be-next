from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

MATCH_PLAYLISTS = [
    "https://www.youtube.com/playlist?list=PLnPe02YTOgmDWE1M2oSq-vrSabPuUaVIF",
]

SEARCH_QUERIES = [
    "BWF badminton singles full match 2023",
    "BWF badminton singles full match 2024",
    "badminton rally compilation HD",
    "badminton training session court camera",
]


def download_videos(
    output_dir: str | Path,
    max_videos: int = 200,
    format_code: str = "bestvideo[height<=720]+bestaudio/best[height<=720]",
) -> list[dict]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest: list[dict] = []
    downloaded = 0

    for query in SEARCH_QUERIES:
        if downloaded >= max_videos:
            break

        remaining = max_videos - downloaded
        cmd = [
            "yt-dlp",
            f"ytsearch{min(remaining, 50)}:{query}",
            "-f", format_code,
            "--merge-output-format", "mp4",
            "-o", str(output_dir / "%(id)s.%(ext)s"),
            "--write-info-json",
            "--no-overwrites",
            "--restrict-filenames",
            "--sleep-interval", "2",
            "--max-sleep-interval", "5",
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
            print(result.stdout[-500:] if result.stdout else "")
        except subprocess.TimeoutExpired:
            print(f"Timeout on query: {query}")
            continue

        for info_json in output_dir.glob("*.info.json"):
            with open(info_json) as f:
                info = json.load(f)
            manifest.append({
                "id": info.get("id"),
                "title": info.get("title"),
                "duration": info.get("duration"),
                "url": info.get("webpage_url"),
            })
            downloaded += 1

    manifest_path = output_dir / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"Downloaded {downloaded} videos to {output_dir}")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Download badminton match videos")
    parser.add_argument("--output", default="data/raw/videos")
    parser.add_argument("--max-videos", type=int, default=200)
    args = parser.parse_args()
    download_videos(args.output, args.max_videos)


if __name__ == "__main__":
    main()
