export type EntityImageKind =
  | "fabric"
  | "garment"
  | "so_line"
  | "inventory_item"
  | "payroll_adjustment";

export interface EntityImage {
  id: string;
  filename: string;
  stored_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string | null;
}

export interface EntityImageAlbum {
  key: string;
  kind: EntityImageKind;
  label: string;
  images: EntityImage[];
  created_at: string;
  updated_at: string;
}

export interface EntityImagesFile {
  updated_at: string | null;
  albums: EntityImageAlbum[];
}

export const EMPTY_ENTITY_IMAGES: EntityImagesFile = {
  updated_at: null,
  albums: [],
};

export interface EntityImageRef {
  key: string;
  kind: EntityImageKind;
  label: string;
}
