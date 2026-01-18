from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from django.conf import settings
from .planets_distance import get_distance
from skyfield.api import load, utc
import math
import json
from datetime import datetime
from pathlib import Path
import urllib.request
import urllib.error


PLANET_ORDER = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']

SKYFIELD_BODIES = None
SKYFIELD_TS = None


def _get_skyfield():
    global SKYFIELD_BODIES, SKYFIELD_TS
    if SKYFIELD_TS is None:
        SKYFIELD_TS = load.timescale()
    if SKYFIELD_BODIES is None:
        base_dir = Path(getattr(settings, 'BASE_DIR', Path.cwd()))
        # Prefer the ephemeris file shipped with this project.
        eph_path = base_dir / 'de421.bsp'
        if not eph_path.exists():
            eph_path = base_dir / 'de440.bsp'
        SKYFIELD_BODIES = load(str(eph_path))
    return SKYFIELD_TS, SKYFIELD_BODIES


PLANET_FACTS = {
    # Units:
    # - day_length_hours: approximate solar day length in Earth hours
    # - year_length_earth_days: orbital period in Earth days
    # - mean_temperature_c: rough global mean (cloud tops for gas giants)
    # - gravity_ms2: surface gravity at 1 bar / surface (approx)
    # - atmosphere: short description
    # - moons: known moons count (can change with new discoveries)
    'mercury': {
        'day_length_hours': 4222.6,
        'year_length_earth_days': 87.969,
        'mean_temperature_c': 167,
        'gravity_ms2': 3.7,
        'atmosphere': 'Extremely thin exosphere (oxygen, sodium, hydrogen, helium, potassium).',
        'moons': 0,
    },
    'venus': {
        'day_length_hours': 2802.0,
        'year_length_earth_days': 224.701,
        'mean_temperature_c': 464,
        'gravity_ms2': 8.87,
        'atmosphere': 'Very thick CO₂ atmosphere with sulfuric-acid clouds; extreme greenhouse effect.',
        'moons': 0,
    },
    'earth': {
        'day_length_hours': 24.0,
        'year_length_earth_days': 365.256,
        'mean_temperature_c': 15,
        'gravity_ms2': 9.81,
        'atmosphere': 'Nitrogen–oxygen atmosphere; water vapor and trace gases.',
        'moons': 1,
    },
    'mars': {
        'day_length_hours': 24.6597,
        'year_length_earth_days': 686.98,
        'mean_temperature_c': -65,
        'gravity_ms2': 3.71,
        'atmosphere': 'Thin CO₂ atmosphere; dust and seasonal polar caps.',
        'moons': 2,
    },
    'jupiter': {
        'day_length_hours': 9.925,
        'year_length_earth_days': 4332.59,
        'mean_temperature_c': -110,
        'gravity_ms2': 24.79,
        'atmosphere': 'Mostly hydrogen and helium; clouds of ammonia and water.',
        'moons': 95,
    },
    'saturn': {
        'day_length_hours': 10.7,
        'year_length_earth_days': 10759.22,
        'mean_temperature_c': -140,
        'gravity_ms2': 10.44,
        'atmosphere': 'Mostly hydrogen and helium; ammonia clouds; prominent ring system.',
        'moons': 146,
    },
    'uranus': {
        'day_length_hours': 17.24,
        'year_length_earth_days': 30688.5,
        'mean_temperature_c': -195,
        'gravity_ms2': 8.69,
        'atmosphere': 'Hydrogen, helium, and methane; ice giant.',
        'moons': 27,
    },
    'neptune': {
        'day_length_hours': 16.11,
        'year_length_earth_days': 60182.0,
        'mean_temperature_c': -200,
        'gravity_ms2': 11.15,
        'atmosphere': 'Hydrogen, helium, and methane; ice giant with strong winds.',
        'moons': 14,
    },
    'sun': {
        'day_length_hours': 609.12,  # approximate solar rotation (25.4 days)
        'year_length_earth_days': None,
        'mean_temperature_c': 5505,  # approximate in Celsius (~5778 K)
        'gravity_ms2': 274.0,
        'atmosphere': 'Ionized plasma (photosphere, chromosphere, corona); no solid surface.',
        'composition': 'Mostly hydrogen (~73%) and helium (~25%) by mass, with traces of heavier elements (O, C, Ne, Fe, etc.).',
        'moons': 0,
    },
}


