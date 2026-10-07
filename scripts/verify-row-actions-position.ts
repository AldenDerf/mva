import assert from "node:assert/strict";
import { calculateMenuPosition } from "../components/admin/RowActionsMenu";

for (const width of [375, 390, 430, 768, 1440]) {
  const viewport = { width, height: 800 };
  const panel = { width: Math.min(240, width - 16), height: 196 };
  for (const left of [4, Math.floor(width / 2), width - 48]) {
    for (const top of [10, 350, 755]) {
      const trigger = { left, right: left + 44, top, bottom: top + 44 };
      const position = calculateMenuPosition(trigger, panel, viewport);
      assert(position.left >= 8, `${width}px menu crossed left edge`);
      assert(position.left + panel.width <= width - 8, `${width}px menu crossed right edge`);
      assert(position.top >= 8, `${width}px menu crossed top edge`);
      assert(position.top + panel.height <= viewport.height - 8, `${width}px menu crossed bottom edge`);
    }
  }
}

console.log("Row action positioning passed at 375, 390, 430, 768, and 1440px.");
