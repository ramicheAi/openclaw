#!/usr/bin/env python3
"""Auditable term lists used by extract.py.

Everything the pipeline claims is traced back to one of these lists plus a
verbatim quote from the corpus, so the output can be checked line by line
rather than taken on trust.
"""

# --- Bible -----------------------------------------------------------------
# Split by ambiguity: SAFE names are unlikely to appear as ordinary English or
# as a person's name; AMBIGUOUS names need a scriptural cue nearby before we
# count them.
BIBLE_SAFE = [
    "Leviticus", "Deuteronomy", "Nehemiah",
    "Psalms", "Psalm", "Proverbs", "Ecclesiastes", "Lamentations",
    "Ezekiel", "Obadiah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
    "Zechariah", "Corinthians", "Galatians", "Ephesians",
    "Philippians", "Colossians", "Thessalonians",
]
# Ordinary lowercase words that are book names only when capitalised, so these
# are matched case-sensitively: "the genesis of an idea" is not the book.
BIBLE_SAFE_CASED = ["Genesis", "Exodus"]
# Names that are also ordinary words or common first names. Every one of these
# produced a false positive in testing ("Daniel the painter", "John Hall" in a
# livestream chat), so they only count with an explicit scriptural construction.
BIBLE_AMBIGUOUS = [
    "Numbers", "Judges", "Samuel", "Kings", "Chronicles", "Job",
    "Song of Solomon", "Song of Songs", "Mark", "Luke", "John", "Acts",
    "James", "Peter", "Daniel", "Matthew", "Joshua", "Ruth", "Ezra",
    "Esther", "Isaiah", "Jeremiah", "Hosea", "Joel", "Amos", "Jonah",
    "Micah", "Malachi", "Timothy", "Titus", "Philemon", "Jude",
    # Also names of peoples, or ordinary nouns: "the Romans drank",
    # "the Hebrews", "a revelation". Need an explicit scriptural form.
    "Romans", "Hebrews", "Revelation", "Revelations",
]
# Books outside the 66-book Protestant canon that this creator discusses.
BIBLE_EXTRA_CANON = [
    "Book of Enoch", "Enoch", "Book of Jasher", "Jasher", "Book of Jubilees",
    "Jubilees", "Apocrypha", "Deuterocanonical", "Nag Hammadi",
    "Gospel of Thomas", "Gospel of Mary", "Gospel of Judas", "Gospel of Philip",
    "Dead Sea Scrolls", "Book of Tobit", "Tobit", "Judith", "Maccabees",
    "Sirach", "Ecclesiasticus", "Wisdom of Solomon", "Baruch",
    "Testament of Solomon", "Book of Giants", "Shepherd of Hermas",
    "Epistle of Barnabas", "Book of Thomas",
]
SCRIPTURE_CUES = [
    "bible", "scripture", "gospel", "testament", "chapter", "verse",
    "apostle", "prophet", "epistle", "king james", "kjv", "book of",
    "biblical", "christ", "jesus", "god", "lord",
]

