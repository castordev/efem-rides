// Obtener posiciones desde Django
const positions = JSON.parse(document.getElementById('positions-data').textContent);
const center = 1100 / 2;

window.addEventListener('DOMContentLoaded', () => {
    for (let planet in positions) {
        const el = document.getElementById(planet);
        if (!el) continue;

        const pos = positions[planet];
        const cx = center + pos.radius * Math.cos(pos.angle);
        const cy = center + pos.radius * Math.sin(pos.angle);

        el.setAttribute('cx', cx);
        el.setAttribute('cy', cy);
    }

    // Botón para establecer fecha de hoy
    const todayBtn = document.getElementById('today-btn');
    const dateInput = document.getElementById('date');
    const dateForm = document.getElementById('date-form');
    
    if (todayBtn && dateInput) {
        todayBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const today = new Date().toISOString().split('T')[0];
            dateInput.value = today;
            // Enviar el formulario después de establecer la fecha
            if (dateForm) {
                dateForm.submit();
            }
        });
    }

    // Botón para abrir el calendario nativo (si el navegador lo soporta)
    const calendarBtn = document.getElementById('calendar-btn');
    if (calendarBtn && dateInput) {
        calendarBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Preferir showPicker() en navegadores compatibles
            if (typeof dateInput.showPicker === 'function') {
                try {
                    dateInput.showPicker();
                    return;
                } catch (err) {
                    // fallthrough
                }
            }
            // Fallback: intentar abrir el picker incluso si el input es readonly
            const wasReadonly = dateInput.hasAttribute('readonly');
            if (wasReadonly) dateInput.removeAttribute('readonly');
            try {
                dateInput.focus();
                dateInput.click();
            } catch (err) {
                // no-op
            } finally {
                if (wasReadonly) dateInput.setAttribute('readonly', '');
            }
        });
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
