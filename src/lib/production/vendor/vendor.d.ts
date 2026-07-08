declare module "@/lib/production/vendor/qrcode-generator.js" {
  export interface QrCodeModel {
    addData(data: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
  }
  /** typeNumber 0 = auto-detect version; ecl one of 'L' | 'M' | 'Q' | 'H'. */
  const qrcode: (typeNumber: number, errorCorrectionLevel: "L" | "M" | "Q" | "H") => QrCodeModel;
  export default qrcode;
}

declare module "@/lib/production/vendor/opentype.js" {
  export interface OtPath {
    toPathData(decimals?: number): string;
  }
  export interface OtFont {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    tables: { os2?: { sCapHeight?: number } };
    getPath(text: string, x: number, y: number, fontSize: number): OtPath;
    getAdvanceWidth(text: string, fontSize: number): number;
  }
  export function parse(buffer: ArrayBuffer): OtFont;
}
