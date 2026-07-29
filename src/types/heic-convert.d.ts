declare module "heic-convert" {
  type ConvertInput = {
    buffer: Buffer | ArrayBuffer | Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number;
  };

  function convert(input: ConvertInput): Promise<ArrayBuffer>;
  export default convert;
}
