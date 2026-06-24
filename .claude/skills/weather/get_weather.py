#!/usr/bin/env python3
"""Fetch current weather for a city using the free Open-Meteo API (no API key).

Usage:
    python get_weather.py "Sarasota"
    python get_weather.py "Sarasota, FL"
    python get_weather.py            # defaults to Sarasota

Uses only the Python standard library. Two calls:
  1. Geocoding API  -> lat/lon for the city name
  2. Forecast API   -> current temperature, apparent temp, wind, weather code
"""
import json
import sys
import urllib.parse
import urllib.request

# Python defaults stdout to the OS code page on Windows (cp1252), which mojibakes
# the degree symbol. Force UTF-8 so output renders correctly in any terminal.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# WMO weather interpretation codes -> human text
# https://open-meteo.com/en/docs (Weather variable documentation)
WMO = {
    0: "Clear sky",
    1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    56: "Light freezing drizzle", 57: "Dense freezing drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Light freezing rain", 67: "Heavy freezing rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm w/ slight hail", 99: "Thunderstorm w/ heavy hail",
}


def _get_json(url, params):
    full = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(full, headers={"User-Agent": "tetris-weather-skill/1.0"})
    # Retry once on transient network/TLS hiccups before giving up cleanly.
    last_err = None
    for _ in range(2):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.load(resp)
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = e
    raise SystemExit(f"Network error reaching Open-Meteo: {last_err}. Check your connection and try again.")


def geocode(name):
    # The geocoder matches a place name, not "City, ST" — a state abbreviation
    # like "FL" yields no results. Try the full string, then fall back to just
    # the part before the first comma (the city).
    candidates = [name]
    if "," in name:
        candidates.append(name.split(",", 1)[0].strip())
    results = None
    for cand in candidates:
        data = _get_json(GEOCODE_URL, {"name": cand, "count": 1, "language": "en", "format": "json"})
        results = data.get("results")
        if results:
            break
    if not results:
        raise SystemExit(f"Could not find a location matching '{name}'.")
    r = results[0]
    label = ", ".join(p for p in (r.get("name"), r.get("admin1"), r.get("country")) if p)
    return r["latitude"], r["longitude"], label


def fetch_weather(lat, lon):
    return _get_json(FORECAST_URL, {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,"
                   "wind_speed_10m,weather_code,is_day",
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "timezone": "auto",
    })


def main():
    name = " ".join(sys.argv[1:]).strip() or "Sarasota"
    lat, lon, label = geocode(name)
    data = fetch_weather(lat, lon)
    cur = data.get("current", {})
    units = data.get("current_units", {})

    code = cur.get("weather_code")
    conditions = WMO.get(code, f"Unknown (code {code})")
    temp = cur.get("temperature_2m")
    feels = cur.get("apparent_temperature")
    humidity = cur.get("relative_humidity_2m")
    wind = cur.get("wind_speed_10m")
    # Display units: we request fahrenheit + mph, so normalize regardless of the
    # API's raw unit strings (Open-Meteo returns wind as "mp/h").
    t_unit = "°F"
    w_unit = "mph"
    when = cur.get("time", "")

    print(f"Weather for {label}")
    if when:
        print(f"  As of:       {when} (local)")
    print(f"  Conditions:  {conditions}")
    print(f"  Temperature: {temp}{t_unit}")
    print(f"  Feels like:  {feels}{t_unit}")
    print(f"  Humidity:    {humidity}%")
    print(f"  Wind:        {wind} {w_unit}")


if __name__ == "__main__":
    main()
