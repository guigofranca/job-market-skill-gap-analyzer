"""Vercel entrypoint: Vercel serves the module-level `app` from this file as one function.

The package is imported from src/ (not an installed copy) so that settings find data/ next to it.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from job_analyzer.api.app import create_app

app = create_app()
