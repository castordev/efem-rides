// Obtener posiciones desde Django y covertirlos en objeto usable para javascript
// .parse convierte el string en objeto
// .textContent devuelve el texto dentro del html
const positions = JSON.parse(document.getElementById('positions-data').textContent);

/* esto da como resultado

positions = {
  earth: { radius: 300, angle: 1.57 },
  mars: { radius: 350, angle: 0.9 }
}

*/

// declaramos el centro del lienzo SVG
const center = 1600 / 2;

//llamamos a la API para pedir informacion y si da error devolvemos null para que no la lie
//si try funciona devuelve el texto convertido a objeto y si falla va a catch y devuelve null
function safeParseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

// si el  id es por ejemplo mars, devuelve Mars y si es null devuelve Planet
// "sun" → "Sun", "" → "Planet"
// id.slice(1) devuelve el String desde el segundo caracter (el 0 cuenta jeje)
function titleFromId(id) {
    if (!id) return 'Planet';
    return id.charAt(0).toUpperCase() + id.slice(1);
}


// bloque para que la ejecucion de todo el codigo se retrase hasta que el html este cargado
// estructura de window.addEventListener (type,listener,options(options es opcional))
// Cuando el DOMContentLoaded este listo se ejecuta el listener, en este caso todo el script
// () => {} funcion flecha
window.addEventListener('DOMContentLoaded', () => {

    //constante para orden de los planetas
    const planetOrder = ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune'];

    // const para botones clicables, empezando en el sol y seguido por la const planetOrder
    // ... desempaqueta los elementos de un array dentro de otro array
    const clickableBodies = ['sun', ...planetOrder];


    // orbitEls contiene los elementos de .orbit
    const orbitEls = document.querySelectorAll('.orbit');

    // cont radiusMap = {} crea un objeto vacio para guardar radios por planeta
    const radiusMap = {};

    // p(planeta), i (indice)
    // bucle, la constante orbitEl cambia cada vuelta por el planeta del array en orden (orbitsEls[i])
    planetOrder.forEach((p, i) => {
        const orbitEl = orbitEls[i];

        //Aseguramos que los planetas coincidan con la orbita
        if (orbitEl && orbitEl.getAttribute('r')) radiusMap[p] = parseFloat(orbitEl.getAttribute('r'));

        //si no hay planeta la orbita sale igual porque si, no se, chatgpt me dijo que pusiera esto aqui 
        else if (positions[p] && positions[p].radius) radiusMap[p] = positions[p].radius;
    });


    // informacion de los planetas en el pop up
    const modalOverlay = document.getElementById('planet-modal-overlay');
    const modal = document.getElementById('planet-modal');
    const modalTitle = document.getElementById('planet-modal-title');
    const modalBody = document.getElementById('planet-modal-body');
    const modalClose = document.getElementById('planet-modal-close');

    const planetInfoEl = document.getElementById('planet-info-data');
    // Optional user notes per planet (editable in HTML)
    const planetInfo = planetInfoEl ? (safeParseJson(planetInfoEl.textContent) || {}) : {};

    const dateInput = document.getElementById('date');

    function formatNumber(n, digits = 2) {
        if (n === null || n === undefined) return '—';
        const x = Number(n);
        if (Number.isNaN(x)) return '—';
        return x.toFixed(digits);
    }

    function formatMaybeInt(n) {
        if (n === null || n === undefined) return '—';
        const x = Number(n);
        if (Number.isNaN(x)) return '—';
        return String(Math.round(x));
    }

    function buildPlanetText(apiData, notes) {
        const lines = [];
        const planetKey = (apiData.planet || '').toLowerCase();
        lines.push(`Day length: ${formatNumber(apiData.day_length_hours, 2)} hours`);
        // Omitir la longitud del año en días terrestres para la Tierra (redundante)
        // y para el Sol (no aplica / no queremos mostrarlo).
        if (planetKey !== 'earth' && planetKey !== 'sun') {
            lines.push(`Year length: ${formatNumber(apiData.year_length_earth_days, 2)} Earth days`);
        }
        // Para el Sol, ocultar también el "year length" en días locales.
        if (planetKey !== 'sun' && apiData.year_length_local_days !== null && apiData.year_length_local_days !== undefined) {
            lines.push(`Year length: ${formatNumber(apiData.year_length_local_days, 2)} local days`);
        }
        lines.push(`Gravity: ${formatNumber(apiData.gravity_ms2, 2)} m/s²`);
        lines.push(`Mean temperature: ${formatMaybeInt(apiData.mean_temperature_c)} °C`);
        lines.push(`Atmosphere: ${apiData.atmosphere || '—'}`);
        if (apiData.composition) {
            lines.push(`Composition: ${apiData.composition}`);
        }
        // Para el Sol, no mostrar número de lunas.
        if (planetKey !== 'sun') {
            lines.push(`Moons: ${apiData.moons ?? '—'}`);
        }
        lines.push('');

        // Para el Sol, ocultar: orbit progress y day-of-year.
        if (planetKey !== 'sun') {
            lines.push(`Orbit progress on ${apiData.date}: ${(Number(apiData.year_progress) * 100).toFixed(1)}%`);
            // Omitir "Day of year" en escala de días terrestres para la Tierra (redundante)
            if (planetKey !== 'earth') {
                lines.push(`Day of year (Earth-day scale): ${apiData.day_of_year_earth_days} / ${formatNumber(apiData.year_length_earth_days, 0)}`);
            }
            if (apiData.day_of_year_local_days !== null && apiData.day_of_year_local_days !== undefined) {
                lines.push(`Day of year (local-day scale): ${apiData.day_of_year_local_days} / ${formatNumber(apiData.year_length_local_days, 0)}`);
            }
        }
        const notesText = String(notes ?? '').trim();
        const isPlaceholderNotes = /^write your notes\b/i.test(notesText);
        if (notesText && !isPlaceholderNotes) {
            lines.push('');
            lines.push('Notes:');
            lines.push(notesText);
        }
        return lines.join('\n');
    }

    // Escape text for safe HTML insertion
    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (c) => {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    // Get a usable image src for a planet: prefer the existing SVG image element's
    // href/xlink:href attribute; fallback to the static path.
    function getPlanetImageSrc(planetId) {
        try {
            const el = document.getElementById(planetId);
            if (el) {
                return el.getAttribute('href') || el.getAttribute('xlink:href') || el.getAttribute('src') || (`/static/planets/gifs/${planetId}.gif`);
            }
        } catch (e) {
            // ignore
        }
        return `/static/planets/gifs/${planetId}.gif`;
    }

    function positionModalNearPoint(point) {
        if (!modal) return;
        const margin = 12;
        const offset = 14;

        // Ensure we can measure it
        modal.style.visibility = 'hidden';
        modal.style.left = `${Math.round(margin)}px`;
        modal.style.top = `${Math.round(margin)}px`;

        requestAnimationFrame(() => {
            const rect = modal.getBoundingClientRect();
            const w = rect.width || 320;
            const h = rect.height || 180;

            let left = point.x + offset;
            let top = point.y + offset;

            // If it would overflow to the right, try placing to the left of the point
            if (left + w > window.innerWidth - margin) {
                left = point.x - offset - w;
            }
            // If it would overflow to the bottom, clamp upward
            if (top + h > window.innerHeight - margin) {
                top = window.innerHeight - margin - h;
            }

            left = Math.min(Math.max(margin, left), window.innerWidth - margin - w);
            top = Math.min(Math.max(margin, top), window.innerHeight - margin - h);

            modal.style.left = `${Math.round(left)}px`;
            modal.style.top = `${Math.round(top)}px`;
            modal.style.visibility = 'visible';
        });
    }

    async function openPlanetModal(planetId, point) {
        if (!modalOverlay || !modalTitle || !modalBody) return;
        const info = planetInfo[planetId] || {};
        const title = info.title || titleFromId(planetId);
        modalTitle.textContent = title;
        modalBody.textContent = 'Loading...';
        modalOverlay.hidden = false;
        if (point) positionModalNearPoint(point);
        if (modalClose) modalClose.focus();
        document.addEventListener('keydown', escCloseHandler);

        const selected = dateInput && dateInput.value ? dateInput.value : '';
        const url = `/api/planet-info/?planet=${encodeURIComponent(planetId)}&date=${encodeURIComponent(selected)}`;
        try {
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data && data.error) throw new Error(data.error);
            const notes = info.notes || '';

            let text = buildPlanetText(data, notes);

            // Prepare planet image info for later rendering in the modal
            const imgSrc = getPlanetImageSrc(planetId);
            // Use Jupiter's SVG width as base but DOUBLE it for the popup image
            // so the modal image is larger while SVG orbit images remain unchanged.
            let imgWidth = 90;
            try {
                const jupEl = document.getElementById('jupiter');
                if (jupEl) {
                    const base = parseFloat(jupEl.getAttribute('width')) || imgWidth;
                    imgWidth = base * 2;
                } else {
                    const srcEl = document.getElementById(planetId);
                    const base = srcEl ? (parseFloat(srcEl.getAttribute('width')) || imgWidth) : imgWidth;
                    imgWidth = base * 2;
                }
            } catch (e) {
                // ignore
            }
            const imgHtml = `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(title)}" style="width:${Math.round(imgWidth)}px;height:auto;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.2);flex:0 0 auto">`;

            // Extra info for the Sun: show ONLY the next predicted storm time.
            if (planetId === 'sun') {
                try {
                    const swUrl = `/api/space-weather/?date=${encodeURIComponent(selected)}`;
                    const swRes = await fetch(swUrl, { headers: { 'Accept': 'application/json' } });
                    if (swRes.ok) {
                        const sw = await swRes.json();
                        const nextStorm = sw.next_predicted_geomagnetic_storm_utc || '—';
                        text += `\n\nNext predicted solar storm (UTC): ${nextStorm}`;
                    }
                } catch {
                    // ignore, we keep the base Sun info
                }
            }

            // Render modal with image + text (apply any extra text appended above)
            modalBody.innerHTML = `<div style="display:flex;align-items:flex-start;gap:12px">${imgHtml}<pre style="margin:0;white-space:pre-wrap;font-family:inherit">${escapeHtml(text)}</pre></div>`;
        } catch (err) {
            modalBody.textContent = `Could not load data. ${String(err && err.message ? err.message : err)}`;
        }
    }

    function closePlanetModal() {
        if (!modalOverlay) return;
        modalOverlay.hidden = true;
        document.removeEventListener('keydown', escCloseHandler);
    }

    function escCloseHandler(e) {
        if (e.key === 'Escape') closePlanetModal();
    }

    if (modalClose) modalClose.addEventListener('click', closePlanetModal);
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            // Close when clicking outside the window
            if (e.target === modalOverlay) closePlanetModal();
        });
    }
    if (modal) {
        modal.addEventListener('click', (e) => e.stopPropagation());
    }

    for (let planet in positions) {
        const el = document.getElementById(planet);
        if (!el) continue;

        const pos = positions[planet];
        const r = (radiusMap[planet] !== undefined) ? radiusMap[planet] : pos.radius;
        const cx = center + r * Math.cos(pos.angle);
        const cy = center - r * Math.sin(pos.angle);

        // Support both <circle> (cx/cy) and <image> (x/y)
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'image') {
            const w = parseFloat(el.getAttribute('width')) || 24;
            const h = parseFloat(el.getAttribute('height')) || 24;
            el.setAttribute('x', cx - (w / 2));
            el.setAttribute('y', cy - (h / 2));
        } else {
            el.setAttribute('cx', cx);
            el.setAttribute('cy', cy);
        }
    }
    
    // Planet tooltip that follows cursor
    const tooltip = document.getElementById('planet-tooltip');
    if (tooltip) {
        // IMPORTANT: the solar system is inside a transformed container.
        // A transformed ancestor can make `position: fixed` behave like `absolute`.
        // Move the tooltip to <body> so clientX/clientY map correctly to the viewport.
        if (tooltip.parentElement !== document.body) {
            document.body.appendChild(tooltip);
        }

        const planetsWithNames = document.querySelectorAll('.solar-system image[data-name]');
        planetsWithNames.forEach((planet) => {
            planet.addEventListener('mouseenter', (e) => {
                tooltip.textContent = planet.getAttribute('data-name');
                tooltip.classList.add('visible');
            });
            
            planet.addEventListener('mousemove', (e) => {
                // Cerca del puntero, pero sin taparlo
                tooltip.style.left = (e.clientX + 10) + 'px';
                tooltip.style.top = (e.clientY + 10) + 'px';
            });
            
            planet.addEventListener('mouseleave', () => {
                tooltip.classList.remove('visible');
            });
        });
    }

    // Register clicks on planets (only the expected ones)
    clickableBodies.forEach((planetId) => {
        const el = document.getElementById(planetId);
        if (!el) return;
        // accesibilidad básica
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', `View information about ${titleFromId(planetId)}`);

        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openPlanetModal(planetId, { x: e.clientX, y: e.clientY });
        });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const r = el.getBoundingClientRect();
                openPlanetModal(planetId, { x: r.right, y: r.top });
            }
        });
    });

    // Generar cinturón de asteroides entre Marte y Júpiter
    function generateAsteroidBelt(count = 250, gap = 40) {
        const beltGroup = document.getElementById('asteroid-belt');
        if (!beltGroup) return;
        while (beltGroup.firstChild) beltGroup.removeChild(beltGroup.firstChild);

        // Prefer fixed orbit radii from SVG so belt is independent of the date
        const orbitEls = document.querySelectorAll('.orbit');
        let marsR = null, jupiterR = null;
        if (orbitEls && orbitEls.length >= 5) {
            // order: mercury, venus, earth, mars, jupiter, ... (0-based)
            marsR = parseFloat(orbitEls[3].getAttribute('r'));
            jupiterR = parseFloat(orbitEls[4].getAttribute('r'));
        }
        // fallback to fixed radii if SVG not present. Avoid using `positions` here
        // because `positions` changes with the selected date and would make the
        // belt move between reloads. Prefer SVG orbit radii; otherwise use
        // stable defaults.
        if (!marsR || !jupiterR) {
            const defaultMarsR = 288;
            const defaultJupiterR = 360;
            marsR = marsR || defaultMarsR;
            jupiterR = jupiterR || defaultJupiterR;
        }

        // Increase separation between belt and planet orbits.
        // `extraPadding` widens the gap beyond the caller-provided `gap`.
        const extraPadding = 30; // px of additional separation
        const effectiveGap = gap + extraPadding;
        let minR = Math.min(marsR, jupiterR) + effectiveGap;
        let maxR = Math.max(marsR, jupiterR) - effectiveGap;
        if (minR >= maxR) {
            const fallbackGap = Math.max(10, Math.floor(effectiveGap / 2));
            minR = Math.min(marsR, jupiterR) + fallbackGap;
            maxR = Math.max(marsR, jupiterR) - fallbackGap;
        }

        // Deterministic placement using index-based sequence (golden ratio spacing)
        // This avoids any use of Math.random() or time-varying data so positions
        // remain identical between reloads and date changes.
        const SVG_NS = 'http://www.w3.org/2000/svg';
        const phi = 0.618033988749895; // 1/phi
        function fract(x) { return x - Math.floor(x); }
        for (let i = 0; i < count; i++) {
            // angle spaced by irrational multiplier to avoid clustering
            const angle = fract(i * phi) * Math.PI * 2;
            // radius distributed across band; add a small deterministic jitter
            const bandPos = i / count;
            const baseR = minR + bandPos * Math.max(0, (maxR - minR));
            const jitter = (fract(Math.sin(i * 12.9898) * 43758.5453) - 0.5) * 8; // +/-4px
            const r = Math.max(minR, Math.min(maxR, baseR + jitter));
            const cx = center + r * Math.cos(angle);
            const cy = center - r * Math.sin(angle);
            const dot = document.createElementNS(SVG_NS, 'circle');
            dot.setAttribute('cx', cx);
            dot.setAttribute('cy', cy);
            const rr = 0.8 + fract(Math.cos(i * 7.123) * 10000) * 1.8; // size 0.8-2.6
            dot.setAttribute('r', rr);
            dot.setAttribute('fill', '#9e9e9e');
            dot.setAttribute('opacity', '0.95');
            beltGroup.appendChild(dot);
        }
    }

    generateAsteroidBelt(250, 40);

    // Button to set today's date
    const todayBtn = document.getElementById('today-btn');
    const dateForm = document.getElementById('date-form');
    const calendarBtn = document.getElementById('calendar-btn');
    const customPicker = document.getElementById('custom-datepicker');

    if (todayBtn && dateInput) {
        todayBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const today = new Date().toISOString().split('T')[0];
            dateInput.value = today;
            if (dateForm) dateForm.submit();
        });
    }

    function formatDateYMD(d) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${mm}-${dd}`;
    }

    function renderDatepicker(monthDate) {
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const first = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

        let html = `
          <div class="dp-header">
            <button type="button" class="dp-nav-btn" data-action="prev">◀</button>
            <div class="dp-title">${monthNames[month]} ${year}</div>
            <button type="button" class="dp-nav-btn" data-action="next">▶</button>
          </div>
          <div class="dp-weekdays"><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div></div>
          <div class="dp-grid">
        `;

        const firstWeekday = (first.getDay() + 6) % 7;
        for (let i = 0; i < firstWeekday; i++) html += `<div></div>`;

        for (let d = 1; d <= daysInMonth; d++) {
            const cur = new Date(year, month, d);
            const isToday = dateInput.value === formatDateYMD(cur);
            html += `<button type="button" class="dp-day" data-day="${d}" ${isToday? 'aria-current="date"':''}>${d}</button>`;
        }

        html += `</div>`;
        customPicker.innerHTML = html;

        // nav buttons: change month
        customPicker.querySelectorAll('.dp-nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.getAttribute('data-action');
                const newMonthDate = new Date(year, month + (action === 'next' ? 1 : -1), 1);
                renderDatepicker(newMonthDate);
            });
        });

        customPicker.querySelectorAll('.dp-day').forEach(btn => {
            btn.addEventListener('click', () => {
                const day = Number(btn.getAttribute('data-day'));
                const chosen = new Date(year, month, day);
                dateInput.value = formatDateYMD(chosen);
                hideDatepicker();
                if (dateForm) dateForm.submit();
            });
        });
    }

    function showDatepicker() {
        if (!customPicker) return;
        const base = dateInput && dateInput.value ? new Date(dateInput.value) : new Date();
        renderDatepicker(base);
        customPicker.classList.add('open');
        customPicker.setAttribute('aria-hidden', 'false');
        document.addEventListener('click', outsideClickHandler);
    }

    function hideDatepicker() {
        if (!customPicker) return;
        customPicker.classList.remove('open');
        customPicker.setAttribute('aria-hidden', 'true');
        document.removeEventListener('click', outsideClickHandler);
    }

    function outsideClickHandler(e) {
        if (!customPicker) return;
        if (customPicker.contains(e.target) || (calendarBtn && calendarBtn.contains(e.target)) || (dateInput && dateInput.contains(e.target))) return;
        hideDatepicker();
    }

    if (calendarBtn) {
        calendarBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (customPicker && customPicker.classList.contains('open')) hideDatepicker(); else showDatepicker();
        });
    }

    function normalizeAndValidateDate() {
        if (!dateInput) return false;
        const v = dateInput.value.trim();
        if (!v) return false;
        // Try to parse user input into a Date
        const parsed = new Date(v);
        if (isNaN(parsed.getTime())) {
            return false;
        }
        dateInput.value = formatDateYMD(parsed);
        return true;
    }

    if (dateInput) {
        dateInput.addEventListener('change', () => {
            if (normalizeAndValidateDate()) {
                if (dateForm) dateForm.submit();
            } else {
                // leave value for user to correct
            }
        });
        if (dateForm) {
            dateForm.addEventListener('submit', (e) => {
                if (!normalizeAndValidateDate()) {
                    e.preventDefault();
                    alert('Invalid date. Use YYYY-MM-DD or a recognizable date.');
                }
            });
        }
    }

    // Botones de navegación de fecha: anterior / hoy / siguiente
    const prevBtn = document.getElementById('prev-day-btn');
    const nextBtn = document.getElementById('next-day-btn');

    function changeDateBy(days) {
        if (!dateInput) return;
        const base = dateInput.value ? new Date(dateInput.value) : new Date();
        base.setDate(base.getDate() + days);
        dateInput.value = base.toISOString().split('T')[0];
        if (dateForm) dateForm.submit();
    }

    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.preventDefault(); changeDateBy(-1); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.preventDefault(); changeDateBy(1); });
});
