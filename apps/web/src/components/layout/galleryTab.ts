/** 项目画廊（概览首页）虚拟标签 —— 不进 editorStore.openFiles */
export const GALLERY_TAB_ID = "__gallery__";

export const galleryTab = {
  id: GALLERY_TAB_ID,
  type: "gallery" as const,
  label: "概览",
  path: "",
};
