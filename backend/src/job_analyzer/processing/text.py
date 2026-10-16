"""Text sanitisation helpers shared by cleaning, classification and skill extraction."""

from __future__ import annotations

import html
import re
import unicodedata

from bs4 import BeautifulSoup

# Zero-width characters, bidi marks, line/paragraph separators and the BOM.
_INVISIBLE_CODEPOINTS = (0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x2028, 0x2029, 0xFEFF)
_INVISIBLE = "".join(chr(codepoint) for codepoint in _INVISIBLE_CODEPOINTS)

_HTML_HINT = re.compile(r"<[a-zA-Z/!][^>]*>")
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f" + _INVISIBLE + "]")
_WHITESPACE = re.compile(r"\s+")
# Gupy sometimes breaks a list item after its capital ("...dados;E\nxcel"): a capital letter alone
# at the start of an item belongs to the next line.
_SPLIT_INITIAL = re.compile(r"(?:^|(?<=[;:•]))([A-ZÀ-Ú])\n(?=[A-Za-zÀ-ÿ])", re.MULTILINE)


def html_to_text(raw: str | None, *, keep_lines: bool = False) -> str:
    """Convert (possibly HTML) content to plain text: tags removed, entities decoded,
    unicode normalised, control/zero-width characters dropped and whitespace collapsed.
    With `keep_lines`, block boundaries (paragraphs, list items, <br>) survive as newlines, which
    section detection needs ("Requisitos", "Diferenciais"...).
    Non-string values (None, or NaN coming from Pandas) become an empty string."""
    if not isinstance(raw, str) or not raw:
        return ""
    text = _html_text(raw) if _HTML_HINT.search(raw) else html.unescape(raw)
    text = _SPLIT_INITIAL.sub(r"\1", unicodedata.normalize("NFKC", text))
    if not keep_lines:
        return _WHITESPACE.sub(" ", _CONTROL_CHARS.sub(" ", text)).strip()
    # Same cleaning, line by line; empty lines are dropped.
    lines = (
        _WHITESPACE.sub(" ", _CONTROL_CHARS.sub(" ", line)).strip() for line in text.splitlines()
    )
    return "\n".join(line for line in lines if line)


_BLOCK_TAGS = (
    *("p", "div", "br", "hr", "li", "ul", "ol", "dl", "dt", "dd", "table", "tr", "td", "th"),
    *("h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "header", "footer"),
    *("blockquote", "pre"),
)


def _html_text(raw: str) -> str:
    """Text of an HTML fragment with a line break around block elements only: inline markup
    must not split words ("<b>E</b>xcel" is "Excel", not "E xcel")."""
    soup = BeautifulSoup(raw, "html.parser")
    for tag in soup.find_all(_BLOCK_TAGS):
        tag.insert_before("\n")
        tag.insert_after("\n")
    return soup.get_text()


def clean_inline(raw: str | None, max_length: int = 300) -> str | None:
    """Single-line field (title, company, location): plain text, bounded length, None if empty."""
    text = html_to_text(raw)[:max_length].strip()
    return text or None


def strip_accents(text: str) -> str:
    """'Estágio em Automação' -> 'Estagio em Automacao' (keeps case)."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def matching_form(text: str) -> str:
    """Canonical form used by every regex in the project: accent-free, original case."""
    return strip_accents(text)
