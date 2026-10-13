"""
Normalisation du texte avant synthèse : les modèles de voix prononcent mal
les chiffres, symboles et abréviations. On les écrit en toutes lettres.

Couvre le français et l'anglais (les deux langues des spots Voxa) ;
les autres langues passent sans modification.
"""
from __future__ import annotations

import re

# ---------------------------------------------------------------- français
_FR_UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
             "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
             "dix-sept", "dix-huit", "dix-neuf"]
_FR_TENS = {2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante"}


def _fr_below_100(n: int) -> str:
    if n < 20:
        return _FR_UNITS[n]
    t, u = divmod(n, 10)
    if t in (7, 9):  # soixante-dix, quatre-vingt-dix
        base = "soixante" if t == 7 else "quatre-vingt"
        if t == 7 and u == 1:
            return "soixante et onze"
        return f"{base}-{_FR_UNITS[10 + u]}"
    if t == 8:
        return "quatre-vingts" if u == 0 else f"quatre-vingt-{_FR_UNITS[u]}"
    word = _FR_TENS[t]
    if u == 0:
        return word
    if u == 1:
        return f"{word} et un"
    return f"{word}-{_FR_UNITS[u]}"


def _fr_below_1000(n: int) -> str:
    h, r = divmod(n, 100)
    if h == 0:
        return _fr_below_100(r)
    head = "cent" if h == 1 else f"{_FR_UNITS[h]} cent"
    if r == 0:
        return head + ("s" if h > 1 else "")
    return f"{head} {_fr_below_100(r)}"


def fr_number(n: int) -> str:
    if n < 0:
        return "moins " + fr_number(-n)
    if n < 1000:
        return _fr_below_1000(n)
    parts = []
    for value, sing, plur in ((10**12, "billion", "billions"), (10**9, "milliard", "milliards"),
                              (10**6, "million", "millions")):
        q, n = divmod(n, value)
        if q:
            parts.append(f"{fr_number(q)} {sing if q == 1 else plur}")
    q, n = divmod(n, 1000)
    if q:
        parts.append("mille" if q == 1 else f"{_fr_below_1000(q)} mille")
    if n:
        parts.append(_fr_below_1000(n))
    out = " ".join(parts)
    # « quatre-vingts » et « cents » perdent leur s devant mille
    return out.replace("vingts mille", "vingt mille").replace("cents mille", "cent mille")


# ---------------------------------------------------------------- anglais
_EN_UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
             "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
             "seventeen", "eighteen", "nineteen"]
_EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def _en_below_1000(n: int) -> str:
    h, r = divmod(n, 100)
    words = []
    if h:
        words.append(f"{_EN_UNITS[h]} hundred")
    if r:
        if r < 20:
            words.append(_EN_UNITS[r])
        else:
            t, u = divmod(r, 10)
            words.append(_EN_TENS[t] + (f"-{_EN_UNITS[u]}" if u else ""))
    return " ".join(words) if words else "zero"


def en_number(n: int) -> str:
    if n < 0:
        return "minus " + en_number(-n)
    if n < 1000:
        return _en_below_1000(n)
    parts = []
    for value, word in ((10**12, "trillion"), (10**9, "billion"), (10**6, "million"), (1000, "thousand")):
        q, n = divmod(n, value)
        if q:
            parts.append(f"{_en_below_1000(q) if q < 1000 else en_number(q)} {word}")
    if n:
        parts.append(_en_below_1000(n))
    return " ".join(parts)


# ---------------------------------------------------------------- règles
_NUM = r"\d{1,3}(?:[   .]\d{3})+|\d+"  # 25 000 / 25.000 / 25000


def _to_int(s: str) -> int:
    return int(re.sub(r"[   .]", "", s))


def _fr_decimal(i: str, d: str) -> str:
    d_words = fr_number(int(d)) if not d.startswith("0") else " ".join(_FR_UNITS[int(c)] for c in d)
    return f"{fr_number(_to_int(i))} virgule {d_words}"


