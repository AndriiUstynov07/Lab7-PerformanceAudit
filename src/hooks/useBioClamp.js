import { useLayoutEffect } from 'react';

// Чи обрізаний текст біо (line-clamp), визначаємо лише читанням scrollHeight/clientHeight,
// без тимчасового зняття класу. Спочатку всі читання, потім усі записи — так браузер
// робить один layout, а не два forced reflow на кожну картку.
// Результат залежить лише від ширини картки, а не від позиції скролу,
// тому слухаємо тільки resize (і не частіше за один раз на кадр).
function updateClamp(container) {
  const bios = Array.from(container.querySelectorAll('.tutor-card__bio'));
  const overflowing = bios.map((bio) => bio.scrollHeight > bio.clientHeight + 1);
  bios.forEach((bio, i) => {
    bio.closest('.tutor-card').classList.toggle('has-more', overflowing[i]);
  });
}

export function useBioClamp(containerRef, deps) {
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    updateClamp(container);

    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => updateClamp(container));
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, deps);
}
