import { useLayoutEffect } from 'react';

// Чи обрізаний текст біо (line-clamp), визначаємо лише читанням scrollHeight/clientHeight,
// без тимчасового зняття класу. Спочатку всі читання, потім усі записи — так браузер
// робить один layout, а не два forced reflow на кожну картку.
// Якщо вміст картки ще не верстався (content-visibility пропустив його, висота 0),
// картку не чіпаємо — її виміряємо, коли вона стане видимою.
function updateClamp(cards) {
  const overflowing = cards.map((card) => {
    const bio = card.querySelector('.tutor-card__bio');
    if (!bio || bio.clientHeight === 0) return null;
    return bio.scrollHeight > bio.clientHeight + 1;
  });
  cards.forEach((card, i) => {
    if (overflowing[i] !== null) card.classList.toggle('has-more', overflowing[i]);
  });
}

// Картки поза екраном мають content-visibility: auto і не верстаються, тож вимірюємо
// картку тоді, коли браузер вирішив її відрендерити (подія contentvisibilityautostatechange),
// пакетом раз на кадр. Без підтримки цієї події вимірюємо всі картки одним проходом.
const supportsCvEvent = typeof window !== 'undefined' && 'ContentVisibilityAutoStateChangeEvent' in window;

export function useBioClamp(containerRef, deps) {
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const allCards = () => Array.from(container.querySelectorAll('.tutor-card'));

    // Перший екран вимірюється синхронно до відмалювання, як і раніше.
    // Решту карток тут НЕ читаємо: читання розмірів пропущеного вмісту змушує
    // браузер верстати кожну картку окремо. Без підтримки події — вимірюємо всі.
    if (supportsCvEvent) {
      const firstScreen = [];
      for (const card of allCards()) {
        if (card.getBoundingClientRect().top > window.innerHeight) break;
        firstScreen.push(card);
      }
      updateClamp(firstScreen);
    } else {
      updateClamp(allCards());
    }

    let frame = 0;
    const queue = new Set();
    const flush = () => {
      frame = 0;
      const cards = Array.from(queue);
      queue.clear();
      updateClamp(cards);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const onVisibilityState = (event) => {
      if (!event.target.classList.contains('tutor-card')) return;
      if (event.skipped) {
        rendered.delete(event.target);
        return;
      }
      rendered.add(event.target);
      queue.add(event.target);
      schedule();
    };

    // Ширина картки змінилась — перевіряємо картки, вміст яких зараз відрендерений
    // (не частіше разу на кадр). Решта переміряються, коли з'являться на екрані.
    const rendered = new Set();
    const onResize = () => {
      (supportsCvEvent ? Array.from(rendered) : allCards()).forEach((card) => queue.add(card));
      schedule();
    };

    if (supportsCvEvent) {
      // Подія не спливає, тому слухаємо у фазі захоплення на контейнері.
      container.addEventListener('contentvisibilityautostatechange', onVisibilityState, true);
    }
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener('contentvisibilityautostatechange', onVisibilityState, true);
      window.removeEventListener('resize', onResize);
    };
  }, deps);
}
