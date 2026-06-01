"""Normalize Unicode dash characters to ASCII hyphen-minus."""

# Hyphen, en dash, em dash, figure dash, horizontal bar, minus sign, etc.
DASH_CHARACTERS = (
    "\u2010",  # hyphen
    "\u2011",  # non-breaking hyphen
    "\u2012",  # figure dash
    "\u2013",  # en dash
    "\u2014",  # em dash
    "\u2015",  # horizontal bar
    "\u2212",  # minus sign
    "\uFE58",  # small em dash
    "\uFE63",  # small hyphen-minus
    "\uFF0D",  # fullwidth hyphen-minus
)

_DASH_TRANSLATION = str.maketrans({c: "-" for c in DASH_CHARACTERS})


def normalize_dashes(value):
    """Replace all Unicode dash variants with ASCII '-'."""
    if value is None:
        return value
    if not isinstance(value, str):
        return value
    return value.translate(_DASH_TRANSLATION)


def normalize_dashes_deep(obj):
    """Recursively normalize dashes in strings inside dicts/lists."""
    if isinstance(obj, str):
        return normalize_dashes(obj)
    if isinstance(obj, dict):
        return {k: normalize_dashes_deep(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [normalize_dashes_deep(item) for item in obj]
    return obj