def _en_decimal(i: str, d: str) -> str:
    return f"{en_number(_to_int(i))} point {' '.join(_EN_UNITS[int(c)] for c in d)}"


FR_ABBREV = {
    r"\bM\.\s": "Monsieur ", r"\bMme\b": "Madame", r"\bMlle\b": "Mademoiselle", r"\bDr\b\.?": "Docteur",
    r"\bSt\b": "Saint", r"\bSte\b": "Sainte", r"\betc\.": "et cetera", r"\bex\.": "par exemple",
    r"\bkm\b": "kilomètres", r"\bkg\b": "kilos", r"\bmin\b": "minutes", r"\bh\b": "heures",
    r"\bN°\s?": "numéro ", r"\bn°\s?": "numéro ", r"\bTTC\b": "toutes taxes comprises", r"\bHT\b": "hors taxes",
}
EN_ABBREV = {
    r"\bMr\.?\s": "Mister ", r"\bMrs\.?\s": "Missus ", r"\bDr\.?\s": "Doctor ", r"\betc\.": "et cetera",
    r"\bkm\b": "kilometers", r"\bkg\b": "kilograms", r"\bNo\.\s?": "number ",
}
# Sigles épelés lettre par lettre (sinon le modèle tente de les lire comme des mots)
SPELLED = {"SMS", "USB", "PDF", "TV", "BTP", "PME", "ONG", "CEO", "RDV", "SAV", "VIP", "BCEAO", "UEMOA", "CEDEAO"}
FR_LETTERS = dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "a bé cé dé e èf gé ache i ji ka èl èm èn o pé ku èr èss té u vé double-vé ix i-grec zèd".split()))


def _spell(word: str, lang: str) -> str:
    if lang == "fr":
        return " ".join(FR_LETTERS.get(c, c) for c in word)
    return " ".join(word)


