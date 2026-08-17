import type { OutfitPairing, SketchGarment } from "@/lib/marketing/suits-young";

function darken(hex: string, amount: number): string {
  const value = hex.replace("#", "");
  const num = parseInt(value, 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function garmentFill(garment: SketchGarment, patternId: string): string {
  return garment.pattern && garment.pattern !== "plain" ? `url(#${patternId})` : garment.color;
}

function GarmentPattern({ garment, id }: { garment: SketchGarment; id: string }) {
  if (!garment.pattern || garment.pattern === "plain") return null;
  const accent = garment.accent ?? darken(garment.color, -40);
  if (garment.pattern === "stripes") {
    return (
      <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill={garment.color} />
        <line x1="1.5" y1="0" x2="1.5" y2="6" stroke={accent} strokeWidth="1" />
      </pattern>
    );
  }
  return (
    <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill={garment.color} />
      <circle cx="2" cy="2" r="1" fill={garment.accent ?? "#e6e6e6"} />
      <circle cx="6" cy="6" r="1" fill={garment.accent ?? "#e6e6e6"} />
    </pattern>
  );
}

/**
 * Flat fashion sketch of a full outfit: jacket + trousers in the suit fabric,
 * visible shirt and tie in the V opening, optional shoes. Pure SVG so it
 * prints crisply at any size.
 */
export function OutfitSketch({
  suit,
  pairing,
  className,
}: {
  suit: SketchGarment;
  pairing: OutfitPairing;
  className?: string;
}) {
  const uid = `${pairing.label.replace(/[^a-z0-9]/gi, "").slice(0, 18)}-${suit.color.replace("#", "")}`;
  const suitPatternId = `suit-${uid}`;
  const shirtPatternId = `shirt-${uid}`;
  const tiePatternId = `tie-${uid}`;
  const suitFill = garmentFill(suit, suitPatternId);
  const shirtFill = garmentFill(pairing.shirt, shirtPatternId);
  const tieFill = garmentFill(pairing.tie, tiePatternId);
  const outline = darken(suit.color, 40);

  return (
    <svg viewBox="0 0 140 224" className={className} role="img" aria-label={pairing.label}>
      <defs>
        <GarmentPattern garment={suit} id={suitPatternId} />
        <GarmentPattern garment={pairing.shirt} id={shirtPatternId} />
        <GarmentPattern garment={pairing.tie} id={tiePatternId} />
      </defs>

      {/* shirt behind the jacket V */}
      <polygon points="50,32 90,32 70,116" fill={shirtFill} stroke="#b9c2cc" strokeWidth="0.8" />
      {/* shirt collar */}
      <polygon points="59,32 70,44 63,50" fill={pairing.shirt.color} stroke="#aab4bf" strokeWidth="0.8" />
      <polygon points="81,32 70,44 77,50" fill={pairing.shirt.color} stroke="#aab4bf" strokeWidth="0.8" />
      {/* tie */}
      <polygon points="65,44 75,44 70,54" fill={tieFill} stroke={darken(pairing.tie.color, 30)} strokeWidth="0.7" />
      <polygon points="66,52 74,52 77,96 70,108 63,96" fill={tieFill} stroke={darken(pairing.tie.color, 30)} strokeWidth="0.7" />

      {/* sleeves */}
      <polygon points="36,36 22,64 18,120 32,124 42,58" fill={suitFill} stroke={outline} strokeWidth="1" />
      <polygon points="104,36 118,64 122,120 108,124 98,58" fill={suitFill} stroke={outline} strokeWidth="1" />

      {/* jacket body panels (leave the V open) */}
      <path
        d="M 50 32 L 36 36 Q 30 84 34 136 L 66 136 L 66 118 L 50 32 Z"
        fill={suitFill}
        stroke={outline}
        strokeWidth="1.2"
      />
      <path
        d="M 90 32 L 104 36 Q 110 84 106 136 L 74 136 L 74 118 L 90 32 Z"
        fill={suitFill}
        stroke={outline}
        strokeWidth="1.2"
      />
      {/* lapels */}
      <path d="M 50 32 L 70 44 L 60 100 L 50 62 Z" fill={suitFill} stroke={outline} strokeWidth="1" />
      <path d="M 90 32 L 70 44 L 80 100 L 90 62 Z" fill={suitFill} stroke={outline} strokeWidth="1" />
      {/* buttons */}
      <circle cx="68" cy="114" r="1.6" fill={outline} />
      <circle cx="68" cy="124" r="1.6" fill={outline} />

      {/* trousers */}
      <polygon points="46,136 66,136 64,204 46,204" fill={suitFill} stroke={outline} strokeWidth="1" />
      <polygon points="74,136 94,136 94,204 76,204" fill={suitFill} stroke={outline} strokeWidth="1" />
      {/* crease lines */}
      <line x1="55" y1="142" x2="55" y2="200" stroke={outline} strokeWidth="0.5" opacity="0.5" />
      <line x1="85" y1="142" x2="85" y2="200" stroke={outline} strokeWidth="0.5" opacity="0.5" />

      {/* shoes (only when the pairing specifies them) */}
      {pairing.shoes ? (
        <>
          <path
            d="M 44 204 L 64 204 L 64 210 Q 62 216 52 216 L 38 216 Q 36 210 44 204 Z"
            fill={pairing.shoes.color}
            stroke={darken(pairing.shoes.color, 30)}
            strokeWidth="0.8"
          />
          <path
            d="M 76 204 L 96 204 Q 104 210 102 216 L 88 216 Q 78 216 76 210 Z"
            fill={pairing.shoes.color}
            stroke={darken(pairing.shoes.color, 30)}
            strokeWidth="0.8"
          />
        </>
      ) : null}
    </svg>
  );
}
