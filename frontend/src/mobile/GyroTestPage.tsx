import { AimControls } from "./AimControls";

export function GyroTestPage(): JSX.Element {
  return (
    <main className="gyro-test-page">
      <header className="gyro-test-page__header">
        <h1>자이로 조준 테스트</h1>
        <p>전체 게임에 사용되는 것과 동일한 센서 계산으로 조준 방향과 감도를 확인합니다.</p>
        <ol>
          <li>휴대폰을 평소 조준할 자세로 듭니다.</li>
          <li>화면 중앙을 향한 상태에서 영점 잡기를 누릅니다.</li>
          <li>오른쪽 가장자리를 몸쪽으로 비틀어 조준점이 오른쪽으로 가는지 확인합니다.</li>
          <li>왼쪽 가장자리를 몸쪽으로 비틀어 조준점이 왼쪽으로 가는지 확인합니다.</li>
        </ol>
      </header>
      <AimControls practice showDiagnostics autoRequestPermission={false} />
    </main>
  );
}