# --- Named works other than the Bible --------------------------------------
NAMED_WORKS = [
    "Emerald Tablets", "Emerald Tablet", "Kybalion", "Urantia",
    "Corpus Hermeticum", "Hermetica", "Book of the Dead", "Vedas",
    "Bhagavad Gita", "Upanishads", "Quran", "Koran", "Torah", "Talmud",
    "Zohar", "Kabbalah", "Popol Vuh", "Rig Veda", "Mahabharata",
    "Ramayana", "I Ching", "Tao Te Ching", "Art of War",
    "Rich Dad Poor Dad", "Think and Grow Rich", "48 Laws of Power",
    "Atlas Shrugged", "1984", "Brave New World", "Behold a Pale Horse",
    "Morals and Dogma", "Secret Teachings of All Ages", "Isis Unveiled",
    "Secret Doctrine", "Law of One", "Ra Material", "Seth Material",
    "Anastasia", "Ringing Cedars", "Oahspe", "Kolbrin", "Kolbrin Bible",
    "Chronicles of Akakor", "Fingerprints of the Gods", "Magicians of the Gods",
    "Chariots of the Gods", "Worlds in Collision", "Earth in Upheaval",
    "The Bible", "Codex", "Voynich",
    # Titles and authors from the shared catalog of his digital library, so
    # spoken mentions in transcripts cross-reference the Library Catalog.
    "Josephus", "Douay", "Rheims", "Haydock", "Lamsa", "Peshitta",
    "Zoroaster", "Outline of History", "David Icke",
    "Truth Shall Set You Free", "Witchcraft and Demonology",
    "Night Scenes", "Freemason's Monitor", "Fellowcraft", "Master Mason",
    "Masonic Law", "Taoist Yoga", "Chee Soo", "Earliest Gospel",
    "Physics and Physiology of Spiritualism", "Lincoln Family Bible",
    "1812 Bible", "1828 Bible", "Vignettes of Papua New Guinea",
]

# --- Electricity, solar and energy ----------------------------------------
ELECTRICAL = {
    "Fundamentals": [
        "voltage", "volt", "volts", "amperage", "amp", "amps", "ampere",
        "wattage", "watt", "watts", "kilowatt", "kilowatt hour", "kwh",
        "ohm", "ohms", "ohm's law", "resistance", "current", "circuit",
        "conductor", "insulator", "capacitance", "capacitor", "inductance",
        "frequency", "hertz", "impedance", "load", "phase", "polarity",
    ],
    "AC / DC and wiring": [
        # Bare "ac"/"dc" without surrounding spaces: word_re adds the
        # boundaries, whereas padded terms silently dropped them and matched
        # inside words like "back" and "machine".
        "alternating current", "direct current", "ac", "dc", "ac/dc",
        "hot wire", "neutral", "ground", "grounding", "earth ground",
        "bonding", "breaker", "busbar", "bus bar", "gauge", "awg",
        "conduit", "romex", "junction box", "disconnect", "fuse",
        "120 volt", "240 volt", "230 volt", "split phase", "three phase",
        "series", "parallel", "short circuit", "arc fault", "gfci",
    ],
    "Solar generation": [
        "solar", "photovoltaic", "pv", "solar panel", "array", "string",
        "irradiance", "azimuth", "tilt", "shading", "sun hours",
        "peak sun", "monocrystalline", "polycrystalline", "bifacial",
        "watt peak", "derate", "net metering", "grid tie", "grid-tied",
        "off grid", "off-grid", "hybrid inverter",
    ],
    "Storage and batteries": [
        "battery", "batteries", "lithium", "lifepo4", "lfp", "lead acid",
        "agm", "amp hour", "amp-hour", "depth of discharge", "dod",
        "state of charge", "soc", "bms", "battery management system",
        "cycle life", "c-rate", "server rack battery", "ethos",
        "bigbattery", "big battery", "cell balancing", "busbar",
    ],
    "Conversion and control": [
        "inverter", "charge controller", "mppt", "pwm", "converter",
        "rectifier", "transformer", "step up", "step down", "sine wave",
        "pure sine", "modified sine", "generator", "alternator",
        "transfer switch", "automatic transfer", "surge", "inrush",
    ],
    "Measurement and tools": [
        "multimeter", "clamp meter", "megger", "oscilloscope",
        "thermal camera", "thermal imaging", "infrared", "x-ray",
        "spectrometer", "xrf", "continuity", "meter", "monitor",
    ],
}

