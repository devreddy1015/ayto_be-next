import sys
from pathlib import Path

# Modules in src/ are imported top-level ("from angles import ..."). The package
# root is deliberately not added: its "src" package would shadow core's.
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
