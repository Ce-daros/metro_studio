/**
 * Metro announcement templates based on Jinan Metro standards.
 * Returns segments: 上车 (boarding), 车中 (in-transit), 下车 (alighting).
 */

const IDLE_MESSAGES = [
  '各位乘客，为了保持良好的乘车环境，请勿在列车内躺卧、吸烟、饮食、丢弃杂物等，使用电子设备时请勿外放声音，谢谢合作。',
  '"畅行泉城"是贯穿每一次进出站的出行承诺。"爱满全程"是服务泉城市民坚守的行动指南。济南地铁运营服务品牌：畅行泉城，爱满全程。',
  '乘客您好，下车时请携带好行李物品，提前至车门处等候，做好下车准备。先下后上，有序乘车。',
  '各位乘客，请为需要帮助的乘客让座，谢谢您的配合。',
]
const APPROACHING_PREFIX = '温馨提示'

function formatLines(lines) {
  if (!lines.length) return ''
  if (lines.length === 1) return lines[0]
  return lines.slice(0, -1).join('、') + '和' + lines[lines.length - 1]
}

function buildTransferText(transferLines, virtualTransferLines) {
  const parts = []
  if (transferLines.length) {
    parts.push(`可换乘${formatLines(transferLines)}`)
  }
  if (virtualTransferLines.length) {
    parts.push(`并可出站换乘${formatLines(virtualTransferLines)}`)
  }
  return parts.join('，')
}

/**
 * Returns { segments: [{ key, label, items }] }
 */
export function buildAnnouncementTexts(
  stationNameZh, stationNameEn, terminalStationZh, terminalStationEn,
  isFirstStation, transferLines = [], virtualTransferLines = [],
  loopDirection = 0
) {
  const transferText = buildTransferText(transferLines, virtualTransferLines)

  // ── 上车段 ──
  const isLoop = !terminalStationZh
  const departurePrefix = isFirstStation
    ? '欢迎乘坐济南地铁。'
    : '列车启动，请站稳扶好。'
  const loopDirText = loopDirection === 0 ? '内环' : '外环'
  const terminalPart = isLoop ? `本次列车为${loopDirText}运行。` : `本次列车终点站：${terminalStationZh}站。`
  let departureZh = `${departurePrefix}${terminalPart}前方到站：${stationNameZh}站。`
  if (transferText) departureZh += transferText + '，'
  departureZh += '下车的乘客请提前做好准备。'

  const boarding = {
    key: 'boarding',
    label: '上车',
    items: [{
      id: 'departure',
      label: isFirstStation ? '列车开车（首站）' : '列车开车',
      textZh: departureZh,
      textEn: isLoop
        ? `Welcome aboard Jinan Metro. This train runs on ${loopDirection === 0 ? 'inner' : 'outer'} loop. Next station: ${stationNameEn}.     `
        : `Welcome aboard Jinan Metro. This train terminates at ${terminalStationEn} station. Next station: ${stationNameEn}.     `,
    }],
  }

  // ── 车中段 ──
  const inTransit = {
    key: 'in-transit',
    label: '车中',
    items: IDLE_MESSAGES.map((msg, i) => ({
      id: `idle-${i + 1}`,
      label: `行驶中提醒${i + 1}`,
      textZh: msg,
      textEn: '',
    })),
  }

  // ── 下车段 ──
  let approachingZh = `${APPROACHING_PREFIX}，${stationNameZh}站就要到了。`
  if (transferText) approachingZh += transferText + '。'
  approachingZh += '列车开启前进方向左侧车门，下车请注意安全。'

  const alighting = {
    key: 'alighting',
    label: '下车',
    items: [{
      id: 'approaching',
      label: '即将到站',
      textZh: approachingZh,
      textEn: `We are approaching ${stationNameEn} station. Doors will open on the left. Please watch your step when get off.`,
    }],
  }

  return { segments: [boarding, inTransit, alighting] }
}