def _parse_date_utc(date_str: str | None):
    if date_str:
        return datetime.strptime(date_str, '%Y-%m-%d').replace(tzinfo=utc)
    return datetime.utcnow().replace(tzinfo=utc)


def _planet_sf_key(planet_id: str):
    return {
        'mercury': 'mercury',
        'venus': 'venus',
        'earth': 'earth',
        'mars': 'mars barycenter',
        'jupiter': 'jupiter barycenter',
        'saturn': 'saturn barycenter',
        'uranus': 'uranus barycenter',
        'neptune': 'neptune barycenter',
    }.get(planet_id)


def _heliocentric_angle_rad(ts, bodies, planet_id: str, when_dt):
    sf_key = _planet_sf_key(planet_id)
    if not sf_key:
        raise KeyError('unknown planet')
    sun = bodies['sun']
    t = ts.from_datetime(when_dt)
    vec = sun.at(t).observe(bodies[sf_key]).position.km
    return math.atan2(vec[1], vec[0])


@require_GET
def planet_info_api(request):
    planet_id = (request.GET.get('planet') or '').strip().lower()
    if planet_id not in PLANET_FACTS:
        return JsonResponse({'error': 'Unknown planet.'}, status=400)

    date_str = request.GET.get('date')
    selected_date = _parse_date_utc(date_str)

    ts, bodies = _get_skyfield()

    facts = PLANET_FACTS[planet_id]
    day_length_hours = float(facts['day_length_hours'])
    # year_length_earth_days may be None for bodies like the Sun
    raw_year_len = facts.get('year_length_earth_days')
    year_length_earth_days = float(raw_year_len) if raw_year_len is not None else None
    year_length_local_days = (year_length_earth_days * 24.0) / day_length_hours if (year_length_earth_days is not None and day_length_hours) else None

    # Compute orbital progress vs a fixed reference epoch (J2000)
    # For the Sun (or bodies without an orbital period) we provide sensible defaults.
    if planet_id == 'sun' or year_length_earth_days is None:
        year_progress = 0.0
    else:
        ref_date = datetime(2000, 1, 1, tzinfo=utc)
        angle_now = _heliocentric_angle_rad(ts, bodies, planet_id, selected_date)
        angle_ref = _heliocentric_angle_rad(ts, bodies, planet_id, ref_date)
        two_pi = math.pi * 2
        delta = (angle_now - angle_ref) % two_pi
        year_progress = delta / two_pi  # 0..1

    # Day-of-year indices (1-based) when year length is known
    day_of_year_earth_days = int(math.floor(year_progress * year_length_earth_days) + 1) if year_length_earth_days is not None else None
    day_of_year_local_days = int(math.floor(year_progress * year_length_local_days) + 1) if year_length_local_days else None

    payload = {
        'planet': planet_id,
        'date': selected_date.strftime('%Y-%m-%d'),
        'day_length_hours': day_length_hours,
        'year_length_earth_days': year_length_earth_days,
        'year_length_local_days': year_length_local_days,
        'year_progress': year_progress,
        'day_of_year_earth_days': day_of_year_earth_days,
        'day_of_year_local_days': day_of_year_local_days,
        'mean_temperature_c': facts['mean_temperature_c'],
        'gravity_ms2': facts['gravity_ms2'],
        'atmosphere': facts['atmosphere'],
        'composition': facts.get('composition'),
        'moons': facts['moons'],
    }
    return JsonResponse(payload)


def _fetch_text_url(url: str, timeout: float = 6.0) -> str:
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'planets_web (Django)',
            'Accept': 'text/plain, application/json;q=0.9, */*;q=0.8',
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        charset = resp.headers.get_content_charset() or 'utf-8'
        return resp.read().decode(charset, errors='replace')


def _fetch_json_url(url: str, timeout: float = 6.0):
    text = _fetch_text_url(url, timeout=timeout)
    return json.loads(text)


