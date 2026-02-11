const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host {
      display: block;
      margin-top: 0.5rem;
      touch-action: manipulation;
    }

    .wrap {
      max-width: 410px;
      margin: 0 auto;
    }

    svg {
      display: block;
      width: 100%;
      height: auto;
    }

    .hex {
      fill: var(--board-hex, #dddad4);
      stroke: var(--board-hex-stroke, #090909);
      stroke-width: 5;
      stroke-linejoin: round;
      cursor: pointer;
      transition: transform 90ms ease, filter 90ms ease;
    }

    .hex.center {
      fill: var(--accent, #f6b91a);
    }

    .hex.is-pressed {
      transform: scale(0.96);
      filter: brightness(0.92);
    }

    .letter {
      fill: var(--board-letter, #111111);
      font-size: 44px;
      font-weight: 800;
      text-anchor: middle;
      dominant-baseline: middle;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      text-transform: uppercase;
      user-select: none;
      pointer-events: none;
    }

    @media (max-width: 560px) {
      .wrap {
        max-width: 320px;
      }

      .letter {
        font-size: 36px;
      }
    }
  </style>
  <div class="wrap">
    <svg viewBox="0 0 380 340" role="img" aria-label="Puzzle letter board">
      <polygon class="hex" data-hex="0" data-slot="0"></polygon>
      <polygon class="hex" data-hex="1" data-slot="1"></polygon>
      <polygon class="hex" data-hex="2" data-slot="2"></polygon>
      <polygon class="hex" data-hex="3" data-slot="3"></polygon>
      <polygon class="hex" data-hex="4" data-slot="4"></polygon>
      <polygon class="hex" data-hex="5" data-slot="5"></polygon>
      <polygon class="hex center" data-hex="center" data-slot="center"></polygon>

      <text class="letter" data-slot="0"></text>
      <text class="letter" data-slot="1"></text>
      <text class="letter" data-slot="2"></text>
      <text class="letter" data-slot="3"></text>
      <text class="letter" data-slot="4"></text>
      <text class="letter" data-slot="5"></text>
      <text class="letter" data-slot="center"></text>
    </svg>
  </div>
`;

function hexPoints(cx, cy, r) {
  const h = Math.sqrt(3) * r * 0.5;
  return [
    [cx - r, cy],
    [cx - r * 0.5, cy - h],
    [cx + r * 0.5, cy - h],
    [cx + r, cy],
    [cx + r * 0.5, cy + h],
    [cx - r * 0.5, cy + h]
  ]
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
}

class LetterBoard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.append(template.content.cloneNode(true));
    this.currentLetters = {
      center: "",
      outer: []
    };
    this.layout = {
      r: 56,
      positions: {
        top: { x: 190, y: 72 },
        rightTop: { x: 274, y: 121 },
        rightBottom: { x: 274, y: 219 },
        bottom: { x: 190, y: 268 },
        leftBottom: { x: 106, y: 219 },
        leftTop: { x: 106, y: 121 },
        center: { x: 190, y: 170 }
      }
    };

    this.hexOrder = ["top", "rightTop", "rightBottom", "bottom", "leftBottom", "leftTop"];
    this.drawHexes();
    this.positionLabels();
    this.configureInteractiveHexes();
    this.installInteractionHandlers();
  }

  configureInteractiveHexes() {
    for (const hex of this.shadowRoot.querySelectorAll("polygon.hex")) {
      hex.setAttribute("role", "button");
      hex.setAttribute("tabindex", "0");
    }
  }

  installInteractionHandlers() {
    const clearPressed = () => {
      for (const pressed of this.shadowRoot.querySelectorAll(".hex.is-pressed")) {
        pressed.classList.remove("is-pressed");
      }
    };

    this.shadowRoot.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const interactive = target.closest("polygon.hex");
      if (!interactive) {
        return;
      }

      clearPressed();
      interactive.classList.add("is-pressed");
    });

    this.shadowRoot.addEventListener("pointerup", clearPressed);
    this.shadowRoot.addEventListener("pointercancel", clearPressed);
    this.shadowRoot.addEventListener("pointerleave", clearPressed);

    this.shadowRoot.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const interactive = target.closest("[data-slot]");
      if (!interactive) {
        return;
      }

      const slot = interactive.getAttribute("data-slot");
      if (!slot) {
        return;
      }

      const letter = this.getLetterForSlot(slot);
      if (!letter) {
        return;
      }

      this.dispatchEvent(
        new CustomEvent("letter-select", {
          detail: {
            slot,
            letter
          },
          bubbles: true,
          composed: true
        })
      );
    });

    this.shadowRoot.addEventListener("keydown", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const interactive = target.closest("polygon.hex[data-slot]");
      if (!interactive) {
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();

      const slot = interactive.getAttribute("data-slot");
      if (!slot) {
        return;
      }

      const letter = this.getLetterForSlot(slot);
      if (!letter) {
        return;
      }

      this.dispatchEvent(
        new CustomEvent("letter-select", {
          detail: {
            slot,
            letter
          },
          bubbles: true,
          composed: true
        })
      );
    });
  }

  getLetterForSlot(slot) {
    if (slot === "center") {
      return this.currentLetters.center;
    }

    const index = Number(slot);
    if (!Number.isInteger(index) || index < 0 || index >= this.currentLetters.outer.length) {
      return "";
    }

    return this.currentLetters.outer[index] ?? "";
  }

  drawHexes() {
    for (let idx = 0; idx < this.hexOrder.length; idx += 1) {
      const key = this.hexOrder[idx];
      const center = this.layout.positions[key];
      const polygon = this.shadowRoot.querySelector(`[data-hex=\"${idx}\"]`);
      if (polygon) {
        polygon.setAttribute("points", hexPoints(center.x, center.y, this.layout.r));
      }
    }

    const centerPolygon = this.shadowRoot.querySelector('[data-hex="center"]');
    const centerPoint = this.layout.positions.center;
    centerPolygon.setAttribute("points", hexPoints(centerPoint.x, centerPoint.y, this.layout.r));
  }

  positionLabels() {
    for (let idx = 0; idx < this.hexOrder.length; idx += 1) {
      const key = this.hexOrder[idx];
      const pos = this.layout.positions[key];
      const label = this.shadowRoot.querySelector(`text[data-slot=\"${idx}\"]`);
      if (label) {
        label.setAttribute("x", String(pos.x));
        label.setAttribute("y", String(pos.y));
      }
    }

    const center = this.layout.positions.center;
    const centerLabel = this.shadowRoot.querySelector('text[data-slot="center"]');
    centerLabel.setAttribute("x", String(center.x));
    centerLabel.setAttribute("y", String(center.y));
  }

  setLetters(centerLetter, outerLetters) {
    this.currentLetters = {
      center: centerLetter ?? "",
      outer: [...outerLetters]
    };

    const center = this.shadowRoot.querySelector('text[data-slot="center"]');
    center.textContent = centerLetter;

    outerLetters.forEach((letter, idx) => {
      const slot = this.shadowRoot.querySelector(`text[data-slot="${idx}"]`);
      if (slot) {
        slot.textContent = letter;
      }
    });

    const centerHex = this.shadowRoot.querySelector('polygon.hex[data-slot="center"]');
    if (centerHex) {
      centerHex.setAttribute("aria-label", `Center letter ${String(centerLetter ?? "").toUpperCase()}`);
    }

    for (let idx = 0; idx < outerLetters.length; idx += 1) {
      const hex = this.shadowRoot.querySelector(`polygon.hex[data-slot="${idx}"]`);
      if (!hex) {
        continue;
      }
      hex.setAttribute("aria-label", `Outer letter ${String(outerLetters[idx] ?? "").toUpperCase()}`);
    }
  }
}

customElements.define("letter-board", LetterBoard);
