"""Standard phase templates and drawing stages.

Weights say how much each phase contributes to a project's overall progress.
They are normalised when computed, so they don't have to sum to 100, and every
project can edit its own weights after the template is applied.
"""

# The studio's own stages, from first enquiry to closeout (the default).
ATELIER = [
    {"code": "INQ", "name": "Inquiry", "weight": 5},
    {"code": "CON", "name": "Concept", "weight": 10},
    {"code": "SD", "name": "Schematic design", "weight": 15},
    {"code": "DD", "name": "Design development", "weight": 20},
    {"code": "CD", "name": "Construction documents", "weight": 25},
    {"code": "PER", "name": "Permitting", "weight": 10},
    {"code": "CA", "name": "Construction administration", "weight": 10},
    {"code": "CLO", "name": "Closeout", "weight": 5},
]

# SIA 112 phases (Switzerland). Weights follow the typical SIA 102 fee shares.
SIA_112 = [
    {"code": "21", "name": "Preliminary studies", "weight": 3},
    {"code": "31", "name": "Preliminary design", "weight": 9},
    {"code": "32", "name": "Construction project", "weight": 21},
    {"code": "33", "name": "Building permit", "weight": 2.5},
    {"code": "41", "name": "Tendering", "weight": 18},
    {"code": "51", "name": "Execution drawings", "weight": 16},
    {"code": "52", "name": "Construction", "weight": 26},
    {"code": "53", "name": "Handover", "weight": 4.5},
]

# Common international (AIA-style) sequence.
INTERNATIONAL = [
    {"code": "CD", "name": "Concept design", "weight": 10},
    {"code": "SD", "name": "Schematic design", "weight": 15},
    {"code": "DD", "name": "Design development", "weight": 20},
    {"code": "PE", "name": "Permitting", "weight": 5},
    {"code": "CDOC", "name": "Construction documents", "weight": 25},
    {"code": "BID", "name": "Bidding", "weight": 5},
    {"code": "CA", "name": "Construction administration", "weight": 20},
]

TEMPLATES = {
    "atelier": {"label": "Atelier (Inquiry → Closeout)", "phases": ATELIER},
    "sia112": {"label": "SIA 112 (Switzerland)", "phases": SIA_112},
    "international": {"label": "International (AIA-style)", "phases": INTERNATIONAL},
}

# Each drawing moves through these stages. The number is the progress the stage
# implies when no explicit percentage is given.
DRAWING_STAGES = {
    "not_started": 0,
    "draft": 15,
    "in_progress": 45,
    "review": 75,
    "approved": 90,
    "issued": 100,
}

PHASE_STATUSES = ("not_started", "in_progress", "on_hold", "done")
PROJECT_STATUSES = ("active", "on_hold", "completed", "archived")
