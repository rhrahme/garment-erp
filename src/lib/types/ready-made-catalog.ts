export interface ReadyMadeCatalogImage {
  id: string;
  filename: string;
  stored_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string | null;
}

export interface ReadyMadeCatalogSize {
  size: string;
  images: ReadyMadeCatalogImage[];
}

export interface ReadyMadeCatalogGarment {
  id: string;
  brand_id: string;
  brand_label: string;
  article: string;
  garment_type: string;
  images: ReadyMadeCatalogImage[];
  sizes: ReadyMadeCatalogSize[];
  created_at: string;
  updated_at: string;
}

export interface ReadyMadeCatalogFile {
  updated_at: string | null;
  garments: ReadyMadeCatalogGarment[];
}

export const EMPTY_READY_MADE_CATALOG: ReadyMadeCatalogFile = {
  updated_at: null,
  garments: [],
};

/** Standard ready-made size run. Extra sizes can be added per garment. */
export const READY_MADE_DEFAULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
