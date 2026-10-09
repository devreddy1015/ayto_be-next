"""Per-sport stroke taxonomies and label normalisation.

Torch-free so it can be imported by data tooling and by the dataset module
without pulling in the model. Every sport maps to an ordered tuple of
top-level product classes; the class index is the model output index.

Conventions for the non-badminton sports: ``forehand`` / ``backhand`` mean
the ordinary groundstroke / drive / loop from that side. More specific
strokes (volley, smash, lob, drop, push, dink, boast, ...) take precedence
over the side label when annotating.
"""
from __future__ import annotations

from typing import Any

import numpy as np

DEFAULT_SPORT = "badminton"

SPORT_CLASSES: dict[str, tuple[str, ...]] = {
    # Ayto's original six mobile-product classes (ShuttleSet types collapse onto these).
    "badminton": ("smash", "drop", "clear", "net", "serve", "defensive"),
    "tennis": ("serve", "forehand", "backhand", "volley", "smash", "lob", "drop"),
    "table_tennis": ("serve", "forehand", "backhand", "push", "block", "chop", "smash", "lob"),
    "pickleball": ("serve", "forehand", "backhand", "dink", "drop", "volley", "smash", "lob"),
    "squash": ("serve", "forehand", "backhand", "volley", "drop", "boast", "lob"),
}

# Aliases are matched after lower-casing and replacing "_" / "-" with spaces.
SPORT_LABEL_ALIASES: dict[str, dict[str, str]] = {
    "badminton": {
        "jump smash": "smash",
        "wrist smash": "smash",
        "drop shot": "drop",
        "passive drop": "drop",
        "lob": "clear",
        "net shot": "net",
        "return net": "net",
        "cross court net shot": "net",
        "short service": "serve",
        "long service": "serve",
        "service": "serve",
        "defense": "defensive",
        "block": "defensive",
        "drive": "defensive",
        "driven flight": "defensive",
        "back court drive": "defensive",
        "defensive return drive": "defensive",
        "defensive return lob": "defensive",
        "push": "defensive",
        "rush": "defensive",
        "push/rush": "defensive",
    },
    "tennis": {
        "service": "serve",
        "first serve": "serve",
        "second serve": "serve",
        "forehand drive": "forehand",
        "forehand groundstroke": "forehand",
        "backhand drive": "backhand",
        "backhand groundstroke": "backhand",
        "backhand slice": "backhand",
        "forehand volley": "volley",
        "backhand volley": "volley",
        "half volley": "volley",
        "overhead": "smash",
        "overhead smash": "smash",
        "drop shot": "drop",
    },
    "table_tennis": {
        "service": "serve",
        "forehand drive": "forehand",
        "forehand loop": "forehand",
        "forehand topspin": "forehand",
        "forehand flick": "forehand",
        "backhand drive": "backhand",
        "backhand loop": "backhand",
        "backhand topspin": "backhand",
        "backhand flick": "backhand",
        "forehand push": "push",
        "backhand push": "push",
        "forehand block": "block",
        "backhand block": "block",
        "forehand chop": "chop",
        "backhand chop": "chop",
        "kill": "smash",
    },
    "pickleball": {
        "service": "serve",
        "forehand drive": "forehand",
        "backhand drive": "backhand",
        "third shot drop": "drop",
        "drop shot": "drop",
        "forehand volley": "volley",
        "backhand volley": "volley",
        "punch volley": "volley",
        "overhead": "smash",
        "overhead smash": "smash",
    },
    "squash": {
        "service": "serve",
        "forehand drive": "forehand",
        "forehand rail": "forehand",
        "backhand drive": "backhand",
        "backhand rail": "backhand",
        "forehand volley": "volley",
        "backhand volley": "volley",
        "drop shot": "drop",
        "volley drop": "drop",
        "forehand boast": "boast",
        "backhand boast": "boast",
    },
}


def get_classes(sport: str = DEFAULT_SPORT) -> list[str]:
    """Return the ordered class list for ``sport`` (raises ``ValueError`` if unknown)."""
    key = _sport_key(sport)
    if key not in SPORT_CLASSES:
        raise ValueError(f"Unknown sport {sport!r}; expected one of {sorted(SPORT_CLASSES)}")
    return list(SPORT_CLASSES[key])


def num_classes_for(sport: str = DEFAULT_SPORT) -> int:
    """Return the number of top-level stroke classes for ``sport``."""
    return len(get_classes(sport))


def normalize_label(label: Any, sport: str = DEFAULT_SPORT) -> int | None:
    """Map an integer index or free-text stroke name to a class index.

    Returns ``None`` for out-of-range indices and unknown names so loaders can
    skip samples that do not belong to the sport's taxonomy.
    """
    classes = get_classes(sport)
    if isinstance(label, np.ndarray):
        label = label.item()
    if isinstance(label, (np.integer, int)):
        value = int(label)
        return value if 0 <= value < len(classes) else None
    key = str(label).strip().lower().replace("_", " ").replace("-", " ")
    key = SPORT_LABEL_ALIASES.get(_sport_key(sport), {}).get(key, key)
    return classes.index(key) if key in classes else None


def _sport_key(sport: str) -> str:
    return sport.strip().lower().replace("-", "_").replace(" ", "_")
