import json
from pathlib import Path

LOCALES = Path(__file__).parent.parent / "src" / "labplanner" / "static" / "locales"


def test_locales_parse_and_share_the_same_keys():
    dicts = {
        p.stem: json.loads(p.read_text(encoding="utf-8"))
        for p in LOCALES.glob("*.json")
    }
    assert "en" in dicts
    assert "tr" in dicts
    en_keys = set(dicts["en"])
    for code, d in dicts.items():
        missing = en_keys - set(d)
        extra = set(d) - en_keys
        assert not missing, f"locale '{code}' is missing keys: {sorted(missing)[:5]}"
        assert not extra, f"locale '{code}' has unknown keys: {sorted(extra)[:5]}"
        assert all(isinstance(v, str) and v for v in d.values()), \
            f"locale '{code}' has empty or non-string values"
