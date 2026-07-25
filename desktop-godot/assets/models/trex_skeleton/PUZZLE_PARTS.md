# T. rex 퍼즐 조각

원본 `skeleton.gltf`의 254개 세부 메시를 퍼즐에서 알아보기 쉬운 13개 대형 조각으로 묶는다.

| ID | 표시 이름 | 포함 범위 |
|---|---|---|
| `SKULL` | 머리뼈 | 두개골, 입천장, 윗니 |
| `JAW` | 아래턱 | 아래턱, 아랫니 |
| `NECK` | 목뼈 | 경추, 목 갈비뼈, atlas/axis |
| `SPINE` | 등뼈 | 흉추 전체 |
| `RIBCAGE` | 갈비뼈 | 좌우 갈비뼈, 복부 갈비뼈, 견갑·오훼골, 쇄골 |
| `PELVIS` | 골반 | 천골과 골반부 |
| `ARM_LEFT` | 왼팔 | 상완, 요골·척골, 손가락 |
| `ARM_RIGHT` | 오른팔 | 상완, 요골·척골, 손가락 |
| `LEG_LEFT` | 왼다리 | 대퇴, 경골·비골, 발과 발가락 |
| `LEG_RIGHT` | 오른다리 | 대퇴, 경골·비골, 발과 발가락 |
| `TAIL_BASE` | 꼬리 시작 | 골반에 가까운 꼬리뼈와 chevron |
| `TAIL_MIDDLE` | 꼬리 중간 | 중간 꼬리뼈와 chevron |
| `TAIL_TIP` | 꼬리 끝 | 끝쪽 꼬리뼈와 chevron |

각 조각은 `TrexPuzzleModel.gd`가 원본 노드들을 하나의 중심 pivot 아래로 재구성한다. 세부 뼈 메시를 합치지 않으므로 완성 상태에서는 원본 골격 형태가 그대로 유지되며, 퍼즐에서는 13개 조각이 각각 독립 이동·회전·스냅된다.

## 확인

Godot에서 `scenes/TrexPuzzlePreview.tscn`을 실행한다.

- `A`: 완성 골격
- `S`: 13개 조각 흩뜨리기
- `←` / `→`: 조각을 하나씩 단독 확인

## 라이선스

원본 모델은 Pomona Pictures의 **Tyrannosaurus rex Stan skeleton**이며 `CC-BY-NC-4.0`이다. 자세한 내용은 같은 폴더의 `LICENSE.txt`를 따른다.
