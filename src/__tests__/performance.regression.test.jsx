import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Обгортаємо дорогі функції рейтингу шпигунами, залишаючи справжню реалізацію,
// щоб рахувати, скільки разів застосунок їх викликає.
vi.mock('../utils/rating', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    averageRating: vi.fn(actual.averageRating),
    tutorScore: vi.fn(actual.tutorScore),
  };
});

import App from '../App';
import { tutors } from '../data/tutors';
import { averageRating, tutorScore } from '../utils/rating';

describe('Регресія продуктивності каталогу', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('сортування «Рекомендовані» рахує рейтинг не більше одного разу на репетитора', () => {
    const { container } = render(<App />);
    // Кілька рендерів поспіль (введення в пошук) — рейтинг не має перераховуватись.
    const search = container.querySelector('input[aria-label="Пошук репетитора"]');
    fireEvent.change(search, { target: { value: 'м' } });
    fireEvent.change(search, { target: { value: '' } });

    expect(tutorScore.mock.calls.length).toBeLessThanOrEqual(tutors.length);
  }, 60000);

  it('додавання в обрані перерендерює лише змінену картку, а не весь список', () => {
    const { container } = render(<App />);
    const cardsRendered = averageRating.mock.calls.length;
    expect(cardsRendered).toBeGreaterThan(100); // список справді відрендерено

    averageRating.mockClear();
    // (getAllByRole на 2000 картках у jsdom дуже повільний, тому шукаємо за aria-label.)
    fireEvent.click(container.querySelector('button[aria-label="Додати в обрані"]'));

    // Перевіряємо поведінку: картка стала обраною і лічильник оновився.
    expect(container.querySelectorAll('button[aria-label="Прибрати з обраних"]')).toHaveLength(1);
    expect(screen.getByTitle('Обрані репетитори').textContent).toContain('1');
    // Кожен рендер картки рахує її середній рейтинг — рендерів має бути одиниці, а не тисячі.
    expect(averageRating.mock.calls.length).toBeLessThanOrEqual(5);
  }, 60000);
});
