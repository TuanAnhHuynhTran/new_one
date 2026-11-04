export const MAX_FURNITURE = 80;

// Nhu cầu pet suy giảm theo thời gian kể từ lần cho ăn gần nhất: đói +5/giờ (1 điểm/12 phút), vui -3/giờ (1 điểm/20 phút).
export const HUNGER_MINUTES = 12;
export const HAPPY_MINUTES = 20;

export function petNow(pet, now = Date.now()) {
  const minutes = pet.last_fed_at ? Math.max(0, Math.floor((now - Date.parse(pet.last_fed_at)) / 60000)) : 0;
  return {
    hunger: Math.min(100, pet.hunger + Math.floor(minutes / HUNGER_MINUTES)),
    happiness: Math.max(0, pet.happiness - Math.floor(minutes / HAPPY_MINUTES)),
  };
}