@require_GET
def space_weather_api(request):
    """Return ONLY the next predicted storm time (best-effort).

    We avoid inventing dates. If NOAA SWPC forecast products are unavailable (offline, blocked,
    format changes), we return `next_predicted_geomagnetic_storm_utc = None` and include `error`.
    """
    retrieved_at = datetime.utcnow().replace(tzinfo=utc)

    payload = {
        'next_predicted_geomagnetic_storm_utc': None,
        'retrieved_at_utc': retrieved_at.strftime('%Y-%m-%d %H:%M:%S'),
    }

    try:
        # Forecast: planetary K-index forecast includes future time buckets (storms)
        # This is a table-like JSON array; we pick the earliest future time with elevated Kp.
        kp_forecast = _fetch_text_url('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json')
        kp = json.loads(kp_forecast)
        # Format: [ ["time_tag","kp","a","g"], ["2026-...", "4.00", ...], ...]
        if isinstance(kp, list) and len(kp) > 1 and isinstance(kp[0], list):
            headers = kp[0]
            rows = kp[1:]
            time_idx = headers.index('time_tag') if 'time_tag' in headers else 0
            kp_idx = headers.index('kp') if 'kp' in headers else 1
            now_iso = retrieved_at.strftime('%Y-%m-%dT%H:%M:%SZ')
            for row in rows:
                try:
                    t = str(row[time_idx])
                    kp_val = float(row[kp_idx])
                except Exception:
                    continue
                # “storm” threshold varies, but Kp >= 5 is commonly used as storm-level.
                if t > now_iso and kp_val >= 5.0:
                    payload['next_predicted_geomagnetic_storm_utc'] = t
                    break

    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError) as e:
        payload['error'] = f'Space weather data not available: {str(e)}'

    return JsonResponse(payload)

def home_view(request):       
    planets = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]
    return render(request, 'planets/index.html', {'planets': planets})

def distance_view(request, planet_name):
    try:
        distance = get_distance(planet_name)
        return render(request, 'planets/distance.html', {
            'planet_name': planet_name,
            'distance': int(distance)
        })
    except KeyError:
        return render(request, 'planets/error.html', {'message': 'Planet not found.'})

def orbits(request):
    # Procesar la fecha seleccionada
    date_str = request.GET.get('date')
    if date_str:
        selected_date = datetime.strptime(date_str, '%Y-%m-%d').replace(tzinfo=utc)
    else:
        selected_date = datetime.utcnow().replace(tzinfo=utc)

    ts, bodies = _get_skyfield()
    t = ts.from_datetime(selected_date)
    sun = bodies['sun']

    planet_names = PLANET_ORDER
    # Progressive radii: smaller gaps near center, increasing outward (geometric)
    base = 60
    growth = 1.35
    raw_radii = [base * (growth ** i) for i in range(len(planet_names))]
    # Scale radii so the outermost orbit nearly touches the SVG frame without overflowing.
    svg_center = 800
    margin = 40
    max_allow = svg_center - margin
    max_raw = max(raw_radii) if raw_radii else 1
    scale = (max_allow / max_raw) if max_raw > 0 else 1
    radii = [round(r * scale) for r in raw_radii]

    sf_planets = {
        'mercury': bodies['mercury'],
        'venus': bodies['venus'],
        'earth': bodies['earth'],
        'mars': bodies['mars barycenter'],
        'jupiter': bodies['jupiter barycenter'],
        'saturn': bodies['saturn barycenter'],
        'uranus': bodies['uranus barycenter'],
        'neptune': bodies['neptune barycenter']
    }

    positions = {}
    for i, name in enumerate(planet_names):
        vec = sun.at(t).observe(sf_planets[name]).position.km
        angle = math.atan2(vec[1], vec[0])
        positions[name] = {
            'radius': radii[i],
            'angle': angle
        }

    periods = {
        'mercury': 88,
        'venus': 225,
        'earth': 365,
        'mars': 687,
        'jupiter': 4333,
        'saturn': 10759,
        'uranus': 30687,
        'neptune': 60190
    }

    return render(request, 'planets/orbits.html', {
        'positions_json': json.dumps(positions),
        'periods_json': json.dumps(periods),
        'selected_date': selected_date.strftime('%Y-%m-%d'),
        'radii_list': radii,
    })

def pagina2(request):
    return render(request, 'planets/pagina2.html')

def pagina3(request):
    return render(request, 'planets/pagina3.html')
