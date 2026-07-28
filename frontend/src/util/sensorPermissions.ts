/**
 * iOS(Safari)는 DeviceMotion/DeviceOrientation 권한 요청이 사용자 제스처(탭) 핸들러 안에서
 * 동기적으로 시작돼야만 허용 팝업을 띄운다. 그래서 게임 화면마다 "센서 켜기" 버튼을 따로
 * 두지 않고, 입장 폼 제출처럼 어차피 누르는 첫 탭에 슬쩍 끼워 넣어 미리 요청해둔다. 이미
 * 답한 뒤에 다시 호출해도 팝업 없이 캐시된 결과를 즉시 돌려주므로 여러 번 불러도 안전하다.
 */

type PermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

async function requestOne(ctor: unknown): Promise<void> {
  const api = ctor as PermissionApi | undefined;
  if (typeof api?.requestPermission !== "function") return;
  try {
    await api.requestPermission();
  } catch {
    // 무시 — 각 화면이 자체적으로 다시 결과를 확인한다.
  }
}

export function requestAllSensorPermissions(): void {
  void requestOne(window.DeviceMotionEvent);
  void requestOne(window.DeviceOrientationEvent);
}
