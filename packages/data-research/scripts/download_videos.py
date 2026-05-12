"""Download badminton training videos from YouTube.

Uses yt-dlp to search and download videos matching specific queries
for building a badminton analytics training dataset.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


SEARCH_QUERIES = [
    "Viktor Axelsen smash slow motion",
    "BWF World Tour 2023 singles rally",
    "PV Sindhu training badminton 2023",
    "badminton smash technique pro player",
    "Lin Dan technique slow motion",
    "Kento Momota rally full speed",
    "Carolina Marin aggressive smash",
    "badminton doubles fast rally 1080p",
]


def download_videos(
    output_dir: str | Path,
    max_per_query: int = 10,
    format_code: str = "bestvideo[height<=1080][fps>=60]+bestaudio/bestvideo[height<=1080]+bestaudio/best[height<=1080]",
) -> list[dict]:
    """Download badminton videos using yt-dlp.

    Searches YouTube for each query and downloads up to max_per_query
    videos per query. Skips already downloaded files.

    Args:
        output_dir: Directory to save downloaded videos.
        max_per_query: Maximum videos to download per search query.
        format_code: yt-dlp format selection string (1080p60 preferred).

    Returns:
        List of metadata dicts for downloaded videos.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest: list[dict] = []
    total_downloaded = 0

    for query in SEARCH_QUERIES:
        print(f"\n🔍 Searching: {query}")
        cmd = [
            "yt-dlp",
            f"ytsearch{max_per_query}:{query}",
            "-f", format_code,
            "--merge-output-format", "mp4",
            "-o", str(output_dir / "%(id)s.%(ext)s"),
            "--write-info-json",
            "--no-overwrites",
            "--restrict-filenames",
            "--sleep-interval", "2",
            "--max-sleep-interval", "5",
            "--max-downloads", str(max_per_query),
        ]

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=3600
            )
            if result.stdout:
                # Print last few lines of output
                lines = result.stdout.strip().split("\n")
                for line in lines[-5:]:
                    print(f"  {line}")
        except subprocess.TimeoutExpired:
            print(f"  ⏰ Timeout on query: {query}")
            continue
        except FileNotFoundError:
            print("  ❌ yt-dlp not found. Install: pip install yt-dlp")
            return manifest

        # Collect metadata from info.json files
        for info_json in output_dir.glob("*.info.json"):
            vid_id = info_json.stem.replace(".info", "")
            # Skip if already in manifest
            if any(m.get("id") == vid_id for m in manifest):
                continue
            try:
                with open(info_json) as f:
                    info = json.load(f)
                manifest.append({
                    "id": info.get("id", vid_id),
                    "title": info.get("title", ""),
                    "duration": info.get("duration", 0),
                    "url": info.get("webpage_url", ""),
                    "fps": info.get("fps", 30),
                    "height": info.get("height", 0),
                    "query": query,
                })
                total_downloaded += 1
            except (json.JSONDecodeError, KeyError):
                continue

    # Save manifest
    manifest_path = output_dir / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\n✅ Downloaded {total_downloaded} videos to {output_dir}")
    return manifest


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Download badminton match videos")
    parser.add_argument("--output", default="data/raw/videos",
                        help="Output directory for videos")
    parser.add_argument("--max-per-query", type=int, default=10,
                        help="Maximum videos per search query")
    args = parser.parse_args()
    download_videos(args.output, args.max_per_query)


if __name__ == "__main__":
    main()
