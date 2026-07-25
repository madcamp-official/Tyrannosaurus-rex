/** Plan.md §7. 티꾸 카테고리별 아이템과 이름 후보. 서버는 이 ID만 허용한다. */

import type { DecorationCategory } from "./domain.js";

export type CatalogItem = { id: string; label: string };

export const DECORATION_CATALOG: Record<DecorationCategory, CatalogItem[]> = {
  HAT: [
    { id: "CROWN", label: "왕관" },
    { id: "EXPLORER_HAT", label: "탐험가 모자" },
    { id: "RIBBON", label: "리본" },
  ],
  GLASSES: [
    { id: "SUNGLASSES", label: "선글라스" },
    { id: "HEART_GLASSES", label: "하트 안경" },
    { id: "MONOCLE", label: "단안경" },
  ],
  NECK: [
    { id: "BOW_TIE", label: "나비넥타이" },
    { id: "NECKLACE", label: "목걸이" },
    { id: "SCARF", label: "스카프" },
  ],
  BACKGROUND: [
    { id: "JUNGLE", label: "정글" },
    { id: "VOLCANO", label: "화산" },
    { id: "MUSEUM", label: "박물관" },
  ],
};

export const NAME_CANDIDATES: CatalogItem[] = [
  { id: "REXY", label: "렉시" },
  { id: "DUSTY", label: "더스티" },
  { id: "BONEHEAD", label: "본헤드" },
  { id: "STOMPY", label: "스톰피" },
  { id: "FOSSILA", label: "포실라" },
  { id: "ROARY", label: "로어리" },
];
