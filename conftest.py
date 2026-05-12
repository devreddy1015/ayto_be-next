import sys
from pathlib import Path

root = Path(__file__).parent
sys.path.insert(0, str(root))

for pkg in (root / "packages").iterdir():
    if pkg.is_dir() and (pkg / "src").is_dir():
        sys.path.insert(0, str(pkg))
