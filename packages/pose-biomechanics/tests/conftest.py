import sys
from pathlib import Path

# Add the parent of src/ so that "from angles import ..." works
src_dir = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_dir))

# Also make the package importable for relative imports
pkg_dir = Path(__file__).parent.parent
sys.path.insert(0, str(pkg_dir))
