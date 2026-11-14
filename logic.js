// 방 상태 계산 로직 (순수 함수) — 한 번에 한 방만 다룹니다.
// room: { endAt?: number(ms), flag?: 'in' | 'out' } 또는 null(빈방)
// 반환: 새 room 객체 / null(빈방으로) / undefined(변경 없음)

export const ROOM_COUNT = 18;
export const WARN_SECS = 5 * 60; // 5분 남으면 빨간색 + 알림음 (연장 체크)
export const roomKey = (n) => 'r' + String(n).padStart(2, '0'); // r01 ~ r18
export const roomLabel = (n) => (100 + n) + '호';               // 101호 ~ 118호

export function normalize(room) {
  return {
    endAt: room && typeof room.endAt === 'number' && isFinite(room.endAt) ? room.endAt : null,
    flag: room && (room.flag === 'in' || room.flag === 'out') ? room.flag : null,
  };
}

function pack(r) {
  const out = {};
  if (r.endAt != null) out.endAt = Math.round(r.endAt);
  if (r.flag) out.flag = r.flag;
  return Object.keys(out).length ? out : null;
}

export function applyAction(room, action, now) {
  const r = normalize(room);
  if (action.type === 'add') {
    const ms = Math.round(Number(action.minutes) * 60000);
    if (!ms) return undefined;
    if (ms > 0) {
      // 빈방이면 지금부터 시작. 이미 시간이 있으면(종료된 방 포함) 종료시각에 더함
      // → 종료 후 6분 지난 방에 +50분 = 44분 남음 (초과분 자동 차감)
      r.endAt = (r.endAt == null ? now : r.endAt) + ms;
      r.flag = null; // 시간이 들어가면 입실대기·퇴실대기 해제
    } else {
      if (r.endAt == null || r.endAt <= now) return undefined; // 빈방·종료된 방은 뺄 시간 없음
      r.endAt = Math.max(now, r.endAt + ms);                   // 0 밑으로는 안 내려감
    }
  } else if (action.type === 'flag') {
    r.flag = r.flag === action.flag ? null : action.flag;      // 다시 누르면 해제
    if (r.flag === 'out') r.endAt = null;                      // 퇴실대기: 타이머를 지우고 주황 표시만
  } else if (action.type === 'clear') {
    if (r.endAt == null && !r.flag) return undefined;
    r.endAt = null; r.flag = null;
  } else {
    return undefined;
  }
  return pack(r);
}

// 화면 표시용
export function view(room, now) {
  const r = normalize(room);
  if (r.endAt == null) return { state: 'empty', flag: r.flag, main: r.flag === 'in' ? '입실대기' : r.flag === 'out' ? '퇴실대기' : '빈방', sub: '', secs: null };
  const rem = r.endAt - now;
  const flagText = r.flag === 'in' ? '입실대기' : r.flag === 'out' ? '퇴실대기' : '';
  if (rem <= 0) {
    const over = Math.floor(-rem / 60000);
    return { state: 'ended', flag: r.flag, main: '시간종료', sub: [flagText, over > 0 ? '+' + over + '분 초과' : ''].filter(Boolean).join(' · '), secs: 0 };
  }
  const s = Math.ceil(rem / 1000);
  return { state: s <= WARN_SECS ? 'active warn' : 'active', flag: r.flag, main: Math.ceil(s / 60) + '분', sub: flagText, secs: s };
}
