"""Regression for exact decimal shares in the optional offline schema QA."""
import json
import pathlib
import subprocess
import sys
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
profile = {"structure": "land", "baseBiome": "meadow"}
with tempfile.TemporaryDirectory(prefix="Vland schema decimal QA ") as folder:
    directory = pathlib.Path(folder)
    for percent, width, expected in [(0.3, 32.0, True), (12.5, 32, True), (99.9, 32, True), (0.31, 32, False), (-0.1, 32, False), (100.1, 32, False), (0.3, 32.5, False)]:
        value = {"width": width, "landscape": {**profile, "biomes": [{"id": "decimal", "type": "forest", "percent": percent}]}}
        manifest = directory / "manifest.json"
        report = directory / "report.json"
        manifest.write_text(json.dumps({"modes": ["landscape"], "documents": [{"label": "decimal " + str(percent), "schema": "schemas/generation-landscape.schema.json", "value": value}]}), encoding="utf-8")
        result = subprocess.run([sys.executable, str(root / "tools/verify-evolution-schemas.py"), "--data", str(manifest), "--report", str(report)], capture_output=True, text=True, encoding="utf-8")
        data = json.loads(report.read_text(encoding="utf-8"))
        assert data["ok"] is expected and (result.returncode == 0) is expected, (percent, expected, result.stdout, result.stderr)
print("Decimal schema QA: 3 valid shares accepted; 3 invalid shares and 1 fractional width rejected.")
