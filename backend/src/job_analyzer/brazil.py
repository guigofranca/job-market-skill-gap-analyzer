"""Brazil-only scope: the project covers the Brazilian market, so sources drop foreign postings."""

from __future__ import annotations

import unicodedata
from datetime import date, datetime, timedelta, timezone
from typing import Final

# Brasília time. Brazil has had no daylight saving time since 2019, so a fixed offset is exact
# and needs no tz database (absent from slim containers and some Windows installs).
BRASILIA: Final = timezone(timedelta(hours=-3), "BRT")


def brazil_today() -> date:
    """Today's date in Brasília: application deadlines are Brazilian calendar days."""
    return datetime.now(BRASILIA).date()


BRAZILIAN_STATES: Final[dict[str, str]] = {
    "AC": "Acre",
    "AL": "Alagoas",
    "AP": "Amapá",
    "AM": "Amazonas",
    "BA": "Bahia",
    "CE": "Ceará",
    "DF": "Distrito Federal",
    "ES": "Espírito Santo",
    "GO": "Goiás",
    "MA": "Maranhão",
    "MT": "Mato Grosso",
    "MS": "Mato Grosso do Sul",
    "MG": "Minas Gerais",
    "PA": "Pará",
    "PB": "Paraíba",
    "PR": "Paraná",
    "PE": "Pernambuco",
    "PI": "Piauí",
    "RJ": "Rio de Janeiro",
    "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul",
    "RO": "Rondônia",
    "RR": "Roraima",
    "SC": "Santa Catarina",
    "SP": "São Paulo",
    "SE": "Sergipe",
    "TO": "Tocantins",
}


def _key(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    plain = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(plain.casefold().split())


_CODE_BY_KEY: Final = {
    _key(text): code for code, name in BRAZILIAN_STATES.items() for text in (code, name)
}
_COUNTRY_KEYS: Final = frozenset({"brasil", "brazil", "br"})


def state_code(value: object) -> str | None:
    """'SP', 'São Paulo', 'sao paulo' -> 'SP'; anything else ('Ciudad de México') -> None."""
    return _CODE_BY_KEY.get(_key(value)) if isinstance(value, str) else None


def is_brazilian_state(value: object) -> bool:
    return state_code(value) is not None


def is_brazil(country: object) -> bool:
    return isinstance(country, str) and _key(country) in _COUNTRY_KEYS