def normalize(text: str, lang: str) -> str:
    if lang not in ("fr", "en"):
        return text
    fr = lang == "fr"
    num = fr_number if fr else en_number
    t = text.replace("’", "'").replace("…", "...")

    for pat, rep in (FR_ABBREV if fr else EN_ABBREV).items():
        t = re.sub(pat, rep, t)
    t = re.sub(r"\b(" + "|".join(SPELLED) + r")\b", lambda m: _spell(m.group(1), lang), t)

    # Sites web et e-mails
    t = re.sub(r"\bwww\.", "w w w point " if not fr else "double-vé double-vé double-vé point ", t, flags=re.I)
    t = re.sub(r"(\w)\.(com|org|net|tg|fr|ci|sn|africa)\b", r"\1 point \2", t, flags=re.I)
    t = re.sub(r"(\w)@(\w)", r"\1 arobase \2" if fr else r"\1 at \2", t)

    # Formules figées des spots
    if fr:
        t = re.sub(r"\b7\s?j\s?/\s?7\b", "sept jours sur sept", t)
        t = re.sub(r"\b24\s?h\s?/\s?24\b", "vingt-quatre heures sur vingt-quatre", t)
    else:
        t = re.sub(r"\b24\s?/\s?7\b", "twenty-four seven", t)
    # Nombres commençant par 0 (téléphones, codes) : chiffre par chiffre
    units = _FR_UNITS if fr else _EN_UNITS
    t = re.sub(r"\b0\d+\b", lambda m: " ".join(units[int(c)] for c in m.group(0)), t)
    # Signe moins devant un nombre (promotions : -20 %)
    t = re.sub(r"(^|\s)-(\d)", r"\1moins \2" if fr else r"\1minus \2", t)

    # Heures : 18h30, 8h
    def hour(m):
        h, mn = int(m.group(1)), m.group(2)
        if fr:
            out = f"{fr_number(h)} heure{'s' if h > 1 else ''}"
            return out + (f" {fr_number(int(mn))}" if mn and int(mn) else "")
        return f"{en_number(h)}" + (f" {en_number(int(mn))}" if mn and int(mn) else " o'clock")
    t = re.sub(r"\b(\d{1,2})\s?[hH](\d{2})?\b", hour, t)

    # Monnaies (montant avant ou après le symbole)
    cur_fr = {"fcfa": "francs CFA", "f cfa": "francs CFA", "cfa": "francs CFA", "€": "euros", "eur": "euros",
              "$": "dollars", "usd": "dollars", "£": "livres", "ngn": "nairas", "₦": "nairas"}
    cur_en = {"fcfa": "CFA francs", "f cfa": "CFA francs", "cfa": "CFA francs", "€": "euros", "eur": "euros",
              "$": "dollars", "usd": "dollars", "£": "pounds", "ngn": "naira", "₦": "naira"}
    cur = cur_fr if fr else cur_en
    sym = r"(fcfa|f cfa|cfa|€|eur|\$|usd|£|ngn|₦)"
    dec_sep = r"[,.]" if not fr else ","
    amount = rf"({_NUM})(?:{dec_sep}(\d+))?"

    def money(m, a_idx, d_idx, s_idx):
        a, d, s = m.group(a_idx), m.group(d_idx), m.group(s_idx).lower()
        words = num(_to_int(a))
        if d and int(d):
            words += f" {cur[s]} {num(int(d))}" if s in ("€", "eur", "$", "usd", "£") else f" virgule {num(int(d))} {cur[s]}"
            return words if s in ("€", "eur", "$", "usd", "£") else words
        return f"{words} {cur[s]}"
    t = re.sub(rf"{amount}\s?{sym}(?![a-z])", lambda m: money(m, 1, 2, 3), t, flags=re.I)
    t = re.sub(rf"{sym}\s?{amount}", lambda m: money(m, 2, 3, 1), t, flags=re.I)

    # Pourcentages
    t = re.sub(rf"({_NUM})(?:[,.](\d+))?\s?%",
               lambda m: (_fr_decimal(m.group(1), m.group(2)) if fr else _en_decimal(m.group(1), m.group(2))) + (" pour cent" if fr else " percent")
               if m.group(2) else f"{num(_to_int(m.group(1)))} {'pour cent' if fr else 'percent'}", t)

    # Ordinaux : 1er, 2e, 3ème / 1st, 2nd
    if fr:
        t = re.sub(r"\b1(er|re|ère)\b", lambda m: "premier" if m.group(1) == "er" else "première", t)
        t = re.sub(r"\b(\d+)(e|è|ème|eme)\b", lambda m: _fr_ordinal(int(m.group(1))), t)
    else:
        t = re.sub(r"\b(\d+)(st|nd|rd|th)\b", lambda m: _en_ordinal(int(m.group(1))), t)

    # Décimaux puis entiers restants
    if fr:
        t = re.sub(r"\b(\d+),(\d+)\b", lambda m: _fr_decimal(m.group(1), m.group(2)), t)
    else:
        t = re.sub(r"\b(\d+)\.(\d+)\b", lambda m: _en_decimal(m.group(1), m.group(2)), t)
    if not fr:  # séparateur de milliers anglais : 1,500
        t = re.sub(r"\b\d{1,3}(?:,\d{3})+\b", lambda m: num(int(m.group(0).replace(",", ""))), t)
    t = re.sub(rf"\b({_NUM})\b", lambda m: num(_to_int(m.group(1))), t)

    # Symboles isolés
    t = t.replace("&", " et " if fr else " and ").replace("+", " plus ").replace("=", " égal " if fr else " equals ")
    t = re.sub(r"\s{2,}", " ", t)
    return t.strip()


def _fr_ordinal(n: int) -> str:
    w = fr_number(n)
    if w.endswith("cinq"):
        return w + "uième"
    if w.endswith("neuf"):
        return w[:-1] + "vième"
    if w.endswith("e"):
        w = w[:-1]
    return w + "ième"


def _en_ordinal(n: int) -> str:
    w = en_number(n)
    special = {"one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth",
               "nine": "ninth", "twelve": "twelfth"}
    last = w.split(" ")[-1].split("-")[-1]
    if last in special:
        return w[: len(w) - len(last)] + special[last]
    if last.endswith("y"):
        return w[:-1] + "ieth"
    return w + "th"
