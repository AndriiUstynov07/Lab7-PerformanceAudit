// Мікробенчмарк функцій, які «виглядають повільними».
// Запуск з кореня проєкту:  npx vite-node scripts/bench-functions.mjs
// Медіана з 5 запусків кожної функції, Node без throttling.
import { tutors } from '../src/data/tutors.js';
import { getVisibleTutors } from '../src/utils/catalog.js';
import { buildSubjectOptions } from '../src/utils/subjectOptions.js';
import { SUBJECTS } from '../src/data/subjects.js';
import { suggestNames } from '../src/utils/suggest.js';
import { formatPrice } from '../src/utils/format.js';
import { fetchCities, fetchRegions, fetchPriceBounds } from '../src/api/reference.js';
import { matchesQuery } from '../src/utils/text.js';

const F = { subjects: [], city: '', format: 'all', maxPrice: 1200, verifiedOnly: false };
function bench(name, fn, n = 5) {
  const times = [];
  for (let i = 0; i < n; i++) {
    const s = performance.now();
    fn();
    times.push(performance.now() - s);
  }
  times.sort((a, b) => a - b);
  console.log(name.padEnd(48), times[Math.floor(n / 2)].toFixed(2), 'ms');
}

bench('getVisibleTutors (recommended, без запиту)', () => getVisibleTutors(tutors, { query: '', filters: F, sortBy: 'recommended' }));
bench('getVisibleTutors (price-asc, без запиту)', () => getVisibleTutors(tutors, { query: '', filters: F, sortBy: 'price-asc' }));
bench('matchesQuery x2000 ("мат")', () => tutors.filter((t) => matchesQuery(t, 'мат')));
bench('Filters: counts + buildSubjectOptions', () => {
  const counts = tutors.reduce((acc, t) => { t.subjects.forEach((s) => { acc[s] = (acc[s] || 0) + 1; }); return acc; }, {});
  buildSubjectOptions(SUBJECTS, counts);
});
bench('EmptyState: suggestNames("матемтика")', () => suggestNames('матемтика', tutors));
bench('formatPrice x2000', () => { for (const t of tutors) formatPrice(t.pricePerHour); });

const s = performance.now();
const cities = await fetchCities();
await fetchRegions(cities);
await fetchPriceBounds();
console.log('useReferenceData: 3 послідовні await'.padEnd(48), (performance.now() - s).toFixed(2), 'ms');
