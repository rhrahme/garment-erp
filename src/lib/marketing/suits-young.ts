/**
 * "Suits (Young)" marketing lookbook - curated suit proposals with fabric
 * specs from the supplier catalogs and outfit pairings. Swatch images resolve
 * through /api/suppliers/loro-piana/images/<fabricNumber>; entries without a
 * digital swatch render a styled pending tile until the bunch is photographed.
 */

export type SketchGarment = {
  color: string;
  pattern?: "plain" | "stripes" | "dots";
  /** Stripe/dot accent color (defaults derived from color). */
  accent?: string;
};

export type OutfitPairing = {
  label: string;
  shirt: SketchGarment;
  tie: SketchGarment;
  /** Omitted when the pairing does not specify shoes. */
  shoes?: SketchGarment;
};

export type LookbookFabric = {
  supplier: string;
  collection: string | null;
  book: string | null;
  article: string;
  composition: string | null;
  weight_gsm: number | null;
  width_cm: number | null;
  /** ERP route serving the high-res swatch; null = photo pending. */
  image_url: string | null;
};

export type LookbookSuit = {
  id: string;
  order_label: string;
  color_name: string;
  headline: string;
  suit: SketchGarment;
  fabric: LookbookFabric;
  similar: LookbookFabric;
  pairings: OutfitPairing[];
};

export const SUITS_YOUNG_TITLE = "Suits - Young Collection";
export const SUITS_YOUNG_SUBTITLE =
  "Three tailored suit proposals with fabric details and styling guidance.";

export const SUITS_YOUNG: LookbookSuit[] = [
  {
    id: "suit-blue",
    order_label: "1st Suit",
    color_name: "Blue",
    headline:
      "A clean medium-blue suit in natural-stretch merino - the most versatile piece a young wardrobe can hold, sharp for business and easy for evenings.",
    suit: { color: "#2e4a7d", pattern: "plain" },
    fabric: {
      supplier: "Loro Piana",
      collection: "Uniti (Collezione 779)",
      book: "779",
      article: "N 779053",
      composition: '100% Superfine Merino Wool "Zelander Natural Stretch"',
      weight_gsm: 250,
      width_cm: 150,
      image_url: null,
    },
    similar: {
      supplier: "Oliani",
      collection: "Collezione 223",
      book: "223",
      article: "Art. 21500.311/130",
      composition: "Super 100's wool",
      weight_gsm: null,
      width_cm: null,
      image_url: null,
    },
    pairings: [
      {
        label: "White shirt, navy tie, black shoes",
        shirt: { color: "#ffffff" },
        tie: { color: "#1b2a4a" },
        shoes: { color: "#181818" },
      },
      {
        label: "Pale blue shirt, patterned tie, black shoes",
        shirt: { color: "#cfe0f0" },
        tie: { color: "#44598a", pattern: "dots", accent: "#e8edf5" },
        shoes: { color: "#181818" },
      },
      {
        label: "Striped blue shirt, burgundy tie",
        shirt: { color: "#eef3fa", pattern: "stripes", accent: "#7ba2cc" },
        tie: { color: "#6e1f2e" },
      },
    ],
  },
  {
    id: "suit-greige",
    order_label: "2nd Suit",
    color_name: "Greige",
    headline:
      "A soft greige in Super 150's wool - lighter in spirit, perfect for daytime events and warm-season tailoring.",
    suit: { color: "#b3a692", pattern: "plain" },
    fabric: {
      supplier: "Loro Piana",
      collection: "Australis (Collezione 707)",
      book: "707",
      article: "N 707080",
      composition: '100% Wool Super 150\'s "Australis"',
      weight_gsm: 250,
      width_cm: 150,
      image_url: "/api/suppliers/loro-piana/images/707080",
    },
    similar: {
      supplier: "Skyline",
      collection: "Book 6301",
      book: "6301",
      article: "43312/160",
      composition: "Super 160's wool",
      weight_gsm: null,
      width_cm: null,
      image_url: null,
    },
    pairings: [
      {
        label: "White striped shirt, olive green tie, brown shoes",
        shirt: { color: "#ffffff", pattern: "stripes", accent: "#a8a294" },
        tie: { color: "#5a6b3a" },
        shoes: { color: "#5c3a24" },
      },
      {
        label: "Blue shirt, tie matching the suit",
        shirt: { color: "#b9cfe4" },
        tie: { color: "#b3a692" },
      },
    ],
  },
  {
    id: "suit-navy-striped",
    order_label: "3rd Suit",
    color_name: "Navy Blue Striped",
    headline:
      "A navy pinstripe in Super 150's wool - the classic statement suit, commanding in meetings and timeless in photographs.",
    suit: { color: "#22304d", pattern: "stripes", accent: "#8fa0bf" },
    fabric: {
      supplier: "Loro Piana",
      collection: "Australis (Collezione 707)",
      book: "707",
      article: "N 707038",
      composition: '100% Wool Super 150\'s "Australis"',
      weight_gsm: 250,
      width_cm: 150,
      image_url: "/api/suppliers/loro-piana/images/707038",
    },
    similar: {
      supplier: "Skyline",
      collection: "Book 6301",
      book: "6301",
      article: "43273/160",
      composition: "Super 160's wool",
      weight_gsm: null,
      width_cm: null,
      image_url: null,
    },
    pairings: [
      {
        label: "Blue shirt, patterned tie",
        shirt: { color: "#c3d6e8" },
        tie: { color: "#31456e", pattern: "dots", accent: "#cfd9ea" },
      },
      {
        label: "White shirt, navy patterned tie or burgundy patterned tie",
        shirt: { color: "#ffffff" },
        tie: { color: "#1b2a4a", pattern: "dots", accent: "#9fb0cf" },
      },
    ],
  },
];
