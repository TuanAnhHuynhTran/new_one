// House Builder — Phase 02.1 (nền tảng): Build Mode, hệ toạ độ lô đất, lưới, ranh giới, công cụ, trạng thái, quyền.
export { HouseBuilder } from './HouseBuilder.jsx';
export { BuildToolbar } from './BuildToolbar.jsx';
export { BuildCamera } from './BuildCamera.jsx';
export { BuildGrid } from './BuildGrid.jsx';
export { PlotBoundary } from './PlotBoundary.jsx';
export { BuildPreview } from './BuildPreview.jsx';
export { BuildSelection } from './BuildSelection.jsx';
export { RoofLayer, roofGeometry } from './RoofMeshes.jsx';
export { validatePlacement, objectAt, STRUCTURE_TYPES } from './BuildValidation.js';
export { useBuildingStore, TOOLS } from './buildingStore.js';
export * from './buildingUtils.js';
