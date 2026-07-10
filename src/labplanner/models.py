"""Pydantic data models.

All times are discretised into 30-minute slots. Within a day, slot ``i``
covers ``[i*30, (i+1)*30)`` minutes past midnight, so a day has 48 slots.
Absolute slot indices count from midnight of the horizon start day.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

SLOT_MINUTES = 30
SLOTS_PER_DAY = 24 * 60 // SLOT_MINUTES  # 48
SLOT_STATES = ("preferred", "unavailable")
# Generous upper bound; the solver checks durations against the actual horizon.
MAX_TASK_MINUTES = 60 * 24 * 60


def hhmm_to_slot(value: str) -> int:
    """``"08:30"`` -> slot-of-day index (17). Raises ValueError on bad input."""
    hh, _, mm = value.partition(":")
    h, m = int(hh), int(mm)
    if not (0 <= h <= 24 and m in (0, 30) and (h < 24 or m == 0)):
        raise ValueError(f"time must be HH:MM on a 30-minute boundary, got {value!r}")
    return h * 2 + m // 30


def slot_to_hhmm(slot: int) -> str:
    return f"{slot // 2:02d}:{(slot % 2) * 30:02d}"


class WorkCalendar(BaseModel):
    """Project-wide working calendar, editable from the UI."""

    work_start: str = "08:00"  # HH:MM on a 30-minute boundary
    work_end: str = "18:00"    # exclusive
    holidays: list[str] = Field(default_factory=list)  # ISO dates, treated as full days off

    @field_validator("work_start", "work_end")
    @classmethod
    def _valid_time(cls, v: str) -> str:
        hhmm_to_slot(v)
        return v

    @field_validator("holidays")
    @classmethod
    def _valid_dates(cls, v: list[str]) -> list[str]:
        for d in v:
            date.fromisoformat(d)
        return sorted(set(v))

    @model_validator(mode="after")
    def _start_before_end(self) -> WorkCalendar:
        if hhmm_to_slot(self.work_start) >= hhmm_to_slot(self.work_end):
            raise ValueError("work_start must be before work_end")
        return self

    @property
    def work_start_slot(self) -> int:
        return hhmm_to_slot(self.work_start)

    @property
    def work_end_slot(self) -> int:
        return hhmm_to_slot(self.work_end)


class EquipmentType(BaseModel):
    name: str
    count: int = Field(ge=0, le=99)
    # Optional custom names for the physical units; empty = auto ("VSG-1", "VSG-2", ...).
    unit_names: list[str] = Field(default_factory=list)
    # Per-unit maintenance/booking windows: unit name -> ISO date -> unavailable slot indices.
    unavailable: dict[str, dict[str, list[int]]] = Field(default_factory=dict)

    @field_validator("unit_names")
    @classmethod
    def _strip_names(cls, v: list[str]) -> list[str]:
        return [s.strip() for s in v]

    @field_validator("unavailable")
    @classmethod
    def _valid_slots(cls, v: dict[str, dict[str, list[int]]]) -> dict[str, dict[str, list[int]]]:
        for by_date in v.values():
            for iso, slots in by_date.items():
                date.fromisoformat(iso)
                for s in slots:
                    if not 0 <= s < SLOTS_PER_DAY:
                        raise ValueError(f"slot index {s} out of range 0..{SLOTS_PER_DAY - 1}")
        return v

    @model_validator(mode="after")
    def _names_match_count(self) -> EquipmentType:
        if self.unit_names:
            if len(self.unit_names) != self.count:
                raise ValueError("unit_names must have exactly `count` entries")
            if any(not n for n in self.unit_names) or \
                    len(set(self.unit_names)) != len(self.unit_names):
                raise ValueError("unit_names must be unique and non-empty")
        return self


def equipment_units(eq: EquipmentType) -> list[str]:
    """Physical unit names of a type: custom names if set, else auto-numbered."""
    if eq.unit_names:
        return list(eq.unit_names)
    if eq.count == 1:
        return [eq.name]
    return [f"{eq.name}-{i + 1}" for i in range(eq.count)]


class TimePoint(BaseModel):
    """A point in time on the 30-minute grid (used for deadlines / earliest starts)."""

    date: str          # ISO date, e.g. "2026-07-15"
    time: str = "17:00"  # HH:MM on a 30-minute boundary

    @field_validator("date")
    @classmethod
    def _valid_date(cls, v: str) -> str:
        date.fromisoformat(v)
        return v

    @field_validator("time")
    @classmethod
    def _valid_time(cls, v: str) -> str:
        hhmm_to_slot(v)
        return v

    @property
    def slot_of_day(self) -> int:
        return hhmm_to_slot(self.time)


class Task(BaseModel):
    id: str
    name: str
    minutes: int = Field(ge=SLOT_MINUTES, le=MAX_TASK_MINUTES)
    work_hours_only: bool = False
    continue_next_day: bool = False
    deadline: TimePoint | None = None          # task must END by this time
    earliest_start: TimePoint | None = None    # task may not START before this time
    pinned_start: TimePoint | None = None      # task must START exactly at this time
    depends_on: list[str] = Field(default_factory=list)  # ids of tasks that must end first
    # done -> excluded from solving; in_progress -> frozen to its last scheduled place
    status: Literal["pending", "in_progress", "done"] = "pending"
    resources: dict[str, int] = Field(default_factory=dict)  # equipment type -> quantity
    # Slot preferences: ISO date -> {slot index (as str): "preferred" | "unavailable"}
    slots: dict[str, dict[str, str]] = Field(default_factory=dict)

    @field_validator("minutes")
    @classmethod
    def _slot_aligned(cls, v: int) -> int:
        if v % SLOT_MINUTES:
            raise ValueError(f"minutes must be a multiple of {SLOT_MINUTES}")
        return v

    @field_validator("slots")
    @classmethod
    def _valid_states(cls, v: dict[str, dict[str, str]]) -> dict[str, dict[str, str]]:
        for by_date in v.values():
            for state in by_date.values():
                if state not in SLOT_STATES:
                    raise ValueError(f"slot state must be one of {SLOT_STATES}, got {state!r}")
        return v

    @field_validator("depends_on")
    @classmethod
    def _dedupe_deps(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(v))

    @model_validator(mode="after")
    def _no_self_dependency(self) -> Task:
        if self.id in self.depends_on:
            raise ValueError("a task cannot depend on itself")
        return self

    @property
    def duration_slots(self) -> int:
        return self.minutes // SLOT_MINUTES


class ScheduleSegment(BaseModel):
    start: str  # ISO datetime
    end: str
    start_slot: int
    end_slot: int


class ScheduledTask(BaseModel):
    task_id: str
    task_name: str
    units: list[str]
    segments: list[ScheduleSegment]


class Schedule(BaseModel):
    status: str
    message: str = ""
    solved_at: str | None = None
    horizon_start: str | None = None  # ISO date of day 0
    makespan_minutes: int | None = None
    solve_time_s: float | None = None
    tasks: list[ScheduledTask] = Field(default_factory=list)


class Project(BaseModel):
    calendar: WorkCalendar = Field(default_factory=WorkCalendar)
    equipment: list[EquipmentType] = Field(default_factory=list)
    tasks: list[Task] = Field(default_factory=list)  # order = priority (top first)
    schedule: Schedule | None = None

    @model_validator(mode="after")
    def _unique_unit_names(self) -> Project:
        seen: set[str] = set()
        for eq in self.equipment:
            for unit in equipment_units(eq):
                if unit in seen:
                    raise ValueError(f"duplicate unit name '{unit}' across equipment types")
                seen.add(unit)
        return self
