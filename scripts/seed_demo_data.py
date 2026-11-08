"""Import synthetic demo conversations into the local DB; does not create evaluations."""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app.db import Database
from backend.app.settings import Settings, ROOT
from backend.app.services.dataset_import import import_dataset

settings = Settings()
database = Database(settings.database_url)
database.initialize()
print(
    import_dataset(
        database,
        json.loads((ROOT / "config/synthetic_demo.json").read_text()),
        "synthetic demo",
    )
)
