"""Build a styled .xlsx workbook from tabular data (used by the schedule export)."""

from __future__ import annotations

import re
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

MAX_ROWS = 20_000
MAX_COLS = 64
_INVALID_SHEET = re.compile(r"[\\/*?:\[\]]")


def _sheet_title(name: str) -> str:
    title = _INVALID_SHEET.sub(" ", name or "").strip()
    return title[:31] or "Sheet1"


def build_workbook(columns: list[str], rows: list[list], sheet_name: str = "Sheet1") -> bytes:
    """Return the bytes of a single-sheet .xlsx with a bold, frozen header row.

    Columns are auto-filtered and auto-sized; the header stays visible on scroll.
    """
    columns = [str(c) for c in columns[:MAX_COLS]]
    ncols = len(columns)
    wb = Workbook()
    ws = wb.active
    ws.title = _sheet_title(sheet_name)

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="2563EB")
    ws.append(columns)
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(vertical="center")

    widths = [len(c) for c in columns]
    for row in rows[:MAX_ROWS]:
        values = [_coerce(v) for v in row[:ncols]]
        values += [None] * (ncols - len(values))
        ws.append(values)
        for i, v in enumerate(values):
            if v is not None:
                widths[i] = max(widths[i], len(str(v)))

    if ncols:
        last_col = get_column_letter(ncols)
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = f"A1:{last_col}{ws.max_row}"
        for i, width in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = min(60, max(10, width + 2))

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _coerce(value):
    """Keep numbers numeric so Excel treats them as numbers; everything else -> str."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) or value is None:
        return value
    return str(value)
