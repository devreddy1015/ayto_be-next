from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="SportIQ — Run full sports analytics pipeline on a video",
    )
    parser.add_argument(
        "--video",
        required=True,
        help="Path to match/rally video (.mp4, .mov)",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Output JSON path (default: output/<video_name>_session.json)",
    )
    parser.add_argument(
        "--model",
        default="yolov8n.pt",
        help="YOLO model path for shuttle detection",
    )
    parser.add_argument(
        "--sport",
        default="badminton",
        choices=["badminton", "cricket", "table-tennis", "football"],
    )
    parser.add_argument(
        "--real",
        action="store_true",
        help="Use real YOLO + MediaPipe inference (requires models installed)",
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Print session summary to stdout",
    )

    args = parser.parse_args()

    video_path = Path(args.video)
    if not video_path.exists():
        print(f"Video not found: {video_path}")
        sys.exit(1)

    output_path = args.output
    if output_path is None:
        output_dir = Path("output")
        output_dir.mkdir(exist_ok=True)
        output_path = str(output_dir / f"{video_path.stem}_session.json")

    from orchestrator import pipeline_to_json

    json_str = pipeline_to_json(
        str(video_path),
        output_path=output_path,
        use_real_inference=args.real,
    )

    if args.summary:
        import json
        data = json.loads(json_str)
        m = data.get("metrics", {})
        print("\n═══════════════════════════════")
        print("  SPORTIQ — SESSION SUMMARY")
        print("═══════════════════════════════")
        print(f"  Sport:      {data.get('sport', '?')}")
        print(f"  Duration:   {m.get('duration_s', 0):.1f}s")
        print(f"  Max Speed:  {m.get('max_speed_kmh', 0):.0f} km/h")
        print(f"  Avg Speed:  {m.get('avg_speed_kmh', 0):.0f} km/h")
        print(f"  Detection:  {m.get('detection_rate', 0):.1%}")
        print(f"  Strokes:    {sum(m.get('stroke_counts', {}).values())}")
        print(f"  Form Score: {m.get('form_score', 0):.0f}/100")
        print("═══════════════════════════════")
        strokes_list = data.get("strokes", [])
        if strokes_list:
            print("  Stroke Breakdown:")
            from collections import Counter
            counts = Counter(s["stroke_type"] for s in strokes_list)
            for st, cnt in counts.most_common():
                print(f"    {st.title():12s} {cnt}")
        print("═══════════════════════════════\n")


if __name__ == "__main__":
    main()
