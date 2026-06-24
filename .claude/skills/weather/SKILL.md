---
name: weather
description: Get current weather for any city (temperature, feels-like, conditions, humidity, wind) using the free Open-Meteo API — no API key required. Use when the user asks for current weather, temperature, or conditions for a location.
---

# Weather

Fetches current conditions for a city via the free [Open-Meteo](https://open-meteo.com) API. No API key, no signup. Implemented in pure Python standard library (`get_weather.py`) — works anywhere Python 3 and internet access are available.

## Usage

Run the bundled script with the city name as the argument:

```bash
python "$CLAUDE_PROJECT_DIR/.claude/skills/weather/get_weather.py" "Sarasota"
```

- The argument can be a bare city (`"Sarasota"`) or city + region (`"Sarasota, FL"`); the geocoder picks the best match.
- With no argument, it defaults to **Sarasota**.
- On Windows, use `python`; on macOS/Linux use `python3` if `python` is unavailable.

## Output

Plain text, e.g.:

```
Weather for Sarasota, Florida, United States
  As of:       2026-06-22T14:00 (local)
  Conditions:  Clear sky
  Temperature: 90.1°F
  Feels like:  103.4°F
  Humidity:    58%
  Wind:        6.0 mph
```

Report these fields back to the user. Temperatures are in °F and wind in mph (set in the script).

## How it works

1. **Geocode** the city name via the Open-Meteo geocoding API → latitude/longitude + a readable label.
2. **Fetch** `current` weather (temperature, apparent temperature, humidity, wind speed, WMO weather code) for those coordinates, with `timezone=auto`.
3. **Map** the numeric WMO weather code to human-readable conditions (table in the script).

## Notes

- Open-Meteo does not provide official government weather *alerts*; if the user needs warnings/advisories, fall back to a web search of the National Weather Service.
- Network failures or an unknown city exit with a clear error message.