# --- Ancient / esoteric ----------------------------------------------------
ANCIENT = {
    "Artifacts and archaeology": [
        "artifact", "artefact", "relic", "carving", "carved", "stone",
        "megalith", "megalithic", "obsidian", "jade", "granite", "basalt",
        "excavation", "dig site", "provenance", "patina", "tool marks",
        "machining", "drill", "lathe", "polygonal masonry", "vitrified",
    ],
    "Civilizations and sites": [
        "sumerian", "sumer", "babylon", "egypt", "egyptian", "pyramid",
        "giza", "sphinx", "maya", "mayan", "aztec", "inca", "olmec",
        "atlantis", "lemuria", "mu", "gobekli tepe", "puma punku",
        "tiwanaku", "nazca", "easter island", "stonehenge", "anunnaki",
        "nephilim", "giants", "pre-flood", "antediluvian", "costa rica",
        "colombia", "spheres", "diquis",
    ],
    "Symbolism and esoterica": [
        "symbol", "symbolism", "as above so below", "sacred geometry",
        "flower of life", "merkaba", "yin yang", "yinyang", "ouroboros",
        "caduceus", "third eye", "chakra", "occult", "esoteric",
        "hermetic", "alchemy", "alchemical", "freemason", "masonic",
        "mystery school", "initiate", "gnostic", "gnosticism",
        "anthropomorphic", "glyph", "hieroglyph", "cuneiform",
    ],
    "Energy and frequency": [
        "frequency", "vibration", "resonance", "harmonic", "hertz",
        "432", "528", "scalar", "torsion", "aether", "ether",
        "zero point", "free energy", "electromagnetic", "magnetism",
        "magnetic", "piezoelectric", "piezo", "capacitor", "tesla",
        "wardenclyffe", "ley line", "telluric",
    ],
    "Flood, origins and scripture": [
        "flood", "great flood", "deluge", "noah", "ark", "younger dryas",
        "cataclysm", "catastrophe", "comet", "impact", "ice age",
        "elohim", "nephilim", "anunnaki", "watchers", "fallen angels",
        "adam", "eve", "eden", "moses", "abraham", "solomon",
        "babel", "tower of babel", "creation", "genesis flood",
        "god", "jesus", "christ", "christian", "religion", "church",
        "faith", "prophecy", "angel", "demon", "spirit",
    ],
}

# --- Life, business, and philosophy ---------------------------------------
LIFE = {
    "Real estate and investing": [
        "real estate", "rental", "rental property", "landlord", "tenant",
        "seller financing", "owner finance", "subject to", "brrrr",
        "cash flow", "equity", "appraisal", "closing", "escrow", "deed",
        "title", "mortgage", "note", "portfolio", "down payment",
        "hard money", "private money", "no money down", "flip",
    ],
    "Business and entrepreneurship": [
        "business", "entrepreneur", "consulting", "client", "invoice",
        "contract", "scaling", "payroll", "llc", "s corp", "revenue",
        "margin", "overhead", "sales", "closing the deal", "leads",
    ],
    "Incarceration and redemption": [
        "felon", "felony", "prison", "jail", "inmate", "convicted",
        "sentence", "probation", "parole", "record", "reentry",
        "second chance", "rehabilitation",
    ],
    "Vanlife, homestead and travel": [
        "van", "vanlife", "van life", "rv", "tiny house", "homestead",
        "off grid", "boondock", "nomad", "expat", "pura vida",
        "immigration", "residency", "passport", "border",
    ],
    "Mindset and philosophy": [
        "mindset", "purpose", "discipline", "gratitude", "grateful",
        "healing", "trauma", "forgiveness", "freedom", "matrix",
        "truth", "truth seeker", "consciousness", "awareness",
        "meditation", "faith", "belief", "religion", "spiritual",
        "sovereignty", "authenticity",
    ],
}

# "restore"/"restoration" were dropped: they matched environmental posts
# ("protect, restore and sustain this planet") with nothing to do with books.
LIBRARY_CUES = [
    "digital library", "library", "archive", "preserve", "preservation",
    "occult knowledge", "lost to history", "old books", "scan", "scanning",
    "digitize", "digitizing", "manuscript", "rare book", "out of print",
    "first edition", "antique book", "preserving history",
]
